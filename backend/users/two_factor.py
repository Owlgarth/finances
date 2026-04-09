import base64
import hashlib
import io
import secrets

import pyotp
import qrcode
import qrcode.image.svg
from django.conf import settings
from django.db import transaction as db_transaction
from django.utils import timezone

from common.crypto import decrypt_secret, encrypt_secret
from common.exceptions import AuthenticationError, NotFoundError, ValidationError
from users.exceptions import TwoFactorNotEnabledError
from users.models import User, UserTwoFactor
from workspaces.exceptions import (
    WorkspaceMemberAdminInsufficientError,
    WorkspaceMemberCannotResetOwnPasswordError,
    WorkspaceMemberNotFoundError,
    WorkspaceOwnerPasswordResetError,
)
from workspaces.models import Role, WorkspaceMember


def _generate_qr_code_svg(user: User, secret: str) -> str:
    totp_uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user.email, issuer_name='Monie')
    qr = qrcode.QRCode(image_factory=qrcode.image.svg.SvgImage)
    qr.add_data(totp_uri)
    qr.make(fit=True)
    img = qr.make_image()
    buf = io.BytesIO()
    img.save(buf)
    svg_bytes = buf.getvalue()
    return f'data:image/svg+xml;base64,{base64.b64encode(svg_bytes).decode()}'


def _generate_recovery_codes(count: int | None = None) -> list[str]:
    if count is None:
        count = settings.TWO_FACTOR_RECOVERY_CODE_COUNT
    codes = []
    for _ in range(count):
        raw = ''.join(
            secrets.choice(settings.TWO_FACTOR_RECOVERY_CHARSET)
            for _ in range(settings.TWO_FACTOR_RECOVERY_CODE_LENGTH)
        )
        codes.append(f'{raw[:4]}-{raw[4:]}')
    return codes


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _try_recovery_code(twofa: UserTwoFactor, code: str) -> bool:
    code_hash = _hash_code(code)
    for i, stored_hash in enumerate(twofa.backup_codes):
        if stored_hash == code_hash:
            twofa.backup_codes.pop(i)
            twofa.last_used_at = timezone.now()
            twofa.save(update_fields=['backup_codes', 'last_used_at', 'updated_at'])
            return True
    return False


class TwoFactorService:
    @staticmethod
    def setup(user: User) -> dict:
        twofa = UserTwoFactor.objects.filter(user=user).first()
        if twofa and twofa.is_enabled:
            raise ValidationError('Two-factor authentication is already enabled')

        secret = pyotp.random_base32()
        encrypted = encrypt_secret(secret)

        if twofa:
            twofa.encrypted_secret = encrypted
            twofa.is_enabled = False
            twofa.save(update_fields=['encrypted_secret', 'is_enabled', 'updated_at'])
        else:
            UserTwoFactor.objects.create(user=user, encrypted_secret=encrypted, is_enabled=False)

        qr_svg = _generate_qr_code_svg(user, secret)
        return {'qr_code_svg': qr_svg, 'secret_key': secret}

    @staticmethod
    def verify_and_enable(user: User, code: str) -> dict:
        twofa = UserTwoFactor.objects.filter(user=user, is_enabled=False).first()
        if not twofa:
            raise NotFoundError('No pending two-factor setup found')

        secret = decrypt_secret(twofa.encrypted_secret)
        totp = pyotp.TOTP(secret)
        if not totp.verify(code, valid_window=1):
            raise AuthenticationError('Invalid verification code')

        recovery_codes = _generate_recovery_codes()
        twofa.backup_codes = [_hash_code(c) for c in recovery_codes]
        twofa.is_enabled = True
        twofa.save(update_fields=['backup_codes', 'is_enabled', 'updated_at'])
        return {'recovery_codes': recovery_codes}

    @staticmethod
    def disable(user: User) -> None:
        twofa = UserTwoFactor.objects.filter(user=user, is_enabled=True).first()
        if not twofa:
            raise NotFoundError('Two-factor authentication is not enabled')
        twofa.delete()

    @staticmethod
    def get_status(user: User) -> dict:
        twofa = UserTwoFactor.objects.filter(user=user).first()
        if not twofa or not twofa.is_enabled:
            return {'enabled': False, 'remaining_recovery_codes': 0, 'last_used_at': None}
        return {
            'enabled': True,
            'remaining_recovery_codes': len(twofa.backup_codes),
            'last_used_at': twofa.last_used_at.isoformat() if twofa.last_used_at else None,
        }

    @staticmethod
    def regenerate_codes(user: User) -> dict:
        twofa = UserTwoFactor.objects.filter(user=user, is_enabled=True).first()
        if not twofa:
            raise NotFoundError('Two-factor authentication is not enabled')

        recovery_codes = _generate_recovery_codes()
        twofa.backup_codes = [_hash_code(c) for c in recovery_codes]
        twofa.save(update_fields=['backup_codes', 'updated_at'])
        return {'recovery_codes': recovery_codes}

    @staticmethod
    @db_transaction.atomic
    def verify_code(user: User, code: str) -> bool:
        """Verify a TOTP or recovery code. Uses select_for_update to prevent concurrent recovery code reuse."""
        try:
            twofa = UserTwoFactor.objects.select_for_update().get(user=user, is_enabled=True)
        except UserTwoFactor.DoesNotExist:
            return False

        secret = decrypt_secret(twofa.encrypted_secret)
        totp = pyotp.TOTP(secret)
        if totp.verify(code, valid_window=1):
            twofa.last_used_at = timezone.now()
            twofa.save(update_fields=['last_used_at', 'updated_at'])
            return True

        if _try_recovery_code(twofa, code):
            return True

        return False

    @staticmethod
    def admin_reset(admin: User, workspace_id: int, target_user_id: int, current_role: str) -> dict:
        target_member = WorkspaceMember.objects.filter(
            workspace_id=workspace_id,
            user_id=target_user_id,
        ).first()

        if not target_member:
            raise WorkspaceMemberNotFoundError()

        if target_user_id == admin.id:
            raise WorkspaceMemberCannotResetOwnPasswordError()

        if target_member.role == Role.OWNER:
            raise WorkspaceOwnerPasswordResetError()

        if current_role == Role.ADMIN and target_member.role == Role.ADMIN:
            raise WorkspaceMemberAdminInsufficientError('reset 2FA of')

        twofa = UserTwoFactor.objects.filter(user_id=target_user_id).first()
        if not twofa or not twofa.is_enabled:
            raise TwoFactorNotEnabledError()
        twofa.delete()

        return {'message': 'Two-factor authentication has been reset', 'user_id': target_user_id}

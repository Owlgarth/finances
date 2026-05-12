import json
import logging
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError
from django.conf import settings

logger = logging.getLogger(__name__)


class StorageService:
    """Service class for S3-compatible object storage operations.

    All methods check settings.USE_S3_STORAGE first and return None/no-op
    when S3 storage is disabled, making the service safe to call in any
    environment.
    """

    # --- Private methods (placed before public methods per AGENTS.md) ---

    @staticmethod
    def _get_client():
        """Create and return an S3 client configured for the storage backend."""
        return boto3.client(
            's3',
            endpoint_url=settings.S3_ENDPOINT_URL,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )

    @staticmethod
    def _is_enabled():
        """Check if S3 storage is enabled."""
        return getattr(settings, 'USE_S3_STORAGE', False)

    @staticmethod
    def _get_bucket_names():
        """Return the list of configured bucket names."""
        return [
            settings.S3_BUCKET_STATIC,
            settings.S3_BUCKET_MEDIA,
            settings.S3_BUCKET_LOGS,
        ]

    @staticmethod
    def _set_public_read_policy(client, bucket_name: str) -> None:
        """Apply a bucket policy allowing anonymous GET access to all objects."""
        policy = {
            'Version': '2012-10-17',
            'Statement': [
                {
                    'Effect': 'Allow',
                    'Principal': {'AWS': ['*']},
                    'Action': ['s3:GetObject'],
                    'Resource': [f'arn:aws:s3:::{bucket_name}/*'],
                }
            ],
        }
        try:
            client.put_bucket_policy(Bucket=bucket_name, Policy=json.dumps(policy))
            logger.info('Set public-read policy on bucket: %s', bucket_name)
        except ClientError:
            logger.exception('Failed to set policy on bucket: %s', bucket_name)

    @staticmethod
    def _ensure_private_policy(client, bucket_name: str) -> None:
        """Remove any bucket policy, ensuring all access requires authentication."""
        try:
            client.delete_bucket_policy(Bucket=bucket_name)
            logger.info('Ensured private policy on bucket: %s', bucket_name)
        except ClientError:
            logger.exception('Failed to clear policy on bucket: %s', bucket_name)

    @staticmethod
    def _get_url_client():
        """Create an S3 client configured for generating browser-accessible presigned URLs.

        Uses the external URL so generated URLs contain a hostname the browser can resolve.
        This is safe because generate_presigned_url() is a purely local cryptographic
        operation — no network call is made.
        """
        external_url = getattr(settings, 'S3_EXTERNAL_URL', settings.S3_ENDPOINT_URL)
        return boto3.client(
            's3',
            endpoint_url=external_url,
            aws_access_key_id=settings.S3_ACCESS_KEY,
            aws_secret_access_key=settings.S3_SECRET_KEY,
        )

    # --- Public methods ---

    @staticmethod
    def ensure_buckets_exist():
        """Create storage buckets if they don't exist. Idempotent."""
        if not StorageService._is_enabled():
            logger.info('S3 storage disabled, skipping bucket initialization')
            return

        client = StorageService._get_client()
        for bucket_name in StorageService._get_bucket_names():
            try:
                client.head_bucket(Bucket=bucket_name)
                logger.info('Bucket already exists: %s', bucket_name)
            except ClientError:
                try:
                    client.create_bucket(Bucket=bucket_name)
                    logger.info('Created bucket: %s', bucket_name)
                except ClientError:
                    logger.exception('Failed to create bucket: %s', bucket_name)

        # Public-read policy on static bucket so browsers can fetch CSS/JS without auth
        StorageService._set_public_read_policy(client, settings.S3_BUCKET_STATIC)
        # Explicitly enforce private access on media and logs buckets (defense-in-depth)
        StorageService._ensure_private_policy(client, settings.S3_BUCKET_MEDIA)
        StorageService._ensure_private_policy(client, settings.S3_BUCKET_LOGS)

    @staticmethod
    def save_file(bucket_name: str, key: str, content, content_type: str = 'application/octet-stream') -> str | None:
        """Upload a file to the specified bucket. Returns the object key, or None if disabled."""
        if not StorageService._is_enabled():
            return None

        client = StorageService._get_client()
        try:
            client.put_object(Bucket=bucket_name, Key=key, Body=content, ContentType=content_type)
            return key
        except ClientError:
            logger.exception('Failed to save file %s to bucket %s', key, bucket_name)
            return None

    @staticmethod
    def get_presigned_url(bucket_name: str, key: str, expiry: int = 3600) -> str | None:
        """Generate a presigned URL for private file access. Returns None if disabled."""
        if not StorageService._is_enabled():
            return None

        client = StorageService._get_url_client()
        try:
            return client.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket_name, 'Key': key},
                ExpiresIn=expiry,
            )
        except ClientError:
            logger.exception('Failed to generate presigned URL for %s/%s', bucket_name, key)
            return None

    @staticmethod
    def delete_file(bucket_name: str, key: str) -> bool:
        """Delete a file from the specified bucket. Returns True on success."""
        if not StorageService._is_enabled():
            return False

        client = StorageService._get_client()
        try:
            client.delete_object(Bucket=bucket_name, Key=key)
            return True
        except ClientError:
            logger.exception('Failed to delete file %s from bucket %s', key, bucket_name)
            return False

    @staticmethod
    def write_log(log_name: str, content: str) -> str | None:
        """Write a log entry to the logs bucket. Returns the object key, or None if disabled.

        Key format: {log_name}/{YYYY}/{MM}/{DD}/{HHMMSSffffff}.log
        """
        if not StorageService._is_enabled():
            return None

        now = datetime.now(timezone.utc)
        key = f'{log_name}/{now.strftime("%Y/%m/%d/%H%M%S%f")}.log'

        client = StorageService._get_client()
        try:
            client.put_object(
                Bucket=settings.S3_BUCKET_LOGS,
                Key=key,
                Body=content.encode('utf-8'),
                ContentType='text/plain',
            )
            return key
        except ClientError:
            logger.exception('Failed to write log %s', log_name)
            return None

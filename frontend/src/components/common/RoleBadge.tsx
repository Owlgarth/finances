import { useTranslation } from 'react-i18next'
import type { Role } from '../../types'

interface RoleBadgeProps {
  role?: Role
}

/** Inline workspace-role chip (owner/admin/member/viewer) shown next to
 *  workspace rows in the WorkspaceSelector dropdown and the mobile More
 *  sheet. Renders nothing when the role is missing. The raw role value is
 *  an API enum; only the displayed name is translated, with the value as
 *  fallback so an unknown role still renders. */
export default function RoleBadge({ role }: RoleBadgeProps) {
  const { t } = useTranslation('members')
  if (!role) return null
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-muted text-text-muted">
      {t(`roles.${role}`, { defaultValue: role })}
    </span>
  )
}

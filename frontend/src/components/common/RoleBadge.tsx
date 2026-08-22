import type { Role } from '../../types'

interface RoleBadgeProps {
  role?: Role
}

/** Inline workspace-role chip (owner/admin/member/viewer) shown next to
 *  workspace rows in the WorkspaceSelector dropdown and the mobile More
 *  sheet. Renders nothing when the role is missing. */
export default function RoleBadge({ role }: RoleBadgeProps) {
  if (!role) return null
  return (
    <span className="text-xs px-1.5 py-0.5 rounded-sm bg-surface-muted text-text-muted">
      {role}
    </span>
  )
}

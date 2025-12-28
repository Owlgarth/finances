import { useMemo } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from '../contexts/AuthContext';
import type { WorkspaceMember } from '../types';

export function usePermissions() {
  const { userRole, currentMembership } = useWorkspace();
  const { user } = useAuth();

  return useMemo(() => {
    // Role checks
    const isOwner = userRole === 'owner';
    const isAdmin = userRole === 'admin';
    const isMember = userRole === 'member';
    const isViewer = userRole === 'viewer';

    // Permission groups
    const canManageBudgetAccounts = isOwner || isAdmin;
    const canManageBudgetData = isOwner || isAdmin || isMember;
    const canManageMembers = isOwner || isAdmin;

    // Utility function to check if user has any of the specified roles
    const hasRole = (roles: string[]): boolean => {
      return userRole ? roles.includes(userRole) : false;
    };

    // Check if current user can edit a specific member
    const canEditMember = (member: WorkspaceMember): boolean => {
      if (!user || member.user_id === user.id) return false; // Can't edit self
      if (member.role === 'owner') return false; // Can't edit owner
      if (isOwner) return true; // Owner can edit anyone except owner
      if (isAdmin) {
        // Admin can only edit member/viewer
        return member.role === 'member' || member.role === 'viewer';
      }
      return false;
    };

    // Check if current user can reset password for a member
    const canResetPasswordFor = (member: WorkspaceMember): boolean => {
      if (!user || member.user_id === user.id) return false;
      if (member.role === 'owner') return false;
      if (isOwner) return true;
      if (isAdmin) {
        return member.role === 'member' || member.role === 'viewer';
      }
      return false;
    };

    return {
      // Role checks
      isOwner,
      isAdmin,
      isMember,
      isViewer,
      userRole,

      // Permission checks
      canManageBudgetAccounts,
      canManageBudgetData,
      canManageMembers,

      // Utility functions
      hasRole,
      canEditMember,
      canResetPasswordFor,

      // Current membership info
      currentMembership,
    };
  }, [userRole, currentMembership, user]);
}

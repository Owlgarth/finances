import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './AuthContext';
import { workspacesApi, workspaceMembersApi } from '../api/client';
import type { Workspace, WorkspaceMember } from '../types';

interface WorkspaceContextType {
  workspace: Workspace | null;
  currentMembership: WorkspaceMember | null;
  userRole: 'owner' | 'admin' | 'member' | 'viewer' | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();

  // Fetch current workspace
  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
    refetch: refetchWorkspace
  } = useQuery({
    queryKey: ['workspace-current'],
    queryFn: workspacesApi.getCurrent,
    enabled: isAuthenticated,
  });

  // Fetch workspace members to get current user's role
  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
    refetch: refetchMembers
  } = useQuery({
    queryKey: ['workspace-members', workspace?.id],
    queryFn: () => workspaceMembersApi.list(workspace!.id),
    enabled: !!workspace?.id,
  });

  // Find current user's membership
  const currentMembership = members?.find(m => m.user_id === user?.id) || null;
  const userRole = currentMembership?.role || null;

  const refetch = () => {
    refetchWorkspace();
    refetchMembers();
  };

  return (
    <WorkspaceContext.Provider
      value={{
        workspace: workspace || null,
        currentMembership,
        userRole,
        isLoading: workspaceLoading || membersLoading,
        error: (workspaceError || membersError) as Error | null,
        refetch,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (context === undefined) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}

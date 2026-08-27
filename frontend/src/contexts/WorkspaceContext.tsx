import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { useAuth } from './AuthContext';
import { workspacesApi, workspaceMembersApi } from '../api/client';
import type { Workspace, WorkspaceMember, Role } from '../types';

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  currentMembership: WorkspaceMember | null;
  userRole: Role | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  switchWorkspace: (id: number) => Promise<void>;
  createWorkspace: (name: string, currencyCodes?: string[]) => Promise<Workspace>;
  deleteWorkspace: (id: number) => Promise<void>;
  updateWorkspace: (data: { name: string }) => Promise<Workspace>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

// Queries that are NOT workspace-scoped: the signed-in user and the parser
// deployment do not change on a workspace switch, so their caches stay valid.
// `user-preferences` must specifically NOT be removed — it is observed at the
// app root and its fallback would flash the font (UserPreferencesContext).
const userScopedQueryKeys = new Set(['user-preferences', '2fa-status', 'extraction-config']);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const {
    data: workspace,
    isLoading: workspaceLoading,
    error: workspaceError,
    refetch: refetchWorkspace,
  } = useQuery({
    queryKey: ['workspace-current'],
    queryFn: workspacesApi.getCurrent,
    enabled: isAuthenticated,
    retry: (failureCount, error) => {
      const status = (error as AxiosError)?.response?.status
      if (status === 400 || status === 403) return false
      return failureCount < 3
    },
  });

  const {
    data: workspaces = [],
    isLoading: workspacesLoading,
    refetch: refetchWorkspaces,
  } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
    enabled: isAuthenticated,
    retry: (failureCount, error) => {
      const status = (error as AxiosError)?.response?.status
      if (status === 401) return false
      return failureCount < 3
    },
  });

  const {
    data: members,
    isLoading: membersLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: ['workspace-members', workspace?.id],
    queryFn: () => workspaceMembersApi.list(workspace!.id),
    enabled: !!workspace?.id,
  });

  const currentMembership = members?.find(m => m.user_id === user?.id) || null;
  const userRole = currentMembership?.role || null;

  const clearWorkspaceScopedQueries = () => {
    // Every data query is workspace-scoped but keyed without the workspace id
    // (the API always serves the *current* workspace), so a switch/create/
    // delete makes them all stale at once. Drop the whole workspace cache
    // instead of invalidating a hardcoded key list — that list had already
    // drifted (six dead keys, a dozen missing ones) and re-drifts whenever a
    // query is added. Removal refetches mounted queries immediately and
    // remounts the rest fresh. Forgetting a future *user-scoped* key in the
    // keep-set only costs one extra refetch (safe direction); the old list
    // drifted towards stale data (the bug this fixes).
    queryClient.removeQueries({
      predicate: (query) => !userScopedQueryKeys.has(query.queryKey[0] as string),
    });
  };

  const switchMutation = useMutation({
    mutationFn: (workspaceId: number) => workspacesApi.switch(workspaceId),
    onSuccess: () => {
      clearWorkspaceScopedQueries();
      localStorage.removeItem('owlgarth_selected_account');
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; currency_codes?: string[] }) => workspacesApi.create(data),
    onSuccess: () => {
      clearWorkspaceScopedQueries();
      localStorage.removeItem('owlgarth_selected_account');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (workspaceId: number) => workspacesApi.delete(workspaceId),
    onSuccess: () => {
      clearWorkspaceScopedQueries();
      localStorage.removeItem('owlgarth_selected_account');
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string }) => workspacesApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-current'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  const switchWorkspace = async (id: number) => {
    await switchMutation.mutateAsync(id);
  };

  const createWorkspace = async (name: string, currencyCodes?: string[]): Promise<Workspace> => {
    const ws = await createMutation.mutateAsync({ name, currency_codes: currencyCodes });
    return ws;
  };

  const deleteWorkspace = async (id: number) => {
    await deleteMutation.mutateAsync(id);
  };

  const updateWorkspace = async (data: { name: string }): Promise<Workspace> => {
    return await updateMutation.mutateAsync(data);
  };

  const refetch = () => {
    refetchWorkspace();
    refetchWorkspaces();
    // refetch() bypasses `enabled` — calling it without a workspace would run
    // the queryFn and dereference `workspace!.id` on null (TypeError).
    if (workspace?.id) {
      refetchMembers();
    }
  };

  const filteredWorkspaceError = (() => {
    if (!workspaceError) return null;
    const status = (workspaceError as AxiosError)?.response?.status;
    if (status === 400 || status === 403) return null;
    return workspaceError;
  })();

  return (
    <WorkspaceContext.Provider
      value={{
        workspace: workspace || null,
        workspaces,
        currentMembership,
        userRole,
        isLoading: workspaceLoading || workspacesLoading || (!!workspace?.id && membersLoading),
        error: (filteredWorkspaceError || membersError) as Error | null,
        refetch,
        switchWorkspace,
        createWorkspace,
        deleteWorkspace,
        updateWorkspace,
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

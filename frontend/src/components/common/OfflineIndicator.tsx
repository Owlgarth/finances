import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useOfflineSync } from '../../hooks/useOfflineSync';

export const OfflineIndicator = () => {
  const isOnline = useOnlineStatus();
  const { isSyncing, syncProgress, hasPendingChanges, pendingCount, syncQueue } = useOfflineSync();

  // Don't show anything if online and no pending changes
  if (isOnline && !hasPendingChanges && !isSyncing) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Offline indicator */}
      {!isOnline && (
        <div className="bg-yellow-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 mb-2">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3" />
            </svg>
            <div>
              <div className="font-semibold">You're offline</div>
              {hasPendingChanges && (
                <div className="text-sm">
                  {pendingCount} change{pendingCount !== 1 ? 's' : ''} will sync when online
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Syncing progress */}
      {isSyncing && (
        <div className="bg-blue-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
          <div>
            <div className="font-semibold">Syncing changes...</div>
            <div className="text-sm">
              {syncProgress.current} of {syncProgress.total}
            </div>
          </div>
        </div>
      )}

      {/* Pending changes indicator with manual sync button */}
      {isOnline && hasPendingChanges && !isSyncing && (
        <div className="bg-green-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
          <div className="flex-1">
            <div className="font-semibold">You're back online</div>
            <div className="text-sm">
              {pendingCount} change{pendingCount !== 1 ? 's' : ''} ready to sync
            </div>
          </div>
          <button
            onClick={() => syncQueue()}
            className="bg-white text-green-600 px-3 py-1 rounded font-semibold hover:bg-green-50 transition-colors"
          >
            Sync Up
          </button>
        </div>
      )}
    </div>
  );
};

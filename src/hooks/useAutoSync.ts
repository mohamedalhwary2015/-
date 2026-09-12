import { useState, useEffect, useCallback, useRef } from 'react';
import { DatabaseSchema } from '../types';
import { executeAutoSync, getSyncStatus, SyncStatusInfo, getPendingQueue } from '../storage/syncManager';

export function useAutoSync(db: DatabaseSchema) {
  const [syncInfo, setSyncInfo] = useState<SyncStatusInfo>(getSyncStatus);
  const dbRef = useRef(db);
  dbRef.current = db;

  useEffect(() => {
    const handleStatusChanged = (e: CustomEvent<SyncStatusInfo>) => {
      setSyncInfo(e.detail);
    };

    window.addEventListener('saflaq_sync_status_changed' as any, handleStatusChanged);
    return () => {
      window.removeEventListener('saflaq_sync_status_changed' as any, handleStatusChanged);
    };
  }, []);

  const triggerSync = useCallback(async (trigger: 'auto' | 'manual' | 'change' = 'manual') => {
    return await executeAutoSync(dbRef.current, trigger);
  }, []);

  // Periodic background check if online
  useEffect(() => {
    const interval = setInterval(() => {
      if (navigator.onLine && getPendingQueue().length > 0) {
        triggerSync('auto');
      }
    }, 30000); // every 30 seconds

    return () => clearInterval(interval);
  }, [triggerSync]);

  return {
    isSyncing: syncInfo.status === 'syncing',
    syncStatus: syncInfo.status,
    pendingCount: syncInfo.pendingCount,
    lastSyncTime: syncInfo.lastSyncTime,
    lastError: syncInfo.lastError,
    triggerSync
  };
}

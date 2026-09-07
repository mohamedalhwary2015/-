import { useState, useEffect, useCallback, useRef } from 'react';
import { AppDatabase, SyncStatus } from '../types';
import { 
  executeAutoSync, 
  getAutoSyncConfig, 
  hasPendingChanges, 
  checkRealInternetConnection,
  fetchAndApplyServerDatabase,
  getPendingQueueCount,
  getOrCreateDeviceId
} from '../storage/syncManager';

export interface AutoSyncState {
  isOnline: boolean;
  syncStatus: SyncStatus;
  syncMessage: string | null;
  lastSyncTime: string | null;
  isSyncing: boolean;
  hasPending: boolean;
  pendingQueueCount: number;
  deviceId: string;
  reconnectNotification: { message: string; timestamp: string } | null;
  dismissNotification: () => void;
  triggerManualSync: () => Promise<void>;
}

export function useAutoSync(db: AppDatabase): AutoSyncState {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
    return getAutoSyncConfig().lastSyncStatus === 'success' ? 'synced' : 'pending';
  });
  const [syncMessage, setSyncMessage] = useState<string | null>(() => {
    return getAutoSyncConfig().lastSyncMessage;
  });
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => {
    return getAutoSyncConfig().lastSyncTime;
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [hasPending, setHasPending] = useState<boolean>(() => hasPendingChanges());
  const [pendingQueueCount, setPendingQueueCount] = useState<number>(() => {
    return getAutoSyncConfig().pendingQueueCount || 0;
  });
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [reconnectNotification, setReconnectNotification] = useState<{
    message: string;
    timestamp: string;
  } | null>(null);

  const dbRef = useRef(db);
  dbRef.current = db;

  const performSync = useCallback(
    async (trigger: 'reconnect' | 'manual' | 'periodic' | 'change') => {
      const config = getAutoSyncConfig();
      if (!config.enabled && trigger !== 'manual') return;

      setIsSyncing(true);
      setSyncStatus('syncing');

      try {
        const result = await executeAutoSync(dbRef.current, trigger);
        setSyncStatus(result.status);
        setSyncMessage(result.message);
        setLastSyncTime(result.timestamp);
        setHasPending(hasPendingChanges());

        if (result.success && trigger === 'reconnect') {
          setReconnectNotification({
            message: `تم استعادة الاتصال بالإنترنت — تم التخزين والتحديث التلقائي بنجاح (${result.totalRecords} سجل).`,
            timestamp: new Date().toLocaleTimeString('ar-EG'),
          });
        }
      } catch (err) {
        setSyncStatus('error');
        setSyncMessage('تعذر إتمام المزامنة التلقائية.');
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  // Manual Trigger
  const triggerManualSync = useCallback(async () => {
    setIsSyncing(true);
    setSyncStatus('syncing');
    setSyncMessage('جارٍ المزامنة وسحب أحدث البيانات من السحابة...');
    try {
      // 1. Pull latest from server first
      const pullRes = await fetchAndApplyServerDatabase(dbRef.current);
      // 2. Then push/sync
      const currentDb = pullRes.database || dbRef.current;
      await performSync('manual');
    } catch {
      await performSync('manual');
    }
  }, [performSync]);

  const dismissNotification = useCallback(() => {
    setReconnectNotification(null);
  }, []);

  // Monitor Network Events and Pull Server Data
  useEffect(() => {
    let checkInterval: any = null;

    const handleOnline = async () => {
      setIsOnline(true);
      const realOnline = await checkRealInternetConnection();
      if (realOnline) {
        setIsOnline(true);
        // Instant pull & push upon reconnect!
        await fetchAndApplyServerDatabase(dbRef.current);
        performSync('reconnect');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSyncStatus('offline');
      setSyncMessage('غير متصل بالإنترنت - يتم الحفظ محلياً بأمان وسيتزامن تلقائياً فور عودة الاتصال.');
    };

    const handleCustomSyncStatus = (e: Event) => {
      const customEvent = e as CustomEvent<{ status: SyncStatus; message: string; timestamp: string }>;
      if (customEvent.detail) {
        setSyncStatus(customEvent.detail.status);
        setSyncMessage(customEvent.detail.message);
      }
      getPendingQueueCount().then(setPendingQueueCount).catch(() => {});
    };

    const handleQueueChanged = () => {
      getPendingQueueCount().then(setPendingQueueCount).catch(() => {});
    };

    // When the user focuses the window or tab becomes visible, check for updates from other devices
    const handleVisibilityOrFocus = async () => {
      getPendingQueueCount().then(setPendingQueueCount).catch(() => {});
      if (document.visibilityState === 'visible' && navigator.onLine) {
        const real = await checkRealInternetConnection();
        if (real) {
          fetchAndApplyServerDatabase(dbRef.current);
        }
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('saflaq:sync-status', handleCustomSyncStatus);
    window.addEventListener('saflaq:queue-changed', handleQueueChanged);
    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    // Initial check: pull latest records from server on app startup!
    const initCheck = async () => {
      getPendingQueueCount().then(setPendingQueueCount).catch(() => {});
      const online = await checkRealInternetConnection();
      setIsOnline(online);
      if (online) {
        // Pull latest updates from server immediately so other devices' data is visible!
        await fetchAndApplyServerDatabase(dbRef.current);
        performSync('periodic');
      } else {
        setSyncStatus('offline');
      }
    };
    initCheck();

    // Check for updates every 25 seconds if online
    checkInterval = setInterval(async () => {
      getPendingQueueCount().then(setPendingQueueCount).catch(() => {});
      if (navigator.onLine) {
        const real = await checkRealInternetConnection();
        setIsOnline(real);
        if (real) {
          // Silently pull updates if another device made edits
          await fetchAndApplyServerDatabase(dbRef.current);
        }
      }
    }, 25000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('saflaq:sync-status', handleCustomSyncStatus);
      window.removeEventListener('saflaq:queue-changed', handleQueueChanged);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [performSync]);

  // Auto-dismiss notification after 8 seconds
  useEffect(() => {
    if (reconnectNotification) {
      const timer = setTimeout(() => {
        setReconnectNotification(null);
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [reconnectNotification]);

  return {
    isOnline,
    syncStatus,
    syncMessage,
    lastSyncTime,
    isSyncing,
    hasPending,
    pendingQueueCount,
    deviceId,
    reconnectNotification,
    dismissNotification,
    triggerManualSync,
  };
}

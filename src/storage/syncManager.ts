import { AppDatabase, AutoSyncConfig, SyncLogEntry, SyncQueueItem, SyncStatus } from '../types';

const SYNC_CONFIG_KEY = 'saflaq_autosync_config_v1';
const SYNC_LOGS_KEY = 'saflaq_autosync_logs_v1';
const PENDING_CHANGES_KEY = 'saflaq_pending_changes_flag';
const DEVICE_ID_KEY = 'saflaq_device_id';
const LOCAL_SYNC_QUEUE_KEY = 'saflaq_sync_queue_v1';

// Global Factory Reset Lock to block concurrent Auto Sync
let _factoryResetInProgress = false;

export function isFactoryResetInProgress(): boolean {
  return _factoryResetInProgress;
}

export function setFactoryResetInProgress(inProgress: boolean): void {
  _factoryResetInProgress = inProgress;
}

/**
 * Completely purges all pending sync queues in both LocalStorage and IndexedDB
 */
export async function clearAllSyncQueueAndLocks(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LOCAL_SYNC_QUEUE_KEY);
    localStorage.removeItem(PENDING_CHANGES_KEY);
  } catch (e) {
    console.warn('Error clearing localStorage sync queue:', e);
  }

  try {
    const db = await openDurableDB();
    if (db) {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          resolve();
        };
      });
    }
  } catch (e) {
    console.warn('Error clearing IndexedDB queue:', e);
  }

  saveAutoSyncConfig({
    pendingQueueCount: 0,
    lastSyncMessage: 'تم تفريغ طابور المزامنة بنجاح',
  });
  notifyPendingQueueCountChanged();
}

// ==========================================
// 0. Device ID and Transaction ID Generation
// ==========================================
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'DEV-SERVER-NODE';
  try {
    let devId = localStorage.getItem(DEVICE_ID_KEY);
    if (!devId) {
      const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
      const timePart = Date.now().toString(36).toUpperCase();
      devId = `DEV-SAFLAQ-${timePart}-${rand}`;
      localStorage.setItem(DEVICE_ID_KEY, devId);
    }
    return devId;
  } catch {
    return 'DEV-SAFLAQ-CLIENT';
  }
}

export function generateGlobalTxId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tx-${crypto.randomUUID()}`;
  }
  const time = Date.now();
  const rand1 = Math.random().toString(36).substring(2, 9);
  const rand2 = Math.random().toString(36).substring(2, 9);
  return `tx-${time}-${rand1}-${rand2}`;
}

const DEFAULT_SYNC_CONFIG: AutoSyncConfig = {
  enabled: true,
  syncOnReconnect: true,
  periodicSyncMinutes: 5,
  durableIndexedDB: true,
  cloudServerSync: true,
  lastSyncTime: null,
  lastSyncStatus: null,
  lastSyncMessage: null,
  totalRecordsLastSynced: 0,
  deviceId: typeof window !== 'undefined' ? getOrCreateDeviceId() : undefined,
  pendingQueueCount: 0,
  lastSyncToken: null,
};

// ==========================================
// 1. IndexedDB Durable Storage Implementation
// ==========================================
const IDB_NAME = 'SaflaqHealthOffice_DurableStore';
const IDB_VERSION = 2;
const SNAPSHOTS_STORE = 'snapshots';
const QUEUE_STORE = 'sync_queue';

function openDurableDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB غير مدعوم في هذا المتصفح'));
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SNAPSHOTS_STORE)) {
        const store = db.createObjectStore(SNAPSHOTS_STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const qStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'syncId' });
        qStore.createIndex('status', 'status', { unique: false });
        qStore.createIndex('transactionId', 'transactionId', { unique: true });
        qStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Local Storage Fallback for Sync Queue
function getLocalQueueFallback(): SyncQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_SYNC_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalQueueFallback(items: SyncQueueItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_SYNC_QUEUE_KEY, JSON.stringify(items));
  } catch {}
}

export async function enqueueSyncItem(
  item: Omit<SyncQueueItem, 'syncId' | 'createdAt' | 'status' | 'retryCount'> & { syncId?: string }
): Promise<SyncQueueItem> {
  const syncId = item.syncId || `sync-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const queueItem: SyncQueueItem = {
    ...item,
    syncId,
    createdAt: now,
    status: 'pending',
    retryCount: 0,
  };

  // 1. Save in local storage fallback
  const fallbackList = getLocalQueueFallback();
  fallbackList.push(queueItem);
  saveLocalQueueFallback(fallbackList);
  markHasPendingChanges(true);

  // 2. Save in IndexedDB if available
  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.put(queueItem);
    await new Promise((resolve) => {
      tx.oncomplete = () => {
        idb.close();
        resolve(true);
      };
      tx.onerror = () => {
        idb.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('IDB Queue enqueue notice:', err);
  }

  notifyPendingQueueCountChanged();
  return queueItem;
}

export async function getPendingQueue(): Promise<SyncQueueItem[]> {
  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const request = store.getAll();

    const items = await new Promise<SyncQueueItem[]>((resolve) => {
      request.onsuccess = () => {
        idb.close();
        resolve(request.result || []);
      };
      request.onerror = () => {
        idb.close();
        resolve([]);
      };
    });

    if (items && items.length > 0) {
      return items.filter((i) => i.status === 'pending' || i.status === 'failed');
    }
  } catch {}

  // Fallback to localStorage
  const fallback = getLocalQueueFallback();
  return fallback.filter((i) => i.status === 'pending' || i.status === 'failed');
}

export async function getPendingQueueCount(): Promise<number> {
  const items = await getPendingQueue();
  return items.length;
}

export async function removeQueueItem(syncId: string): Promise<void> {
  // 1. Remove from local storage fallback
  const fallbackList = getLocalQueueFallback().filter((i) => i.syncId !== syncId);
  saveLocalQueueFallback(fallbackList);

  // 2. Remove from IndexedDB
  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    store.delete(syncId);
    await new Promise((resolve) => {
      tx.oncomplete = () => {
        idb.close();
        resolve(true);
      };
      tx.onerror = () => {
        idb.close();
        resolve(false);
      };
    });
  } catch {}

  notifyPendingQueueCountChanged();
}

export async function markQueueItemFailed(syncId: string, errorMsg: string): Promise<void> {
  const fallbackList = getLocalQueueFallback().map((i) => {
    if (i.syncId === syncId) {
      return { ...i, status: 'failed' as const, retryCount: (i.retryCount || 0) + 1, lastError: errorMsg };
    }
    return i;
  });
  saveLocalQueueFallback(fallbackList);

  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    const req = store.get(syncId);
    req.onsuccess = () => {
      if (req.result) {
        const updated = {
          ...req.result,
          status: 'failed',
          retryCount: (req.result.retryCount || 0) + 1,
          lastError: errorMsg,
        };
        store.put(updated);
      }
    };
    await new Promise((resolve) => {
      tx.oncomplete = () => {
        idb.close();
        resolve(true);
      };
      tx.onerror = () => {
        idb.close();
        resolve(false);
      };
    });
  } catch {}

  notifyPendingQueueCountChanged();
}

function notifyPendingQueueCountChanged() {
  if (typeof window !== 'undefined') {
    getPendingQueueCount().then((count) => {
      saveAutoSyncConfig({ pendingQueueCount: count });
      window.dispatchEvent(
        new CustomEvent('saflaq:queue-count-changed', {
          detail: { count },
        })
      );
    });
  }
}

export async function saveDurableSnapshotToIDB(
  dbData: AppDatabase,
  trigger: string
): Promise<boolean> {
  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(SNAPSHOTS_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOTS_STORE);

    const now = new Date().toISOString();
    const id = `snap-${Date.now()}`;
    const totalRecords = 
      (dbData.dispenseRecords?.length || 0) +
      (dbData.lateRegistrations?.length || 0) +
      (dbData.supplyTransactions?.length || 0);

    const snapshotRecord = {
      id,
      timestamp: now,
      trigger,
      totalRecords,
      officeName: dbData.officeSettings?.officeName || 'مكتب صحة سفلاق',
      version: dbData.version || 1,
      data: dbData,
    };

    store.put(snapshotRecord);

    // Maintain only the last 20 snapshots to avoid bloating
    const index = store.index('timestamp');
    const cursorReq = index.openCursor(null, 'prev');
    let count = 0;

    cursorReq.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
      if (cursor) {
        count++;
        if (count > 20) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        idb.close();
        resolve(true);
      };
      tx.onerror = () => {
        idb.close();
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('Failed to store snapshot in IndexedDB:', err);
    return false;
  }
}

export async function getDurableSnapshotsList(): Promise<
  Array<{ id: string; timestamp: string; trigger: string; totalRecords: number }>
> {
  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(SNAPSHOTS_STORE, 'readonly');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');

    const results: Array<{ id: string; timestamp: string; trigger: string; totalRecords: number }> = [];

    return new Promise((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < 15) {
          results.push({
            id: cursor.value.id,
            timestamp: cursor.value.timestamp,
            trigger: cursor.value.trigger,
            totalRecords: cursor.value.totalRecords,
          });
          cursor.continue();
        } else {
          idb.close();
          resolve(results);
        }
      };
      request.onerror = () => {
        idb.close();
        resolve([]);
      };
    });
  } catch (err) {
    return [];
  }
}

export async function getStoredSnapshotsFromIDB(): Promise<
  Array<{ id: string; timestamp: string; trigger: string; totalRecords: number; data: AppDatabase }>
> {
  try {
    const idb = await openDurableDB();
    const tx = idb.transaction(SNAPSHOTS_STORE, 'readonly');
    const store = tx.objectStore(SNAPSHOTS_STORE);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const results: Array<{ id: string; timestamp: string; trigger: string; totalRecords: number; data: AppDatabase }> = [];

    return new Promise((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor && results.length < 20) {
          results.push({
            id: cursor.value.id,
            timestamp: cursor.value.timestamp,
            trigger: cursor.value.trigger,
            totalRecords: cursor.value.totalRecords,
            data: cursor.value.data,
          });
          cursor.continue();
        } else {
          idb.close();
          resolve(results);
        }
      };
      request.onerror = () => {
        idb.close();
        resolve([]);
      };
    });
  } catch (err) {
    return [];
  }
}

// ==========================================
// 2. Config & Log Management
// ==========================================
export function getAutoSyncConfig(): AutoSyncConfig {
  if (typeof window === 'undefined') return DEFAULT_SYNC_CONFIG;
  try {
    const raw = localStorage.getItem(SYNC_CONFIG_KEY);
    if (!raw) {
      localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(DEFAULT_SYNC_CONFIG));
      return DEFAULT_SYNC_CONFIG;
    }
    return { ...DEFAULT_SYNC_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SYNC_CONFIG;
  }
}

export function saveAutoSyncConfig(updates: Partial<AutoSyncConfig>): AutoSyncConfig {
  const current = getAutoSyncConfig();
  const merged = { ...current, ...updates };
  if (typeof window !== 'undefined') {
    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(merged));
  }
  return merged;
}

export function getSyncLogs(): SyncLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_LOGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addSyncLog(entry: Omit<SyncLogEntry, 'id' | 'timestamp'>): SyncLogEntry {
  const logs = getSyncLogs();
  const newEntry: SyncLogEntry = {
    ...entry,
    id: 'log-' + Date.now(),
    timestamp: new Date().toISOString(),
  };

  const updated = [newEntry, ...logs].slice(0, 40); // keep latest 40 entries
  if (typeof window !== 'undefined') {
    localStorage.setItem(SYNC_LOGS_KEY, JSON.stringify(updated));
  }
  return newEntry;
}

export function clearSyncLogs(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(SYNC_LOGS_KEY);
  }
}

// Flag indicating unsynced offline changes
export function markHasPendingChanges(pending = true): void {
  if (typeof window !== 'undefined') {
    if (pending) {
      localStorage.setItem(PENDING_CHANGES_KEY, 'true');
    } else {
      localStorage.removeItem(PENDING_CHANGES_KEY);
    }
  }
}

export function hasPendingChanges(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PENDING_CHANGES_KEY) === 'true';
}

// ==========================================
// 3. Active Connection Probe
// ==========================================
export async function checkRealInternetConnection(): Promise<boolean> {
  if (typeof window === 'undefined') return true;
  if (!navigator.onLine) return false;

  try {
    // Attempt rapid ping with short timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    const res = await fetch('/api/health?t=' + Date.now(), {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    // Fallback: If /api/health is unavailable or in static mode, assume online if navigator.onLine is true
    return navigator.onLine;
  }
}

// ==========================================
// 3.5. Queue Flusher & Incremental Change Puller
// ==========================================
export async function flushSyncQueue(currentDb: AppDatabase): Promise<{
  success: boolean;
  processedCount: number;
  message: string;
}> {
  try {
    const pendingItems = await getPendingQueue();
    if (pendingItems.length === 0) {
      return { success: true, processedCount: 0, message: 'لا توجد حركات معلقة في الطابور' };
    }

    const deviceId = getOrCreateDeviceId();
    const response = await fetch('/api/sync/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      body: JSON.stringify({
        items: pendingItems,
        deviceId,
      }),
    });

    if (!response.ok) {
      throw new Error(`خطأ في معالجة الحركات على الخادم (${response.status})`);
    }

    const resData = await response.json();
    if (!resData.success) {
      throw new Error(resData.message || 'فشلت معالجة الحركات');
    }

    // Process queue clearance based on server response
    let clearedCount = 0;
    for (const result of resData.results || []) {
      if (result.status === 'processed' || result.status === 'already_processed') {
        await removeQueueItem(result.syncId);
        clearedCount++;
      } else {
        await markQueueItemFailed(result.syncId, result.message || 'خطأ غير محدد');
      }
    }

    // Update local database stocks with server-approved source of truth
    if (resData.approvedStocks) {
      currentDb.stocks = resData.approvedStocks;
    }

    // Mark processed records as synced locally
    const processedTxIds = new Set(
      (resData.results || [])
        .filter((r: any) => r.status === 'processed' || r.status === 'already_processed')
        .map((r: any) => r.transactionId)
    );

    (currentDb.dispenseRecords || []).forEach((r) => {
      if (r.transactionId && processedTxIds.has(r.transactionId)) {
        r.syncStatus = 'synced';
        r.syncedAt = new Date().toISOString();
      }
    });

    (currentDb.supplyTransactions || []).forEach((s) => {
      if (s.transactionId && processedTxIds.has(s.transactionId)) {
        s.syncStatus = 'synced';
        s.syncedAt = new Date().toISOString();
      }
    });

    (currentDb.lateRegistrations || []).forEach((l) => {
      if (l.transactionId && processedTxIds.has(l.transactionId)) {
        l.syncStatus = 'synced';
        l.syncedAt = new Date().toISOString();
      }
    });

    if (typeof window !== 'undefined') {
      localStorage.setItem('saflaq_health_office_db_v1', JSON.stringify(currentDb));
    }

    return {
      success: true,
      processedCount: clearedCount,
      message: `تم اعتماد ومزامنة ${clearedCount} حركة بنجاح مع الخادم المركزي`,
    };
  } catch (err: any) {
    console.warn('flushSyncQueue warning:', err);
    return { success: false, processedCount: 0, message: err.message || 'تعذر إرسال طابور المزامنة' };
  }
}

export async function pullIncrementalChanges(currentDb: AppDatabase): Promise<{
  success: boolean;
  hasChanges: boolean;
  message: string;
}> {
  try {
    const config = getAutoSyncConfig();
    const url = config.lastSyncToken
      ? `/api/sync/changes?since=${encodeURIComponent(config.lastSyncToken)}`
      : '/api/sync/changes';

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) {
      return { success: false, hasChanges: false, message: 'تعذر سحب التحديثات من الخادم' };
    }

    const data = await response.json();
    if (!data.success) {
      return { success: false, hasChanges: false, message: data.message || 'خطأ في جلب التحديثات' };
    }

    let modified = false;
    const boundaryTime = currentDb.resetBoundary ? new Date(currentDb.resetBoundary.resetAt).getTime() : 0;
    const isAfterReset = (r: any) => {
      if (boundaryTime <= 0) return true;
      const t = new Date(r.updatedAt || r.syncedAt || r.createdAt || r.date || 0).getTime();
      return t > boundaryTime;
    };

    // If server sent full database (e.g. initial connection or post-reset full sync)
    if (data.fullSync && data.database) {
      const merged = mergeClientWithServer(currentDb, data.database);
      Object.assign(currentDb, merged);
      modified = true;
    } else if (data.hasChanges && data.changes) {
      // Non-destructive incremental merge respecting Reset Boundary and Tombstones
      const {
        dispenseRecords = [],
        supplyTransactions = [],
        lateRegistrations = [],
        syncTombstones = [],
      } = data.changes;

      // 0. Merge Sync Tombstones
      if (!currentDb.syncTombstones) currentDb.syncTombstones = [];
      const localTombstoneMap = new Map<string, any>();
      currentDb.syncTombstones.forEach((t) => {
        if (t && (t.recordId || t.transactionId)) {
          localTombstoneMap.set(t.recordId || t.transactionId, t);
        }
      });
      syncTombstones.forEach((t: any) => {
        if (t && (t.recordId || t.transactionId)) {
          const key = t.recordId || t.transactionId;
          if (!localTombstoneMap.has(key)) {
            localTombstoneMap.set(key, t);
            modified = true;
          }
        }
      });
      currentDb.syncTombstones = Array.from(localTombstoneMap.values());
      const tombstoneIds = new Set<string>();
      currentDb.syncTombstones.forEach((t) => {
        if (t.recordId) tombstoneIds.add(t.recordId);
        if (t.transactionId) tombstoneIds.add(t.transactionId);
      });

      const isTombstoned = (r: any) => {
        return Boolean((r.id && tombstoneIds.has(r.id)) || (r.transactionId && tombstoneIds.has(r.transactionId)));
      };

      // Purge any local dispense record that has a tombstone
      if (currentDb.dispenseRecords && currentDb.dispenseRecords.some(isTombstoned)) {
        currentDb.dispenseRecords = currentDb.dispenseRecords.filter((r) => !isTombstoned(r));
        modified = true;
      }

      // 1. Merge Dispenses
      const validDispenses = dispenseRecords.filter((r: any) => isAfterReset(r) && !isTombstoned(r));
      if (validDispenses.length > 0) {
        const dMap = new Map();
        (currentDb.dispenseRecords || []).forEach((r) => dMap.set(r.id, r));
        validDispenses.forEach((r: any) => {
          if (!dMap.has(r.id)) {
            dMap.set(r.id, r);
          } else {
            const existing = dMap.get(r.id);
            const incomingTime = new Date(r.updatedAt || r.createdAt || 0).getTime();
            const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
            if (incomingTime >= existingTime) {
              dMap.set(r.id, { ...existing, ...r });
            }
          }
        });
        currentDb.dispenseRecords = Array.from(dMap.values());
        modified = true;
      }

      // 2. Merge Supplies
      const validSupplies = supplyTransactions.filter(isAfterReset);
      if (validSupplies.length > 0) {
        const sMap = new Map();
        (currentDb.supplyTransactions || []).forEach((s) => sMap.set(s.id, s));
        validSupplies.forEach((s: any) => {
          if (!sMap.has(s.id)) {
            sMap.set(s.id, s);
          }
        });
        currentDb.supplyTransactions = Array.from(sMap.values());
        modified = true;
      }

      // 3. Merge Late Registrations
      const validLateRegs = lateRegistrations.filter(isAfterReset);
      if (validLateRegs.length > 0) {
        const lMap = new Map();
        (currentDb.lateRegistrations || []).forEach((l) => lMap.set(l.id, l));
        validLateRegs.forEach((l: any) => {
          if (!lMap.has(l.id)) {
            lMap.set(l.id, l);
          } else {
            const existing = lMap.get(l.id);
            const stepMap = new Map();
            (existing.trackingHistory || []).forEach((st: any, idx: number) =>
              stepMap.set(st.id || `s-${idx}`, st)
            );
            (l.trackingHistory || []).forEach((st: any, idx: number) =>
              stepMap.set(st.id || `l-${idx}`, st)
            );
            lMap.set(l.id, {
              ...existing,
              ...l,
              trackingHistory: Array.from(stepMap.values()),
            });
          }
        });
        currentDb.lateRegistrations = Array.from(lMap.values());
        modified = true;
      }
    }

    // Calculate and audit stock balances mathematically from actual verified transactions
    if (modified && currentDb.stocks) {
      const openBalances = currentDb.openingBalances;
      for (const key of Object.keys(currentDb.stocks) as (keyof typeof currentDb.stocks)[]) {
        const openingQty = openBalances?.items?.[key]?.openingQuantity !== undefined
          ? Number(openBalances.items[key].openingQuantity)
          : Number(currentDb.stocks[key]?.openingStock || 0);

        const totalReceived = (currentDb.supplyTransactions || [])
          .filter((s) => s.stockCategory === key)
          .reduce((sum, s) => sum + Number(s.quantity || 0), 0);

        let totalDispensed = 0;
        (currentDb.dispenseRecords || []).forEach((d) => {
          (d.itemsDeducted || []).forEach((it) => {
            if (it.stockCategory === key) {
              totalDispensed += Number(it.quantity || 0);
            }
          });
        });

        const damaged = Number(currentDb.stocks[key]?.damagedOrCancelled || 0);
        currentDb.stocks[key] = {
          ...currentDb.stocks[key],
          openingStock: openingQty,
          totalReceived,
          totalDispensed,
          currentStock: Math.max(0, openingQty + totalReceived - totalDispensed - damaged),
          lastUpdated: new Date().toISOString(),
        };
      }
    }

    if (data.syncToken) {
      saveAutoSyncConfig({ lastSyncToken: data.syncToken });
    }

    if (modified && typeof window !== 'undefined') {
      localStorage.setItem('saflaq_health_office_db_v1', JSON.stringify(currentDb));
      window.dispatchEvent(
        new CustomEvent('saflaq:database-synced', {
          detail: { database: currentDb, source: 'incremental_sync' },
        })
      );
    }

    return {
      success: true,
      hasChanges: modified,
      message: modified ? 'تم استلام وتطبيق الحركات الجديدة من الخادم' : 'لا توجد حركات جديدة على الخادم',
    };
  } catch (err: any) {
    console.warn('pullIncrementalChanges warning:', err);
    return { success: false, hasChanges: false, message: err.message || 'خطأ في المزامنة التدريجية' };
  }
}

// ==========================================
// 4. Core Auto-Sync & Auto-Storage Engine
// ==========================================
export interface AutoSyncResult {
  success: boolean;
  status: SyncStatus;
  message: string;
  timestamp: string;
  totalRecords: number;
  serverSaved: boolean;
  idbSaved: boolean;
}

export async function executeAutoSync(
  dbData: AppDatabase,
  trigger: 'reconnect' | 'manual' | 'periodic' | 'change'
): Promise<AutoSyncResult> {
  const config = getAutoSyncConfig();
  const now = new Date().toISOString();
  const totalRecords =
    (dbData.dispenseRecords?.length || 0) +
    (dbData.lateRegistrations?.length || 0) +
    (dbData.supplyTransactions?.length || 0);

  // If a Factory Reset is currently running, strictly abort Auto Sync to avoid re-injecting zombie data
  if (isFactoryResetInProgress()) {
    console.log('[AutoSync] Blocked execution because a factory reset is actively in progress.');
    return {
      success: false,
      status: 'pending',
      message: 'تم تعليق المزامنة التلقائية لوجود عملية تصفير شامل جارية',
      timestamp: now,
      totalRecords,
      serverSaved: false,
      idbSaved: false,
    };
  }

  // If auto-sync is explicitly turned off and not triggered manually
  if (!config.enabled && trigger !== 'manual') {
    return {
      success: false,
      status: 'pending',
      message: 'التخزين التلقائي معطل في الإعدادات',
      timestamp: now,
      totalRecords,
      serverSaved: false,
      idbSaved: false,
    };
  }

  // Check network
  const isOnline = await checkRealInternetConnection();
  if (!isOnline) {
    markHasPendingChanges(true);
    // Even offline, store a durable IndexedDB snapshot
    let idbOk = false;
    if (config.durableIndexedDB) {
      idbOk = await saveDurableSnapshotToIDB(dbData, `${trigger}_offline`);
    }

    const pendingCount = await getPendingQueueCount();
    const offlineMsg = pendingCount > 0
      ? `وضع عدم الاتصال (Offline) نشط. توجد ${pendingCount} حركات مسجلة محلياً في الطابور وسيتم إرسالها تلقائياً فور توفر الإنترنت.`
      : 'لا يوجد اتصال بالإنترنت حالياً. تم حفظ كافة البيانات محلياً وسيتم التخزين التلقائي فور عودة الاتصال.';

    saveAutoSyncConfig({
      lastSyncStatus: 'pending',
      lastSyncMessage: offlineMsg,
      pendingQueueCount: pendingCount,
    });

    addSyncLog({
      trigger,
      status: 'failed',
      recordCount: totalRecords,
      details: offlineMsg,
    });

    notifySyncStatusChanged('offline', offlineMsg);

    return {
      success: false,
      status: 'offline',
      message: offlineMsg,
      timestamp: now,
      totalRecords,
      serverSaved: false,
      idbSaved: idbOk,
    };
  }

  // Network is available!
  notifySyncStatusChanged('syncing', 'جارٍ إرسال الحركات ومزامنة الأرصدة مع الخادم المركزي...');

  let serverSaved = false;
  let idbSaved = false;

  // Step 1: Flush pending transaction queue to server (Idempotent execution)
  const queueResult = await flushSyncQueue(dbData);
  if (queueResult.success) {
    serverSaved = true;
  }

  // Step 2: Pull any incremental changes made by other devices or servers
  await pullIncrementalChanges(dbData);

  // Step 3: Backup whole state non-destructively to server as snapshot
  if (config.cloudServerSync) {
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        },
        body: JSON.stringify({
          database: dbData,
          trigger,
          timestamp: now,
          totalRecords,
          clientMeta: {
            deviceId: getOrCreateDeviceId(),
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
            officeName: dbData.officeSettings?.officeName,
          },
        }),
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.database) {
          serverSaved = true;
          const returnedDb = resData.database as AppDatabase;
          if (typeof window !== 'undefined') {
            localStorage.setItem('saflaq_health_office_db_v1', JSON.stringify(returnedDb));
            window.dispatchEvent(
              new CustomEvent('saflaq:database-synced', {
                detail: { database: returnedDb, source: 'server_push' },
              })
            );
          }
        }
      }
    } catch (err) {
      console.warn('Server sync snapshot fallback:', err);
    }
  }

  // Step 4: Save durable local snapshot to IndexedDB
  if (config.durableIndexedDB) {
    idbSaved = await saveDurableSnapshotToIDB(dbData, trigger);
  }

  // Mark all pending changes as synchronized
  const remainingPending = await getPendingQueueCount();
  markHasPendingChanges(remainingPending > 0);

  const successMessage = trigger === 'reconnect'
    ? `تم استعادة الاتصال بالإنترنت! تم اعتماد طابور الحركات وتحديث الأرصدة (${totalRecords} سجل).`
    : `تم التخزين والمزامنة المركزية بنجاح (${totalRecords} سجل).`;

  saveAutoSyncConfig({
    lastSyncTime: now,
    lastSyncStatus: 'success',
    lastSyncMessage: successMessage,
    totalRecordsLastSynced: totalRecords,
    pendingQueueCount: remainingPending,
  });

  addSyncLog({
    trigger,
    status: 'success',
    recordCount: totalRecords,
    details: `${successMessage} [الطابور المتبقي: ${remainingPending} | الخادم المركزي: ${serverSaved ? 'معتمد' : 'محلي'} | IndexedDB: ${idbSaved ? 'محفوظ' : 'لا'}]`,
  });

  notifySyncStatusChanged('synced', successMessage);

  return {
    success: true,
    status: 'synced',
    message: successMessage,
    timestamp: now,
    totalRecords,
    serverSaved,
    idbSaved,
  };
}

/**
 * Non-destructive merge of client database with server database
 */
export function mergeClientWithServer(clientDb: AppDatabase, serverDb: AppDatabase): AppDatabase {
  if (!clientDb) return serverDb;
  if (!serverDb) return clientDb;

  // Determine effective Reset Boundary
  const serverBoundary = serverDb.resetBoundary;
  const clientBoundary = clientDb.resetBoundary;
  let effectiveBoundary: any = null;

  if (serverBoundary && clientBoundary) {
    const sTime = new Date(serverBoundary.resetAt || 0).getTime();
    const cTime = new Date(clientBoundary.resetAt || 0).getTime();
    effectiveBoundary = cTime >= sTime ? clientBoundary : serverBoundary;
  } else if (clientBoundary) {
    effectiveBoundary = clientBoundary;
  } else if (serverBoundary) {
    effectiveBoundary = serverBoundary;
  }

  const boundaryTime = effectiveBoundary ? new Date(effectiveBoundary.resetAt || 0).getTime() : 0;
  const isAfterReset = (r: any) => {
    if (boundaryTime <= 0) return true;
    const t = new Date(r.updatedAt || r.syncedAt || r.createdAt || r.date || 0).getTime();
    return t > boundaryTime;
  };

  // 0. Merge Sync Tombstones
  const tombstoneMap = new Map<string, any>();
  (serverDb.syncTombstones || []).forEach((t) => {
    if (t && (t.recordId || t.transactionId)) {
      tombstoneMap.set(t.recordId || t.transactionId, t);
    }
  });
  (clientDb.syncTombstones || []).forEach((t) => {
    if (t && (t.recordId || t.transactionId)) {
      const key = t.recordId || t.transactionId;
      if (!tombstoneMap.has(key)) {
        tombstoneMap.set(key, t);
      } else {
        const existing = tombstoneMap.get(key);
        const incomingTime = new Date(t.deletedAt || 0).getTime();
        const existingTime = new Date(existing.deletedAt || 0).getTime();
        if (incomingTime >= existingTime) {
          tombstoneMap.set(key, { ...existing, ...t });
        }
      }
    }
  });
  const mergedTombstones = Array.from(tombstoneMap.values());
  const tombstoneIds = new Set<string>();
  mergedTombstones.forEach((t) => {
    if (t.recordId) tombstoneIds.add(t.recordId);
    if (t.transactionId) tombstoneIds.add(t.transactionId);
  });

  const isTombstoned = (r: any) => {
    return Boolean((r.id && tombstoneIds.has(r.id)) || (r.transactionId && tombstoneIds.has(r.transactionId)));
  };

  // 1. Dispense Records: Union by ID with Reset Boundary & Tombstone filtering
  const dispenseMap = new Map<string, any>();
  (serverDb.dispenseRecords || []).forEach((r) => r?.id && isAfterReset(r) && !isTombstoned(r) && dispenseMap.set(r.id, r));
  (clientDb.dispenseRecords || []).forEach((r) => {
    if (r?.id && isAfterReset(r) && !isTombstoned(r)) {
      if (!dispenseMap.has(r.id)) {
        dispenseMap.set(r.id, r);
      } else {
        const existing = dispenseMap.get(r.id);
        const incomingTime = new Date(r.updatedAt || r.createdAt || 0).getTime();
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        if (incomingTime >= existingTime) {
          dispenseMap.set(r.id, { ...existing, ...r });
        }
      }
    }
  });

  // 2. Supply Transactions: Union by ID with Reset Boundary filtering
  const supplyMap = new Map<string, any>();
  (serverDb.supplyTransactions || []).forEach((s) => s?.id && isAfterReset(s) && supplyMap.set(s.id, s));
  (clientDb.supplyTransactions || []).forEach((s) => {
    if (s?.id && isAfterReset(s) && !supplyMap.has(s.id)) {
      supplyMap.set(s.id, s);
    }
  });

  // 3. Late Registrations: Union by ID with Reset Boundary filtering
  const lateRegMap = new Map<string, any>();
  (serverDb.lateRegistrations || []).forEach((l) => l?.id && isAfterReset(l) && lateRegMap.set(l.id, l));
  (clientDb.lateRegistrations || []).forEach((l) => {
    if (l?.id && isAfterReset(l)) {
      if (!lateRegMap.has(l.id)) {
        lateRegMap.set(l.id, l);
      } else {
        const existing = lateRegMap.get(l.id);
        const stepMap = new Map<string, any>();
        (existing.trackingHistory || []).forEach((st: any, idx: number) => stepMap.set(st.id || `s-${idx}`, st));
        (l.trackingHistory || []).forEach((st: any, idx: number) => stepMap.set(st.id || `c-${idx}`, st));
        const mergedHistory = Array.from(stepMap.values());
        const base = { ...existing, ...l };
        base.trackingHistory = mergedHistory;
        lateRegMap.set(l.id, base);
      }
    }
  });

  const mergedDispenseRecords = Array.from(dispenseMap.values()).sort((a, b) => {
    const timeA = new Date((a.date || '1970-01-01') + ' ' + (a.time || '00:00')).getTime();
    const timeB = new Date((b.date || '1970-01-01') + ' ' + (b.time || '00:00')).getTime();
    return timeB - timeA;
  });

  const mergedSupplyTransactions = Array.from(supplyMap.values()).sort((a, b) => {
    const timeA = new Date(a.date || a.createdAt || 0).getTime();
    const timeB = new Date(b.date || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  const mergedLateRegistrations = Array.from(lateRegMap.values()).sort((a, b) => {
    const timeA = new Date(a.submissionDate || a.createdAt || 0).getTime();
    const timeB = new Date(b.submissionDate || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  const openingBalances = effectiveBoundary
    ? (effectiveBoundary === clientBoundary ? clientDb.openingBalances : serverDb.openingBalances) || clientDb.openingBalances || serverDb.openingBalances
    : clientDb.openingBalances || serverDb.openingBalances;

  // 4. Mathematical Reconstruction of Stocks (Anti-corruption guarantee)
  // Formula: actualBalance = openingStock + sum(validSupplies) - sum(validDispenses) - damagedOrCancelled
  const mergedStocks = { ...(serverDb.stocks || clientDb.stocks || {}) };
  for (const key of Object.keys(mergedStocks) as (keyof typeof mergedStocks)[]) {
    const sStock = mergedStocks[key];
    const openingQty = openingBalances?.items?.[key]?.openingQuantity !== undefined
      ? Number(openingBalances.items[key].openingQuantity)
      : (effectiveBoundary ? 0 : Number(clientDb.stocks?.[key]?.openingStock || serverDb.stocks?.[key]?.openingStock || 0));

    const totalReceived = mergedSupplyTransactions
      .filter((s: any) => s.stockCategory === key)
      .reduce((sum: number, s: any) => sum + Number(s.quantity || 0), 0);

    let totalDispensed = 0;
    mergedDispenseRecords.forEach((d: any) => {
      (d.itemsDeducted || []).forEach((it: any) => {
        if (it.stockCategory === key) {
          totalDispensed += Number(it.quantity || 0);
        }
      });
    });

    const damagedOrCancelled = effectiveBoundary
      ? 0
      : Number(clientDb.stocks?.[key]?.damagedOrCancelled || serverDb.stocks?.[key]?.damagedOrCancelled || 0);
    const calculatedCurrent = Math.max(0, openingQty + totalReceived - totalDispensed - damagedOrCancelled);

    mergedStocks[key] = {
      ...sStock,
      openingStock: openingQty,
      openingSerialFrom: openingBalances?.items?.[key]?.serialFrom || (effectiveBoundary ? '' : sStock.openingSerialFrom || ''),
      openingSerialTo: openingBalances?.items?.[key]?.serialTo || (effectiveBoundary ? '' : sStock.openingSerialTo || ''),
      totalReceived,
      totalDispensed,
      damagedOrCancelled,
      currentStock: calculatedCurrent,
      lastUpdated: new Date().toISOString(),
    };
  }

  return {
    version: Math.max(serverDb.version || 1, clientDb.version || 1) + 1,
    lastBackupDate: new Date().toISOString(),
    officeSettings: {
      ...(serverDb.officeSettings || clientDb.officeSettings),
      ...(clientDb.officeSettings || {}),
    } as AppDatabase['officeSettings'],
    stocks: mergedStocks as AppDatabase['stocks'],
    supplyTransactions: mergedSupplyTransactions,
    dispenseRecords: mergedDispenseRecords,
    lateRegistrations: mergedLateRegistrations,
    openingBalances,
    syncTombstones: mergedTombstones,
    ...(effectiveBoundary ? { resetBoundary: effectiveBoundary } : {}),
  };
}

/**
 * Fetch and apply server database on demand or during startup
 */
export async function fetchAndApplyServerDatabase(currentLocalDb: AppDatabase): Promise<{
  success: boolean;
  database: AppDatabase | null;
  recordsCount: number;
  message: string;
}> {
  try {
    const isOnline = await checkRealInternetConnection();
    if (!isOnline) {
      return { success: false, database: null, recordsCount: 0, message: 'لا يوجد اتصال بالإنترنت حالياً' };
    }

    const response = await fetch('/api/sync?t=' + Date.now(), {
      method: 'GET',
      headers: { 'Cache-Control': 'no-cache' },
    });

    if (!response.ok) {
      return { success: false, database: null, recordsCount: 0, message: 'تعذر الاتصال بخادم السحابة' };
    }

    const data = await response.json();
    if (!data.success || !data.database) {
      return { success: false, database: null, recordsCount: 0, message: 'بيانات غير صالحة من السحابة' };
    }

    const serverDb = data.database as AppDatabase;
    const merged = mergeClientWithServer(currentLocalDb, serverDb);

    if (typeof window !== 'undefined') {
      localStorage.setItem('saflaq_health_office_db_v1', JSON.stringify(merged));
      saveDurableSnapshotToIDB(merged, 'server_pull');
      window.dispatchEvent(
        new CustomEvent('saflaq:database-synced', {
          detail: { database: merged, source: 'server_pull' },
        })
      );
    }

    const totalRecords =
      (merged.dispenseRecords?.length || 0) +
      (merged.lateRegistrations?.length || 0) +
      (merged.supplyTransactions?.length || 0);

    const msg = `تم بنجاح تحديث وسحب البيانات من السحابة (${totalRecords} سجل)`;
    saveAutoSyncConfig({
      lastSyncTime: new Date().toISOString(),
      lastSyncStatus: 'success',
      lastSyncMessage: msg,
      totalRecordsLastSynced: totalRecords,
    });

    notifySyncStatusChanged('synced', msg);

    return {
      success: true,
      database: merged,
      recordsCount: totalRecords,
      message: msg,
    };
  } catch (err: any) {
    console.warn('fetchAndApplyServerDatabase error:', err);
    return { success: false, database: null, recordsCount: 0, message: err.message || 'خطأ في جلب البيانات' };
  }
}

// Custom Event Notification for Real-Time UI updates
function notifySyncStatusChanged(status: SyncStatus, message: string) {
  if (typeof window !== 'undefined') {
    const event = new CustomEvent('saflaq:sync-status', {
      detail: { status, message, timestamp: new Date().toISOString() },
    });
    window.dispatchEvent(event);
  }
}

// ==========================================
// 5. Application & Version Update Checker
// ==========================================
export async function checkForApplicationUpdates(): Promise<{
  hasUpdate: boolean;
  message: string;
  appVersion: string;
}> {
  const appVersion = '1.0.1';

  try {
    // Check if Service Worker has a waiting or installing worker
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.update();
        if (reg.waiting || reg.installing) {
          return {
            hasUpdate: true,
            message: 'يتوفر إصدار جديد من المنظومة جاهز للتثبيت.',
            appVersion,
          };
        }
      }
    }

    return {
      hasUpdate: false,
      message: 'المنظومة تعمل بأحدث إصدار رسمي معتمد (v' + appVersion + ').',
      appVersion,
    };
  } catch (err) {
    return {
      hasUpdate: false,
      message: 'أنت تعمل على الإصدار المستقر v' + appVersion,
      appVersion,
    };
  }
}

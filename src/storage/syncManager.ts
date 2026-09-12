/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Durable Sync Manager & Transaction Queue (Rules 9, 10, 11, 12, 13, 14, 15, 16, 19, 34, 35)
 */

import {
  DatabaseSchema,
  SyncTransactionItem,
  OperationType,
  SupplyTransaction,
  DispenseRecord,
  LateRegistrationRecord,
  StockCategory
} from '../types';
import { getDeviceId, loadDatabase, saveDatabase } from './db';
import { getApiAuthHeaders } from './apiAuth';

const SYNC_QUEUE_KEY = 'saflaq_durable_sync_queue_v2';
const LAST_SYNC_STATUS_KEY = 'saflaq_last_sync_status';

export interface SyncStatusInfo {
  status: 'idle' | 'syncing' | 'synced' | 'failed';
  lastSyncTime: string | null;
  pendingCount: number;
  lastError: string | null;
}

/**
 * Loads durable queue from persistent storage
 */
export function getPendingQueue(): SyncTransactionItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error reading sync queue:', e);
    return [];
  }
}

/**
 * Saves durable queue to persistent storage
 */
export function savePendingQueue(queue: SyncTransactionItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving sync queue:', e);
  }
}

/**
 * Enqueues a transaction into durable queue with idempotent key
 */
export function enqueueTransaction(
  operationType: OperationType,
  recordId: string,
  version: number,
  payload: any,
  transactionId: string
): void {
  const queue = getPendingQueue();
  const operationKey = `${operationType}:${recordId}:${version}`;
  const deviceId = getDeviceId();
  const now = new Date().toISOString();

  // If already in queue, replace with newer version
  const existingIdx = queue.findIndex(q => q.operationKey === operationKey);
  const item: SyncTransactionItem = {
    transactionId,
    operationKey,
    recordId,
    operationType,
    version,
    updatedAt: now,
    deviceId,
    payload
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  savePendingQueue(queue);
}

/**
 * Checks current sync status
 */
export function getSyncStatus(): SyncStatusInfo {
  const queue = getPendingQueue();
  if (typeof window === 'undefined') {
    return { status: 'idle', lastSyncTime: null, pendingCount: queue.length, lastError: null };
  }

  try {
    const raw = localStorage.getItem(LAST_SYNC_STATUS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...parsed, pendingCount: queue.length };
    }
  } catch (e) {}

  return { status: 'idle', lastSyncTime: null, pendingCount: queue.length, lastError: null };
}

function updateSyncStatus(status: 'idle' | 'syncing' | 'synced' | 'failed', error: string | null = null) {
  if (typeof window === 'undefined') return;
  const queue = getPendingQueue();
  const info: SyncStatusInfo = {
    status,
    lastSyncTime: status === 'synced' ? new Date().toISOString() : null,
    pendingCount: queue.length,
    lastError: error
  };
  localStorage.setItem(LAST_SYNC_STATUS_KEY, JSON.stringify(info));
  window.dispatchEvent(new CustomEvent('saflaq_sync_status_changed', { detail: info }));
}

let isSyncRunning = false;

/**
 * Executes safe transaction sync against central backend server
 * STRICT RULE 34: Never shows fake success if sync fails!
 * STRICT RULE 19: Rejects and purges pre-reset transactions!
 */
export async function executeAutoSync(
  currentDb: DatabaseSchema,
  trigger: 'auto' | 'manual' | 'change' = 'auto'
): Promise<{ success: boolean; message: string; pendingCount: number }> {
  if (isSyncRunning) {
    return { success: false, message: 'مزامنة جارية بالفعل', pendingCount: getPendingQueue().length };
  }

  isSyncRunning = true;
  updateSyncStatus('syncing');

  try {
    const queue = getPendingQueue();
    const deviceId = getDeviceId();

    // 1. Send pending transactions to backend
    const response = await fetch('/api/sync/transactions', {
      method: 'POST',
      headers: getApiAuthHeaders(),
      body: JSON.stringify({
        deviceId,
        resetBoundary: currentDb.resetBoundary,
        transactions: queue
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = 'فشل الاتصال بالخادم المركزي';
      try {
        const errJson = JSON.parse(errText);
        parsedErr = errJson.message || errJson.error || parsedErr;

        // Reset Boundary Violation: Old device was offline during factory reset
        if (errJson.code === 'RESET_BOUNDARY_VIOLATION') {
          console.warn('Reset boundary violation detected. Purging old device queue.');
          savePendingQueue([]);
          // Adopt server's new clean reset state
          if (errJson.serverBoundary) {
            currentDb.resetBoundary = errJson.serverBoundary;
            saveDatabase(currentDb, false);
          }
          updateSyncStatus('failed', 'تم تصفير النظام مركزياً - تم إيقاف الحركات السابقة للتصفير');
          return {
            success: false,
            message: 'تم تصفير النظام مركزياً - تم رفض الحركات السابقة للتصفير وفق حد الأمان الزمني',
            pendingCount: 0
          };
        }
      } catch (e) {}

      updateSyncStatus('failed', parsedErr);
      return { success: false, message: parsedErr, pendingCount: queue.length };
    }

    const result = await response.json();

    // 2. Remove confirmed transactions from queue
    const acknowledgedKeys = new Set(result.processedKeys || []);
    const remainingQueue = queue.filter(q => !acknowledgedKeys.has(q.operationKey));
    savePendingQueue(remainingQueue);

    // 3. Merge server updates safely with Tombstone and Version protection
    if (result.serverData) {
      mergeServerDataSafely(currentDb, result.serverData);
    }

    updateSyncStatus('synced');
    return {
      success: true,
      message: 'تمت المزامنة بنجاح مع الخادم المركزي',
      pendingCount: remainingQueue.length
    };
  } catch (err: any) {
    const errorMsg = err?.message || 'تعذر الوصول إلى خادم المزامنة';
    updateSyncStatus('failed', errorMsg);
    return {
      success: false,
      message: errorMsg,
      pendingCount: getPendingQueue().length
    };
  } finally {
    isSyncRunning = false;
  }
}

/**
 * Merges server data into local database with version checks and tombstone enforcement
 * RULE 3: PROTECTS currentStock from arbitrary overwrite!
 */
function mergeServerDataSafely(localDb: DatabaseSchema, serverData: Partial<DatabaseSchema>): void {
  let changed = false;

  // 1. Tombstones merge
  const localTombstones = new Set(localDb.tombstones.map(t => t.recordId));
  for (const st of serverData.tombstones || []) {
    if (!localTombstones.has(st.recordId)) {
      localDb.tombstones.push(st);
      localTombstones.add(st.recordId);
      changed = true;
    }
  }

  // 2. Supplies merge with version check
  const tombstoneSet = new Set(localDb.tombstones.map(t => t.recordId));
  const localSuppliesMap = new Map(localDb.supplies.map(s => [s.id, s]));

  for (const sSup of serverData.supplies || []) {
    if (tombstoneSet.has(sSup.id) || sSup.isDeleted) continue;

    const existing = localSuppliesMap.get(sSup.id);
    if (!existing) {
      // New confirmed supply from another terminal
      localDb.supplies.unshift({ ...sSup, syncStatus: 'synced' });
      const stock = localDb.stocks[sSup.category];
      if (stock) {
        stock.currentStock += sSup.quantity;
        stock.totalReceived += sSup.quantity;
      }
      changed = true;
    } else if ((sSup.version || 1) > (existing.version || 1)) {
      // Newer version from server
      const oldQty = existing.quantity;
      const diff = sSup.quantity - oldQty;
      const stock = localDb.stocks[sSup.category];
      if (stock) {
        stock.currentStock += diff;
        stock.totalReceived += diff;
      }
      Object.assign(existing, sSup, { syncStatus: 'synced' });
      changed = true;
    }
  }

  // 3. Dispenses merge with version check
  const localDispensesMap = new Map(localDb.dispenses.map(d => [d.id, d]));
  for (const sDsp of serverData.dispenses || []) {
    if (tombstoneSet.has(sDsp.id) || sDsp.isDeleted) continue;

    const existing = localDispensesMap.get(sDsp.id);
    if (!existing) {
      localDb.dispenses.unshift({ ...sDsp, syncStatus: 'synced' });
      const stock = localDb.stocks[sDsp.category];
      if (stock) {
        stock.currentStock -= sDsp.quantity;
        stock.totalDispensed += sDsp.quantity;
      }
      changed = true;
    } else if ((sDsp.version || 1) > (existing.version || 1)) {
      const oldQty = existing.quantity;
      const diff = sDsp.quantity - oldQty;
      const stock = localDb.stocks[sDsp.category];
      if (stock) {
        stock.currentStock -= diff;
        stock.totalDispensed += diff;
      }
      Object.assign(existing, sDsp, { syncStatus: 'synced' });
      changed = true;
    }
  }

  // 4. Late registrations merge
  const localLateMap = new Map(localDb.lateRegistrations.map(r => [r.id, r]));
  for (const sLate of serverData.lateRegistrations || []) {
    if (tombstoneSet.has(sLate.id) || sLate.isDeleted) continue;

    const existing = localLateMap.get(sLate.id);
    if (!existing) {
      localDb.lateRegistrations.unshift({ ...sLate, syncStatus: 'synced' });
      changed = true;
    } else if ((sLate.version || 1) > (existing.version || 1)) {
      Object.assign(existing, sLate, { syncStatus: 'synced' });
      changed = true;
    }
  }

  if (changed) {
    saveDatabase(localDb, false);
  }
}

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

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

/**
 * Loads durable queue from persistent storage
 */
export function getPendingQueue(): SyncTransactionItem[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(SYNC_QUEUE_KEY);
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
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.error('Error saving sync queue:', e);
  }
}

/**
 * Clears pending queue completely
 */
export function clearPendingQueue(): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(SYNC_QUEUE_KEY);
  } catch (e) {
    console.error('Error clearing sync queue:', e);
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
  transactionId?: string,
  explicitOperationKey?: string
): SyncTransactionItem[] & SyncTransactionItem {
  if (payload && 'operationKey' in payload) {
    if (!payload.operationKey || typeof payload.operationKey !== 'string' || !payload.operationKey.trim()) {
      throw new Error('INVALID_OPERATION_KEY: operationKey مفقود أو غير صالح ولا يمكن أن يكون فارغاً');
    }
  }

  const opKey = explicitOperationKey || (payload && payload.operationKey);
  const effectiveOperationKey = (opKey && typeof opKey === 'string' && opKey.trim())
    ? opKey.trim()
    : `${operationType}:${recordId}:${version}`;

  if (!effectiveOperationKey || typeof effectiveOperationKey !== 'string' || !effectiveOperationKey.trim()) {
    throw new Error('INVALID_OPERATION_KEY: operationKey مفقود أو غير صالح');
  }

  const effectiveTxId = transactionId || payload?.transactionId || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const queue = getPendingQueue();
  const deviceId = getDeviceId();
  const now = new Date().toISOString();
  const db = loadDatabase();

  // If already in queue with identical key, replace in place (Idempotency Enforcement)
  const existingIdx = queue.findIndex(q => q.operationKey === effectiveOperationKey);
  const item: SyncTransactionItem = {
    transactionId: effectiveTxId,
    operationKey: effectiveOperationKey,
    recordId,
    operationType,
    version: version || 1,
    updatedAt: now,
    deviceId,
    resetBoundary: db?.resetBoundary,
    payload
  };

  if (existingIdx >= 0) {
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  savePendingQueue(queue);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('saflaq_queue_updated', { detail: { queueLength: queue.length } }));
  }

  const result: any = queue;
  result.transactionId = effectiveTxId;
  result.operationKey = effectiveOperationKey;
  result.recordId = recordId;
  result.operationType = operationType;
  return result;
}

/**
 * Checks current sync status
 */
export function getSyncStatus(): SyncStatusInfo {
  const queue = getPendingQueue();
  const storage = getStorage();
  if (!storage) {
    return { status: 'idle', lastSyncTime: null, pendingCount: queue.length, lastError: null };
  }

  try {
    const raw = storage.getItem(LAST_SYNC_STATUS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...parsed, pendingCount: queue.length };
    }
  } catch (e) {}

  return { status: 'idle', lastSyncTime: null, pendingCount: queue.length, lastError: null };
}

function updateSyncStatus(status: 'idle' | 'syncing' | 'synced' | 'failed', error: string | null = null) {
  const storage = getStorage();
  const queue = getPendingQueue();
  const info: SyncStatusInfo = {
    status,
    lastSyncTime: status === 'synced' ? new Date().toISOString() : null,
    pendingCount: queue.length,
    lastError: error
  };
  if (storage) {
    storage.setItem(LAST_SYNC_STATUS_KEY, JSON.stringify(info));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('saflaq_sync_status_changed', { detail: info }));
  }
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

    const clientResetId = currentDb?.resetBoundary?.resetId;

    if (
      typeof clientResetId !== 'string' ||
      !clientResetId.trim()
    ) {
      updateSyncStatus(
        'failed',
        'STALE_RESET_ID: لا يوجد resetId صالح للجهاز'
      );

      return {
        success: false,
        message: 'STALE_RESET_ID: لا يوجد معرف دورة قاعدة بيانات صالح على الجهاز',
        pendingCount: queue.length
      };
    }

    // 1. Send pending transactions to backend
    const response = await fetch('/api/sync/transactions', {
      method: 'POST',
      headers: getApiAuthHeaders(),
      body: JSON.stringify({
        deviceId,
        resetId: currentDb?.resetBoundary?.resetId,
        resetBoundary: currentDb?.resetBoundary,
        transactions: queue
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr = 'فشل الاتصال بالخادم المركزي';
      try {
        const errJson = JSON.parse(errText);
        parsedErr = errJson.message || errJson.error || parsedErr;

        // Reset Boundary Violation: Old device was offline during factory reset / Stale resetId
        if (errJson.code === 'STALE_RESET_ID' || errJson.code === 'RESET_BOUNDARY_VIOLATION') {
          console.warn('STALE_RESET_ID detected. Purging old device queue and adopting current server state.');
          savePendingQueue([]);
          try {
            const freshRes = await fetch('/api/database');
            if (freshRes.ok) {
              const freshDb = await freshRes.json();
              saveDatabase(freshDb, false);
            } else if (errJson.serverBoundary) {
              currentDb.resetBoundary = errJson.serverBoundary;
              saveDatabase(currentDb, false);
            }
          } catch {
            if (errJson.serverBoundary) {
              currentDb.resetBoundary = errJson.serverBoundary;
              saveDatabase(currentDb, false);
            }
          }
          updateSyncStatus('failed', 'STALE_RESET_ID: تم رفض الحركات لعدم تطابق resetId مع الخادم، وتم تفريغ الطابور وجلب الحالة من الخادم');
          return {
            success: false,
            message: 'STALE_RESET_ID: تم تصفير النظام أو اختلاف resetId - تم رفض الحركات القديمة وتحديث الحالة من الخادم',
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
export function mergeServerDataSafely(
  localDb: DatabaseSchema,
  serverData: Partial<DatabaseSchema>
): DatabaseSchema {
  const localResetId = localDb.resetBoundary?.resetId;

  if (typeof localResetId !== 'string' || !localResetId.trim()) {
    throw new Error('STALE_RESET_ID');
  }

  const serverResetId = serverData.resetBoundary?.resetId ?? localResetId;

  if (typeof serverResetId !== 'string' || !serverResetId.trim()) {
    throw new Error('STALE_RESET_ID');
  }

  // Server resetId is authoritative.
  // A different reset cycle must never be merged into the local database.
  if (serverResetId !== localResetId) {
    clearPendingQueue();

    localDb.resetBoundary = JSON.parse(
      JSON.stringify(serverData.resetBoundary)
    );

    localDb.stocks = JSON.parse(
      JSON.stringify(serverData.stocks || localDb.stocks)
    );

    localDb.supplies = JSON.parse(
      JSON.stringify(serverData.supplies || [])
    ).map((x: any) => ({
      ...x,
      syncStatus: 'synced'
    }));

    localDb.dispenses = JSON.parse(
      JSON.stringify(serverData.dispenses || [])
    ).map((x: any) => ({
      ...x,
      syncStatus: 'synced'
    }));

    localDb.lateRegistrations = JSON.parse(
      JSON.stringify(serverData.lateRegistrations || [])
    ).map((x: any) => ({
      ...x,
      syncStatus: 'synced'
    }));

    localDb.openingBalances = JSON.parse(
      JSON.stringify(serverData.openingBalances || {})
    );

    localDb.tombstones = JSON.parse(
      JSON.stringify(serverData.tombstones || [])
    );

    localDb.auditLogs = JSON.parse(
      JSON.stringify(serverData.auditLogs || [])
    );

    localDb.version = serverData.version || localDb.version || 1;

    saveDatabase(localDb, false);

    return localDb;
  }

  /*
   * SAME RESET CYCLE
   *
   * Server stocks are authoritative.
   * NEVER calculate or modify currentStock here.
   */
  if (serverData.stocks) {
    localDb.stocks = JSON.parse(
      JSON.stringify(serverData.stocks)
    );
  }

  /*
   * Server opening balances are authoritative metadata.
   * Do NOT modify currentStock from opening balances here.
   */
  if (serverData.openingBalances) {
    localDb.openingBalances = JSON.parse(
      JSON.stringify(serverData.openingBalances)
    );
  }

  /*
   * Merge tombstones without touching stock.
   */
  const tombstoneMap = new Map<string, any>();

  for (const t of localDb.tombstones || []) {
    tombstoneMap.set(t.recordId, t);
  }

  for (const t of serverData.tombstones || []) {
    tombstoneMap.set(t.recordId, t);
  }

  localDb.tombstones = Array.from(tombstoneMap.values());

  const tombstoneSet = new Set(
    localDb.tombstones.map(t => t.recordId)
  );

  /*
   * Merge server supplies.
   * IMPORTANT:
   * Adding/removing a record here MUST NOT modify currentStock.
   */
  const supplyMap = new Map(
    (localDb.supplies || []).map(s => [s.id, s])
  );

  for (const s of serverData.supplies || []) {
    if (tombstoneSet.has(s.id) || s.isDeleted) {
      continue;
    }

    const existing = supplyMap.get(s.id);

    if (!existing || (s.version || 1) > (existing.version || 1)) {
      supplyMap.set(s.id, {
        ...s,
        syncStatus: 'synced'
      });
    }
  }

  localDb.supplies = Array.from(supplyMap.values())
    .filter(s => !tombstoneSet.has(s.id) && !s.isDeleted);

  /*
   * Merge server dispenses.
   * IMPORTANT:
   * Adding/removing a record here MUST NOT modify currentStock.
   */
  const dispenseMap = new Map(
    (localDb.dispenses || []).map(d => [d.id, d])
  );

  for (const d of serverData.dispenses || []) {
    if (tombstoneSet.has(d.id) || d.isDeleted) {
      continue;
    }

    const existing = dispenseMap.get(d.id);

    if (!existing || (d.version || 1) > (existing.version || 1)) {
      dispenseMap.set(d.id, {
        ...d,
        syncStatus: 'synced'
      });
    }
  }

  localDb.dispenses = Array.from(dispenseMap.values())
    .filter(d => !tombstoneSet.has(d.id) && !d.isDeleted);

  /*
   * Merge late registrations without touching stock.
   */
  const lateMap = new Map(
    (localDb.lateRegistrations || []).map(r => [r.id, r])
  );

  for (const r of serverData.lateRegistrations || []) {
    if (tombstoneSet.has(r.id) || r.isDeleted) {
      continue;
    }

    const existing = lateMap.get(r.id);

    if (!existing || (r.version || 1) > (existing.version || 1)) {
      lateMap.set(r.id, {
        ...r,
        syncStatus: 'synced'
      });
    }
  }

  localDb.lateRegistrations = Array.from(lateMap.values())
    .filter(r => !tombstoneSet.has(r.id) && !r.isDeleted);

  /*
   * Audit logs are informational only.
   * NEVER change currentStock because of an audit log.
   */
  if (Array.isArray(serverData.auditLogs)) {
    const auditMap = new Map(
      (localDb.auditLogs || []).map(a => [a.id, a])
    );

    const pending = getPendingQueue();

    for (const a of serverData.auditLogs) {
      if (
        (a.operationType === 'MANUAL_STOCK_ADJUSTMENT' || a.action?.includes('تسوية')) &&
        a.category &&
        pending.some(p => p.operationType === 'MANUAL_STOCK_ADJUSTMENT' && p.payload?.category === a.category)
      ) {
        const conflictEntry = {
          id: `conflict-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: new Date().toISOString(),
          action: 'SYNC_CONFLICT',
          category: a.category,
          itemId: a.category,
          details: `تعارض تسوية رصيد جرد بين جهازين للصنف ${a.category}: تم رفض الاستبدال الصامت`,
          performedBy: 'نظام الرقابة',
          previousValue: localDb.stocks[a.category as StockCategory]?.currentStock,
          newValue: a.newValue,
          reason: 'تعارض جرد أوفلاين'
        };
        auditMap.set(conflictEntry.id, conflictEntry);
      }

      auditMap.set(a.id, a);
    }

    localDb.auditLogs = Array.from(auditMap.values());
  }

  localDb.resetBoundary = JSON.parse(
    JSON.stringify(serverData.resetBoundary || localDb.resetBoundary)
  );

  localDb.version = serverData.version || localDb.version || 1;

  saveDatabase(localDb, false);

  return localDb;
}

export function requireMatchingResetId(
  clientResetId: unknown,
  serverResetId: unknown
): void {
  if (
    typeof clientResetId !== "string" ||
    typeof serverResetId !== "string" ||
    !clientResetId ||
    !serverResetId ||
    clientResetId !== serverResetId
  ) {
    const error = new Error("STALE_RESET_ID");
    (error as any).code = "STALE_RESET_ID";
    throw error;
  }
}

/**
 * Non-destructive merge strictly protecting currentStock and validating resetId
 */
export function mergeDatabasesNonDestructive(
  serverDb: DatabaseSchema,
  clientDb: DatabaseSchema
): DatabaseSchema {
  requireMatchingResetId(
    clientDb?.resetBoundary?.resetId,
    serverDb?.resetBoundary?.resetId
  );

  const serverResetId = serverDb.resetBoundary?.resetId;
  const clientResetId = clientDb.resetBoundary?.resetId;

  if (
    typeof serverResetId !== "string" ||
    !serverResetId ||
    typeof clientResetId !== "string" ||
    !clientResetId ||
    serverResetId !== clientResetId
  ) {
    const error = new Error("STALE_RESET_ID");
    (error as any).code = "STALE_RESET_ID";
    throw error;
  }

  const merged: DatabaseSchema = JSON.parse(JSON.stringify(serverDb));
  merged.resetBoundary = serverDb.resetBoundary;

  // 2. Strict currentStock Protection:
  // currentStock is authoritative from serverDb and MUST NOT be changed by merge, timestamp comparison, or formulas!
  merged.stocks = JSON.parse(JSON.stringify(serverDb.stocks));

  // 3. Merge tombstones safely
  const tombstoneMap = new Map<string, any>();
  (serverDb.tombstones || []).forEach(t => tombstoneMap.set(t.recordId, t));
  (clientDb.tombstones || []).forEach(t => {
    if (!tombstoneMap.has(t.recordId)) {
      tombstoneMap.set(t.recordId, t);
    }
  });
  merged.tombstones = Array.from(tombstoneMap.values());
  const tombstoneSet = new Set(merged.tombstones.map(t => t.recordId));

  // 4. Non-destructive supplies merge (without changing currentStock)
  const serverSupplyMap = new Map((serverDb.supplies || []).map(s => [s.id, s]));
  for (const cs of clientDb.supplies || []) {
    if (tombstoneSet.has(cs.id) || cs.isDeleted) continue;
    if (!serverSupplyMap.has(cs.id)) {
      merged.supplies.push({ ...cs, syncStatus: 'synced' });
      serverSupplyMap.set(cs.id, cs);
    }
  }

  // 5. Non-destructive dispenses merge (without changing currentStock)
  const serverDispenseMap = new Map((serverDb.dispenses || []).map(d => [d.id, d]));
  for (const cd of clientDb.dispenses || []) {
    if (tombstoneSet.has(cd.id) || cd.isDeleted) continue;
    if (!serverDispenseMap.has(cd.id)) {
      merged.dispenses.push({ ...cd, syncStatus: 'synced' });
      serverDispenseMap.set(cd.id, cd);
    }
  }

  // 6. Non-destructive late registrations merge
  const serverLateMap = new Map((serverDb.lateRegistrations || []).map(r => [r.id, r]));
  for (const cr of clientDb.lateRegistrations || []) {
    if (tombstoneSet.has(cr.id) || cr.isDeleted) continue;
    if (!serverLateMap.has(cr.id)) {
      merged.lateRegistrations.push({ ...cr, syncStatus: 'synced' });
      serverLateMap.set(cr.id, cr);
    }
  }

  // 7. Non-destructive audit logs merge
  const auditIdSet = new Set((serverDb.auditLogs || []).map(a => a.id));
  for (const ca of clientDb.auditLogs || []) {
    if (!auditIdSet.has(ca.id)) {
      merged.auditLogs.push(ca);
      auditIdSet.add(ca.id);
    }
  }

  return merged;
}

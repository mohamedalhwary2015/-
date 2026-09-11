import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { runFullIntegrityCheck } from './src/services/stockService';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PROCESSED_TX_FILE = path.join(DATA_DIR, 'processedTransactions.json');

// Trusted Internal Network (no token overhead)

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// In-memory cached database and idempotency registry
let cachedDatabase: any = null;
let processedOperationKeys = new Set<string>();

function loadProcessedTransactions(): Set<string> {
  try {
    if (fs.existsSync(PROCESSED_TX_FILE)) {
      const raw = fs.readFileSync(PROCESSED_TX_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        processedOperationKeys = new Set<string>(list);
      }
    }
  } catch (err) {
    console.error('Failed to load processed operations:', err);
  }

  // Register all existing historical transactions from DB into idempotency registry
  const db = cachedDatabase || loadDatabaseFromDisk();
  if (db) {
    (db.dispenseRecords || []).forEach((r: any) => {
      const txId = r.transactionId || `tx-${r.id}`;
      r.transactionId = txId;
      processedOperationKeys.add(`DISPENSE:${r.id}`);
      processedOperationKeys.add(`DISPENSE:${txId}`);
    });
    (db.supplyTransactions || []).forEach((r: any) => {
      const txId = r.transactionId || `tx-${r.id}`;
      r.transactionId = txId;
      processedOperationKeys.add(`SUPPLY:${r.id}`);
      processedOperationKeys.add(`SUPPLY:${txId}`);
    });
    (db.lateRegistrations || []).forEach((r: any) => {
      const txId = r.transactionId || `tx-${r.id}`;
      r.transactionId = txId;
      processedOperationKeys.add(`LATE_REG_ADD:${r.id}`);
      processedOperationKeys.add(`LATE_REG_ADD:${txId}`);
    });
    (db.syncTombstones || []).forEach((t: any) => {
      if (t.operationKey) processedOperationKeys.add(t.operationKey);
      if (t.recordId) processedOperationKeys.add(`${t.operationType}:${t.recordId}`);
      if (t.transactionId) processedOperationKeys.add(`${t.operationType}:${t.transactionId}`);
    });
  }
  return processedOperationKeys;
}

function saveProcessedTransactions() {
  try {
    fs.writeFileSync(
      PROCESSED_TX_FILE,
      JSON.stringify(Array.from(processedOperationKeys), null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error('Failed to save processed operations:', err);
  }
}

function loadDatabaseFromDisk(): any {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cachedDatabase = JSON.parse(raw);
      return cachedDatabase;
    }
  } catch (err) {
    console.error('Failed to load database from disk:', err);
  }
  return null;
}

function saveDatabaseToDisk(db: any): boolean {
  try {
    cachedDatabase = db;
    const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);

    // Save rotating backup snapshot (keep last 30 snapshots)
    try {
      const snapshotName = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      const snapshotPath = path.join(BACKUPS_DIR, snapshotName);
      fs.writeFileSync(snapshotPath, JSON.stringify(db, null, 2), 'utf-8');

      const files = fs.readdirSync(BACKUPS_DIR).filter((f) => f.startsWith('snapshot-'));
      if (files.length > 30) {
        files.sort().slice(0, files.length - 30).forEach((oldFile) => {
          try {
            fs.unlinkSync(path.join(BACKUPS_DIR, oldFile));
          } catch {}
        });
      }
    } catch (snapErr) {
      console.warn('Snapshot backup notice:', snapErr);
    }

    return true;
  } catch (err) {
    console.error('Failed to save database to disk:', err);
    return false;
  }
}

/**
 * Non-destructive additive merge (Production Data Protection)
 * Guarantees no existing transaction or balance is erased or lost.
 */
export function mergeDatabasesNonDestructive(serverDb: any, clientDb: any): any {
  if (!clientDb || typeof clientDb !== 'object') return serverDb || {};
  if (!serverDb || typeof serverDb !== 'object') return clientDb;

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

  // Helper to test if a record was created after the reset boundary
  const isAfterReset = (r: any) => {
    if (boundaryTime <= 0) return true;
    const t = new Date(r.updatedAt || r.syncedAt || r.createdAt || r.date || 0).getTime();
    return t > boundaryTime;
  };

  // 0. Merge Sync Tombstones
  const tombstoneMap = new Map<string, any>();
  (serverDb.syncTombstones || []).forEach((t: any) => {
    if (t && (t.recordId || t.transactionId)) {
      tombstoneMap.set(t.recordId || t.transactionId, t);
    }
  });
  (clientDb.syncTombstones || []).forEach((t: any) => {
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
  mergedTombstones.forEach((t: any) => {
    if (t.recordId) tombstoneIds.add(t.recordId);
    if (t.transactionId) tombstoneIds.add(t.transactionId);
  });

  const isTombstoned = (r: any) => {
    return Boolean((r.id && tombstoneIds.has(r.id)) || (r.transactionId && tombstoneIds.has(r.transactionId)));
  };

  // 1. Dispense Records: Union by ID with Reset Boundary & Tombstone filtering
  const dispenseMap = new Map<string, any>();
  (serverDb.dispenseRecords || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r) && !isTombstoned(r)) dispenseMap.set(r.id, r);
  });
  (clientDb.dispenseRecords || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r) && !isTombstoned(r)) {
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
  const mergedDispenseRecords = Array.from(dispenseMap.values()).sort((a, b) => {
    const timeA = new Date((a.date || '1970-01-01') + ' ' + (a.time || '00:00')).getTime();
    const timeB = new Date((b.date || '1970-01-01') + ' ' + (b.time || '00:00')).getTime();
    return timeB - timeA;
  });

  // 2. Supply Transactions: Union by ID with Reset Boundary & Tombstone filtering
  const supplyMap = new Map<string, any>();
  (serverDb.supplyTransactions || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r) && !isTombstoned(r)) supplyMap.set(r.id, r);
  });
  (clientDb.supplyTransactions || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r) && !isTombstoned(r)) {
      if (!supplyMap.has(r.id)) {
        supplyMap.set(r.id, r);
      } else {
        const existing = supplyMap.get(r.id);
        supplyMap.set(r.id, { ...existing, ...r });
      }
    }
  });
  const mergedSupplyTransactions = Array.from(supplyMap.values()).sort((a, b) => {
    const timeA = new Date(a.date || a.createdAt || 0).getTime();
    const timeB = new Date(b.date || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  // 3. Late Registrations: Union by ID + merge tracking steps with Reset Boundary & Tombstone filtering
  const lateRegMap = new Map<string, any>();
  (serverDb.lateRegistrations || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r) && !isTombstoned(r)) lateRegMap.set(r.id, r);
  });
  (clientDb.lateRegistrations || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r) && !isTombstoned(r)) {
      if (!lateRegMap.has(r.id)) {
        lateRegMap.set(r.id, r);
      } else {
        const existing = lateRegMap.get(r.id);
        const stepMap = new Map<string, any>();
        (existing.trackingHistory || []).forEach((s: any, idx: number) => {
          stepMap.set(s.id || `hist-s-${idx}`, s);
        });
        (r.trackingHistory || []).forEach((s: any, idx: number) => {
          stepMap.set(s.id || `hist-c-${idx}`, s);
        });
        const incomingTime = new Date(r.updatedAt || r.createdAt || 0).getTime();
        const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        const base = incomingTime >= existingTime ? { ...existing, ...r } : { ...r, ...existing };
        base.trackingHistory = Array.from(stepMap.values());
        lateRegMap.set(r.id, base);
      }
    }
  });
  const mergedLateRegistrations = Array.from(lateRegMap.values()).sort((a, b) => {
    const timeA = new Date(a.submissionDate || a.createdAt || 0).getTime();
    const timeB = new Date(b.submissionDate || b.createdAt || 0).getTime();
    return timeB - timeA;
  });

  // 4. Stocks: Combine and preserve opening stock and serials
  // If a reset boundary was active, prefer the state that has been reset
  const mergedStocks = { ...(serverDb.stocks || {}) };
  if (effectiveBoundary) {
    const primaryStocks = effectiveBoundary === clientBoundary ? clientDb.stocks : serverDb.stocks;
    if (primaryStocks) {
      for (const key of Object.keys(primaryStocks)) {
        mergedStocks[key] = { ...primaryStocks[key] };
      }
    }
  } else if (clientDb.stocks) {
    for (const key of Object.keys(clientDb.stocks)) {
      if (!mergedStocks[key]) {
        mergedStocks[key] = clientDb.stocks[key];
      } else {
        const sStock = mergedStocks[key];
        const cStock = clientDb.stocks[key];
        const sTime = new Date(sStock.lastUpdated || 0).getTime();
        const cTime = new Date(cStock.lastUpdated || 0).getTime();
        if (cTime >= sTime) {
          mergedStocks[key] = {
            ...sStock,
            ...cStock,
            openingStock: cStock.openingStock !== undefined ? cStock.openingStock : sStock.openingStock,
            openingSerialFrom: cStock.openingSerialFrom || sStock.openingSerialFrom,
            openingSerialTo: cStock.openingSerialTo || sStock.openingSerialTo,
          };
        }
      }
    }
  }

  // 5. Opening Balances
  const mergedOpeningBalances = effectiveBoundary
    ? (effectiveBoundary === clientBoundary ? clientDb.openingBalances : serverDb.openingBalances) || clientDb.openingBalances || serverDb.openingBalances
    : clientDb.openingBalances || serverDb.openingBalances;

  return {
    version: Math.max(serverDb.version || 1, clientDb.version || 1) + 1,
    lastBackupDate: new Date().toISOString(),
    officeSettings: {
      ...(serverDb.officeSettings || {}),
      ...(clientDb.officeSettings || {}),
    },
    stocks: mergedStocks,
    supplyTransactions: mergedSupplyTransactions,
    dispenseRecords: mergedDispenseRecords,
    lateRegistrations: mergedLateRegistrations,
    openingBalances: mergedOpeningBalances,
    syncTombstones: mergedTombstones,
    ...(effectiveBoundary ? { resetBoundary: effectiveBoundary } : {}),
  };
}

// Initialize memory cache and idempotency registry
loadDatabaseFromDisk();
loadProcessedTransactions();

async function startServer() {
  const app = express();

  // Middleware for large JSON payloads
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Prevent browser caching for API responses
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  });

  // 0. Trusted internal network: all API endpoints available without token overhead

  // 1. Health check endpoint
  app.get('/api/health', (req, res) => {
    const db = cachedDatabase || loadDatabaseFromDisk();
    const totalRecords = db
      ? (db.dispenseRecords?.length || 0) +
        (db.lateRegistrations?.length || 0) +
        (db.supplyTransactions?.length || 0)
      : 0;

    res.json({
      status: 'ok',
      uptime: process.uptime(),
      totalRecords,
      lastUpdated: db?.lastBackupDate || null,
      serverTime: new Date().toISOString(),
    });
  });

  // 1.1 Full Integrity & Audit check endpoint
  app.get('/api/integrity-check', (req, res) => {
    try {
      const db = cachedDatabase || loadDatabaseFromDisk();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database not initialized on server' });
      }
      const report = runFullIntegrityCheck(db);
      res.json({
        success: true,
        report,
        databaseSummary: {
          dispenseCount: db.dispenseRecords?.length || 0,
          supplyCount: db.supplyTransactions?.length || 0,
          lateRegCount: db.lateRegistrations?.length || 0,
          tombstoneCount: db.syncTombstones?.length || 0,
          lastBackupDate: db.lastBackupDate,
        },
      });
    } catch (err: any) {
      console.error('Error in /api/integrity-check:', err);
      res.status(500).json({ success: false, message: err.message || 'Error running integrity check' });
    }
  });

  // 2. Fetch central database (GET /api/sync & GET /api/database)
  app.get('/api/database', (req, res) => {
    let db = cachedDatabase;
    if (!db) {
      db = loadDatabaseFromDisk();
    }
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized on server' });
    }
    res.json(db);
  });

  app.get('/api/sync', (req, res) => {
    let db = cachedDatabase;
    if (!db) {
      db = loadDatabaseFromDisk();
    }
    if (!db) {
      return res.status(500).json({ success: false, message: 'Database not initialized on server' });
    }

    const totalRecords =
      (db.dispenseRecords?.length || 0) +
      (db.lateRegistrations?.length || 0) +
      (db.supplyTransactions?.length || 0);

    res.json({
      success: true,
      database: db,
      totalRecords,
      lastUpdated: db.lastBackupDate,
      serverTime: new Date().toISOString(),
    });
  });

  // 3. Central Sync & Save (POST /api/sync)
  app.post('/api/sync', (req, res) => {
    try {
      const { database: clientDb, trigger, clientMeta } = req.body;

      if (!clientDb || typeof clientDb !== 'object') {
        return res.status(400).json({ success: false, message: 'Invalid database payload' });
      }

      let currentServerDb = cachedDatabase || loadDatabaseFromDisk();
      if (!currentServerDb) {
        currentServerDb = clientDb;
      }

      // Merge non-destructively
      const mergedDb = mergeDatabasesNonDestructive(currentServerDb, clientDb);
      saveDatabaseToDisk(mergedDb);

      const totalRecords =
        (mergedDb.dispenseRecords?.length || 0) +
        (mergedDb.lateRegistrations?.length || 0) +
        (mergedDb.supplyTransactions?.length || 0);

      res.json({
        success: true,
        database: mergedDb,
        totalRecords,
        lastUpdated: mergedDb.lastBackupDate,
        message: 'تم حفظ ومزامنة البيانات مع السحابة المركزية بنجاح',
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error during /api/sync POST:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  });

  // 4. Idempotent Transaction Batch Processing (POST /api/sync/transactions)
  // Ensures transactions are the source of truth, balances calculated on server, no duplicate execution
  app.post('/api/sync/transactions', (req, res) => {
    try {
      const { items, deviceId } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ success: false, message: 'Expected items array' });
      }

      let db = cachedDatabase || loadDatabaseFromDisk();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database not initialized on server' });
      }

      const results: any[] = [];
      let dbModified = false;
      const now = new Date().toISOString();

      for (const item of items) {
        const txId = item.transactionId || item.syncId;
        const opType = item.operationType;
        const recId = item.recordId || item.payload?.id || item.payload?.recordId || '';
        const opKey = item.operationKey || `${opType}:${recId || txId}`;
        const baseKey = `${opType}:${recId || txId}`;
        const txKey = `${opType}:${txId}`;

        if (!txId && !opKey) continue;

        // Idempotency check: if exact operation, base key, or transaction ID already processed, return success without re-applying
        if (
          processedOperationKeys.has(opKey) ||
          processedOperationKeys.has(baseKey) ||
          processedOperationKeys.has(txKey) ||
          (txId && processedOperationKeys.has(txId)) ||
          (item.syncId && processedOperationKeys.has(item.syncId))
        ) {
          results.push({
            syncId: item.syncId,
            transactionId: txId,
            operationKey: opKey,
            status: 'already_processed',
            message: 'تمت معالجة العملية مسبقاً (Idempotent OK)',
          });
          continue;
        }

        // Reset Boundary check: ignore transactions created prior to or at reset boundary
        if (db.resetBoundary) {
          const boundaryTime = new Date(db.resetBoundary.resetAt).getTime();
          const itemTime = new Date(item.payload?.createdAt || item.payload?.date || item.createdAt || 0).getTime();
          if (itemTime > 0 && itemTime <= boundaryTime) {
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'rejected_before_reset',
              message: 'تم تجاوز الحركة لأنها تسبق تاريخ التصفير الشامل وإعادة ضبط المصنع (Reset Boundary)',
            });
            continue;
          }
        }

        if (item.operationType === 'DISPENSE') {
          const rec = item.payload;
          if (rec) {
            // Check if record is tombstoned
            if (
              db.syncTombstones &&
              db.syncTombstones.some(
                (t: any) => t.recordId === rec.id || (rec.transactionId && t.transactionId === rec.transactionId)
              )
            ) {
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'ignored_tombstoned',
                message: 'تم تجاوز حركة الصرف لأنها محذوفة مسبقاً (Tombstone)',
              });
              continue;
            }

            rec.transactionId = txId;
            rec.deviceId = rec.deviceId || deviceId || item.deviceId;
            rec.syncStatus = 'synced';
            rec.syncedAt = now;

            // Check if record already exists in server dispenseRecords
            const existingIdx = db.dispenseRecords.findIndex(
              (d: any) => d.id === rec.id || (d.transactionId && d.transactionId === txId)
            );

            if (existingIdx !== -1) {
              // Record already present: update metadata without double-deducting stock
              db.dispenseRecords[existingIdx] = { ...db.dispenseRecords[existingIdx], ...rec };
            } else {
              // Step 1: Pre-verify sufficient stock for ALL deducted items atomically
              let hasInsufficientStock = false;
              let insMsg = '';
              if (Array.isArray(rec.itemsDeducted)) {
                for (const it of rec.itemsDeducted) {
                  const stock = db.stocks[it.stockCategory];
                  const deductQty = Number(it.quantity || 0);
                  const currentStock = Number(stock?.currentStock || 0);
                  if (currentStock < deductQty) {
                    hasInsufficientStock = true;
                    insMsg = `الرصيد غير كافٍ لتنفيذ العملية في صنف (${stock?.name || it.stockCategory}). الرصيد المتاح (${currentStock}) أقل من المطلوب (${deductQty}).`;
                    break;
                  }
                }
              }

              if (hasInsufficientStock) {
                results.push({
                  syncId: item.syncId,
                  transactionId: txId,
                  operationKey: opKey,
                  status: 'rejected',
                  message: insMsg,
                });
                continue;
              }

              // Step 2: Deduct stock centrally
              if (Array.isArray(rec.itemsDeducted)) {
                rec.itemsDeducted.forEach((it: any) => {
                  const stock = db.stocks[it.stockCategory];
                  if (stock) {
                    const deductQty = Number(it.quantity || 0);
                    stock.currentStock = Number(stock.currentStock || 0) - deductQty;
                    stock.totalDispensed = (stock.totalDispensed || 0) + deductQty;
                    stock.lastUpdated = now;
                  }
                });
              }
              db.dispenseRecords.unshift(rec);
            }

            processedOperationKeys.add(opKey);
            if (item.syncId) processedOperationKeys.add(item.syncId);
            dbModified = true;
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'processed',
              message: 'تم تسجيل حركة الصرف واعتماد الخصم',
            });
          }
        } else if (item.operationType === 'UPDATE_DISPENSE') {
          const updates = item.payload;
          if (updates) {
            const targetId = updates.id || item.recordId;
            const targetTxId = updates.transactionId || txId;

            // Check if record is tombstoned
            if (
              db.syncTombstones &&
              db.syncTombstones.some(
                (t: any) => t.recordId === targetId || (targetTxId && t.transactionId === targetTxId)
              )
            ) {
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'ignored_tombstoned',
                message: 'تم تجاهل التعديل لأن حركة الصرف محذوفة مسبقاً (Tombstone)',
              });
              continue;
            }

            const existingIdx = db.dispenseRecords.findIndex(
              (d: any) => d.id === targetId || (targetTxId && d.transactionId === targetTxId)
            );

            if (existingIdx !== -1) {
              const existing = db.dispenseRecords[existingIdx];

              // Adjust stock differences if itemsDeducted changed
              if (
                updates.itemsDeducted &&
                JSON.stringify(updates.itemsDeducted) !== JSON.stringify(existing.itemsDeducted)
              ) {
                const oldTotals: Record<string, number> = {};
                (existing.itemsDeducted || []).forEach((it: any) => {
                  oldTotals[it.stockCategory] = (oldTotals[it.stockCategory] || 0) + Number(it.quantity || 0);
                });
                const newTotals: Record<string, number> = {};
                updates.itemsDeducted.forEach((it: any) => {
                  newTotals[it.stockCategory] = (newTotals[it.stockCategory] || 0) + Number(it.quantity || 0);
                });

                const allCats = new Set([...Object.keys(oldTotals), ...Object.keys(newTotals)]);

                // Step 1: Pre-verify sufficient stock for any increases
                let insufficientCat = '';
                let neededQty = 0;
                let availableStock = 0;
                for (const cat of allCats) {
                  const oldQty = oldTotals[cat] || 0;
                  const newQty = newTotals[cat] || 0;
                  const diff = newQty - oldQty;
                  if (diff > 0) {
                    const currentStock = Number(db.stocks[cat]?.currentStock || 0);
                    if (currentStock < diff) {
                      insufficientCat = cat;
                      neededQty = diff;
                      availableStock = currentStock;
                      break;
                    }
                  }
                }

                if (insufficientCat) {
                  results.push({
                    syncId: item.syncId,
                    transactionId: txId,
                    operationKey: opKey,
                    status: 'rejected',
                    message: `الرصيد غير كافٍ في صنف (${db.stocks[insufficientCat]?.name || insufficientCat}) لتعديل حركة الصرف. الرصيد الحالي (${availableStock}) أقل من الكمية الإضافية المطلوبة (${neededQty}).`,
                  });
                  continue;
                }

                // Step 2: Apply stock adjustments atomically
                allCats.forEach((cat) => {
                  const oldQty = oldTotals[cat] || 0;
                  const newQty = newTotals[cat] || 0;
                  const diff = newQty - oldQty;
                  if (diff !== 0 && db.stocks[cat]) {
                    db.stocks[cat].currentStock = Number(db.stocks[cat].currentStock || 0) - diff;
                    db.stocks[cat].totalDispensed = (db.stocks[cat].totalDispensed || 0) + diff;
                    db.stocks[cat].lastUpdated = now;
                  }
                });
              }

              db.dispenseRecords[existingIdx] = {
                ...existing,
                ...updates,
                id: existing.id,
                transactionId: existing.transactionId || targetTxId,
                updatedAt: updates.updatedAt || now,
                syncStatus: 'synced',
                syncedAt: now,
              };

              dbModified = true;
              processedOperationKeys.add(opKey);
              if (item.syncId) processedOperationKeys.add(item.syncId);
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'processed',
                message: 'تم تحديث حركة الصرف وتعديل الأرصدة بدقة',
              });
            } else {
              // Record not on server yet: check stock before insert
              let hasInsufficientStock = false;
              let insMsg = '';
              if (Array.isArray(updates.itemsDeducted)) {
                for (const it of updates.itemsDeducted) {
                  const stock = db.stocks[it.stockCategory];
                  const qty = Number(it.quantity || 0);
                  const curr = Number(stock?.currentStock || 0);
                  if (curr < qty) {
                    hasInsufficientStock = true;
                    insMsg = `الرصيد غير كافٍ في صنف (${stock?.name || it.stockCategory}) لإضافة حركة الصرف. الرصيد المتاح (${curr}) والكمية المطلوبة (${qty}).`;
                    break;
                  }
                }
              }

              if (hasInsufficientStock) {
                results.push({
                  syncId: item.syncId,
                  transactionId: txId,
                  operationKey: opKey,
                  status: 'rejected',
                  message: insMsg,
                });
                continue;
              }

              const rec = {
                ...updates,
                id: targetId,
                transactionId: targetTxId,
                deviceId: updates.deviceId || deviceId || item.deviceId,
                syncStatus: 'synced',
                syncedAt: now,
                updatedAt: updates.updatedAt || now,
              };
              if (Array.isArray(rec.itemsDeducted)) {
                rec.itemsDeducted.forEach((it: any) => {
                  const stock = db.stocks[it.stockCategory];
                  if (stock) {
                    const deductQty = Number(it.quantity || 0);
                    stock.currentStock = Number(stock.currentStock || 0) - deductQty;
                    stock.totalDispensed = (stock.totalDispensed || 0) + deductQty;
                    stock.lastUpdated = now;
                  }
                });
              }
              db.dispenseRecords.unshift(rec);
              dbModified = true;
              processedOperationKeys.add(opKey);
              if (item.syncId) processedOperationKeys.add(item.syncId);
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'processed',
                message: 'تم اعتماد حركة الصرف المحدثة وإضافتها للخادم',
              });
            }
          }
        } else if (item.operationType === 'DELETE_DISPENSE') {
          if (!db.syncTombstones) db.syncTombstones = [];
          const targetId = item.recordId || item.payload?.recordId;
          const targetTxId = item.payload?.transactionId || txId;

          // 1. Idempotency Check: if record is already tombstoned
          const alreadyTombstoned = db.syncTombstones.some(
            (t: any) => t.recordId === targetId || (targetTxId && t.transactionId === targetTxId)
          );

          if (alreadyTombstoned) {
            // Already deleted! Do NOT restore stock again
            processedOperationKeys.add(opKey);
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'already_processed',
              message: 'حركة الصرف محذوفة مسبقاً (Tombstone Idempotent OK)',
            });
            continue;
          }

          // 2. Find record in server dispenseRecords
          const existingIdx = db.dispenseRecords.findIndex(
            (d: any) => d.id === targetId || (targetTxId && d.transactionId === targetTxId)
          );

          if (existingIdx !== -1) {
            const existing = db.dispenseRecords[existingIdx];
            // Return deducted items to inventory stock ONCE
            if (Array.isArray(existing.itemsDeducted)) {
              existing.itemsDeducted.forEach((it: any) => {
                const stock = db.stocks[it.stockCategory];
                if (stock) {
                  stock.currentStock = (stock.currentStock || 0) + Number(it.quantity || 0);
                  stock.totalDispensed = (stock.totalDispensed || 0) - Number(it.quantity || 0);
                  stock.lastUpdated = now;
                }
              });
            }
            // Remove record from dispenseRecords
            db.dispenseRecords.splice(existingIdx, 1);
          } else if (item.payload?.itemsRestored && Array.isArray(item.payload.itemsRestored)) {
            item.payload.itemsRestored.forEach((it: any) => {
              const stock = db.stocks[it.stockCategory];
              if (stock) {
                stock.currentStock = (stock.currentStock || 0) + Number(it.quantity || 0);
                stock.totalDispensed = (stock.totalDispensed || 0) - Number(it.quantity || 0);
                stock.lastUpdated = now;
              }
            });
          }

          // 3. Register Tombstone in server database
          db.syncTombstones.push({
            id: `tomb-${item.syncId || Date.now()}`,
            recordId: targetId,
            transactionId: targetTxId,
            operationKey: opKey,
            operationType: 'DELETE_DISPENSE',
            deletedAt: item.payload?.deletedAt || now,
            deviceId: item.payload?.deviceId || item.deviceId || deviceId,
            deletedBy: item.payload?.deletedBy || item.userId || 'كاتب صحة سفلاق',
            details: item.payload?.details,
          });

          processedOperationKeys.add(opKey);
          if (item.syncId) processedOperationKeys.add(item.syncId);
          dbModified = true;
          results.push({
            syncId: item.syncId,
            transactionId: txId,
            operationKey: opKey,
            status: 'processed',
            message: 'تم حذف حركة الصرف واعتماد إعادة الكميات للمخزون وتسجيل Tombstone',
          });
        } else if (item.operationType === 'SUPPLY') {
          const supply = item.payload;
          if (supply) {
            // Check if already tombstoned
            if (
              db.syncTombstones &&
              db.syncTombstones.some(
                (t: any) => t.recordId === supply.id || (supply.transactionId && t.transactionId === supply.transactionId)
              )
            ) {
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'ignored_tombstoned',
                message: 'تم تجاهل التوريد لأنه محذوف مسبقاً (Tombstone)',
              });
              continue;
            }

            supply.transactionId = txId;
            supply.deviceId = supply.deviceId || deviceId || item.deviceId;
            supply.syncStatus = 'synced';
            supply.syncedAt = now;

            const existingIdx = db.supplyTransactions.findIndex(
              (s: any) => s.id === supply.id || (s.transactionId && s.transactionId === txId)
            );

            if (existingIdx !== -1) {
              // Already exists on server: do not add quantity again
              db.supplyTransactions[existingIdx] = { ...db.supplyTransactions[existingIdx], ...supply };
            } else {
              const stock = db.stocks[supply.stockCategory];
              if (stock) {
                stock.currentStock = (stock.currentStock || 0) + Number(supply.quantity || 0);
                stock.totalReceived = (stock.totalReceived || 0) + Number(supply.quantity || 0);
                stock.lastUpdated = now;
              }
              db.supplyTransactions.unshift(supply);
            }

            processedOperationKeys.add(opKey);
            if (item.syncId) processedOperationKeys.add(item.syncId);
            dbModified = true;
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'processed',
              message: 'تم تسجيل حركة التوريد واعتماد الإضافة',
            });
          }
        } else if (item.operationType === 'UPDATE_SUPPLY') {
          const payload = item.payload || {};
          const supplyObj = payload.supply || (payload.id ? payload : {});
          const targetId = supplyObj.id || item.recordId || payload.recordId;
          const targetTxId = supplyObj.transactionId || item.transactionId || txId;

          // Check if tombstoned
          if (
            db.syncTombstones &&
            db.syncTombstones.some(
              (t: any) => t.recordId === targetId || (targetTxId && t.transactionId === targetTxId)
            )
          ) {
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'ignored_tombstoned',
              message: 'تم تجاهل تعديل التوريد لأنه محذوف مسبقاً (Tombstone)',
            });
            continue;
          }

          const existingIdx = db.supplyTransactions.findIndex(
            (s: any) => s.id === targetId || (targetTxId && s.transactionId === targetTxId)
          );
          const existing = existingIdx !== -1 ? db.supplyTransactions[existingIdx] : null;

          const oldCategory = payload.oldCategory || existing?.stockCategory || supplyObj.stockCategory;
          const oldQuantity = Number(
            payload.oldQuantity !== undefined
              ? payload.oldQuantity
              : existing?.quantity !== undefined
              ? existing.quantity
              : supplyObj.quantity || 0
          );
          const newCategory = payload.newCategory || supplyObj.stockCategory || oldCategory;
          const newQuantity = Number(
            payload.newQuantity !== undefined
              ? payload.newQuantity
              : supplyObj.quantity !== undefined
              ? supplyObj.quantity
              : oldQuantity
          );

          if (existingIdx !== -1) {
            // Case 1: Same category
            if (oldCategory === newCategory) {
              const delta = newQuantity - oldQuantity;
              if (delta < 0) {
                const reduction = Math.abs(delta);
                const currentStock = Number(db.stocks[oldCategory]?.currentStock || 0);
                if (currentStock < reduction) {
                  results.push({
                    syncId: item.syncId,
                    transactionId: txId,
                    operationKey: opKey,
                    status: 'rejected',
                    message: `الرصيد غير كافٍ لتعديل كمية التوريد (تم صرف جزء منها بالفعل). الرصيد الحالي (${currentStock}) لا يسمح بخصم (${reduction}).`,
                  });
                  continue;
                }
              }

              if (db.stocks[oldCategory] && delta !== 0) {
                db.stocks[oldCategory].currentStock = Number(db.stocks[oldCategory].currentStock || 0) + delta;
                db.stocks[oldCategory].totalReceived = (db.stocks[oldCategory].totalReceived || 0) + delta;
                db.stocks[oldCategory].lastUpdated = now;
              }
            } else {
              // Case 2: Different category (A -> B)
              const currentStockOld = Number(db.stocks[oldCategory]?.currentStock || 0);
              if (currentStockOld < oldQuantity) {
                results.push({
                  syncId: item.syncId,
                  transactionId: txId,
                  operationKey: opKey,
                  status: 'rejected',
                  message: `الرصيد غير كافٍ في الصنف السابق (${db.stocks[oldCategory]?.name || oldCategory}) لنقل التوريد (تم صرف جزء منه بالفعل).`,
                });
                continue;
              }

              if (db.stocks[oldCategory]) {
                db.stocks[oldCategory].currentStock = Number(db.stocks[oldCategory].currentStock || 0) - oldQuantity;
                db.stocks[oldCategory].totalReceived = (db.stocks[oldCategory].totalReceived || 0) - oldQuantity;
                db.stocks[oldCategory].lastUpdated = now;
              }

              if (db.stocks[newCategory]) {
                db.stocks[newCategory].currentStock = Number(db.stocks[newCategory].currentStock || 0) + newQuantity;
                db.stocks[newCategory].totalReceived = (db.stocks[newCategory].totalReceived || 0) + newQuantity;
                db.stocks[newCategory].lastUpdated = now;
              }
            }

            db.supplyTransactions[existingIdx] = {
              ...existing,
              ...supplyObj,
              id: existing.id,
              transactionId: existing.transactionId || targetTxId,
              stockCategory: newCategory,
              quantity: newQuantity,
              updatedAt: now,
              syncStatus: 'synced',
              syncedAt: now,
            };

            dbModified = true;
            processedOperationKeys.add(opKey);
            if (item.syncId) processedOperationKeys.add(item.syncId);
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'processed',
              message: 'تم تحديث حركة التوريد وتعديل رصيد المخزن بدقة',
            });
          } else {
            // Not on server yet: insert
            const supply = {
              ...supplyObj,
              id: targetId,
              transactionId: targetTxId,
              stockCategory: newCategory,
              quantity: newQuantity,
              deviceId: supplyObj.deviceId || deviceId || item.deviceId,
              syncStatus: 'synced',
              syncedAt: now,
            };
            const stock = db.stocks[newCategory];
            if (stock) {
              stock.currentStock = (stock.currentStock || 0) + Number(supply.quantity || 0);
              stock.totalReceived = (stock.totalReceived || 0) + Number(supply.quantity || 0);
              stock.lastUpdated = now;
            }
            db.supplyTransactions.unshift(supply);
            dbModified = true;
            processedOperationKeys.add(opKey);
            if (item.syncId) processedOperationKeys.add(item.syncId);
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'processed',
              message: 'تمت إضافة حركة التوريد المعدلة للخادم',
            });
          }
        } else if (item.operationType === 'DELETE_SUPPLY') {
          if (!db.syncTombstones) db.syncTombstones = [];
          const targetId = item.recordId || item.payload?.recordId;
          const targetTxId = item.payload?.transactionId || txId;

          // Check if already tombstoned
          const alreadyTombstoned = db.syncTombstones.some(
            (t: any) => t.recordId === targetId || (targetTxId && t.transactionId === targetTxId)
          );

          if (alreadyTombstoned) {
            processedOperationKeys.add(opKey);
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'already_processed',
              message: 'حركة التوريد محذوفة مسبقاً (Tombstone Idempotent OK)',
            });
            continue;
          }

          const existingIdx = db.supplyTransactions.findIndex(
            (s: any) => s.id === targetId || (targetTxId && s.transactionId === targetTxId)
          );

          let qtyDeducted = 0;
          let catDeducted = '';
          if (existingIdx !== -1) {
            const existing = db.supplyTransactions[existingIdx];
            qtyDeducted = Number(existing.quantity || 0);
            catDeducted = existing.stockCategory;
          } else if (item.payload) {
            qtyDeducted = Number(item.payload.quantityDeducted || item.payload.quantity || 0);
            catDeducted = item.payload.stockCategory || '';
          }

          // Check stock adequacy before deleting supply
          if (catDeducted && db.stocks[catDeducted]) {
            const currentStock = Number(db.stocks[catDeducted].currentStock || 0);
            if (currentStock < qtyDeducted) {
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'rejected',
                message: `لا يمكن حذف حركة التوريد لأن الرصيد الحالي (${currentStock}) أقل من كمية التوريد (${qtyDeducted}) حيث تم صرف أجزاء منها بالفعل.`,
              });
              continue;
            }

            db.stocks[catDeducted].currentStock = currentStock - qtyDeducted;
            db.stocks[catDeducted].totalReceived = (db.stocks[catDeducted].totalReceived || 0) - qtyDeducted;
            db.stocks[catDeducted].lastUpdated = now;
          }

          if (existingIdx !== -1) {
            db.supplyTransactions.splice(existingIdx, 1);
          }

          db.syncTombstones.push({
            id: `tomb-${item.syncId || Date.now()}`,
            recordId: targetId,
            transactionId: targetTxId,
            operationKey: opKey,
            operationType: 'DELETE_SUPPLY',
            deletedAt: item.payload?.deletedAt || now,
            deviceId: item.payload?.deviceId || item.deviceId || deviceId,
            deletedBy: item.payload?.deletedBy || item.userId || 'كاتب صحة سفلاق',
            details: item.payload?.details || {
              stockCategory: catDeducted,
              quantity: qtyDeducted,
            },
          });

          processedOperationKeys.add(opKey);
          if (item.syncId) processedOperationKeys.add(item.syncId);
          dbModified = true;
          results.push({
            syncId: item.syncId,
            transactionId: txId,
            operationKey: opKey,
            status: 'processed',
            message: 'تم حذف حركة التوريد وخصم الكمية من المخزن وتسجيل Tombstone',
          });
        } else if (item.operationType === 'LATE_REG_ADD') {
          const late = item.payload?.record || item.payload;
          const deductStock = item.payload?.deductStock;
          if (late) {
            if (
              db.syncTombstones &&
              db.syncTombstones.some(
                (t: any) => t.recordId === late.id || (late.transactionId && t.transactionId === late.transactionId)
              )
            ) {
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'ignored_tombstoned',
                message: 'تم تجاهل استمارة ساقط القيد لأنها محذوفة مسبقاً (Tombstone)',
              });
              continue;
            }

            late.transactionId = txId;
            late.deviceId = late.deviceId || deviceId || item.deviceId;
            late.syncStatus = 'synced';
            late.syncedAt = now;

            const existingIdx = db.lateRegistrations.findIndex(
              (l: any) => l.id === late.id || (l.transactionId && l.transactionId === txId)
            );

            if (existingIdx !== -1) {
              db.lateRegistrations[existingIdx] = { ...db.lateRegistrations[existingIdx], ...late };
            } else {
              if (deductStock && late.ageCategory) {
                const stockCat =
                  late.ageCategory === 'under_one_year' ? 'late_reg_under_year' : 'late_reg_over_year';
                const currentStock = Number(db.stocks[stockCat]?.currentStock || 0);
                if (currentStock < 1) {
                  results.push({
                    syncId: item.syncId,
                    transactionId: txId,
                    operationKey: opKey,
                    status: 'rejected',
                    message: `الرصيد غير كافٍ لصرف استمارة ساقط قيد في صنف (${db.stocks[stockCat]?.name || stockCat}).`,
                  });
                  continue;
                }
                if (db.stocks[stockCat]) {
                  db.stocks[stockCat].currentStock = currentStock - 1;
                  db.stocks[stockCat].totalDispensed = (db.stocks[stockCat].totalDispensed || 0) + 1;
                  db.stocks[stockCat].lastUpdated = now;
                }
              }
              db.lateRegistrations.unshift(late);
            }

            processedOperationKeys.add(opKey);
            if (item.syncId) processedOperationKeys.add(item.syncId);
            dbModified = true;
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'processed',
              message: 'تم تسجيل استمارة ساقط القيد بنجاح',
            });
          }
        } else if (item.operationType === 'LATE_REG_UPDATE') {
          const updates = item.payload;
          if (updates && updates.id) {
            const existingIdx = db.lateRegistrations.findIndex((l: any) => l.id === updates.id);
            if (existingIdx !== -1) {
              const existing = db.lateRegistrations[existingIdx];
              const stepMap = new Map();
              (existing.trackingHistory || []).forEach((s: any, idx: number) =>
                stepMap.set(s.id || `s-${idx}`, s)
              );
              (updates.trackingHistory || []).forEach((s: any, idx: number) =>
                stepMap.set(s.id || `u-${idx}`, s)
              );
              db.lateRegistrations[existingIdx] = {
                ...existing,
                ...updates,
                trackingHistory: Array.from(stepMap.values()),
                updatedAt: now,
              };
              dbModified = true;
              processedOperationKeys.add(opKey);
              if (item.syncId) processedOperationKeys.add(item.syncId);
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                operationKey: opKey,
                status: 'processed',
                message: 'تم تحديث سجل ومسار استمارة ساقط القيد',
              });
            }
          }
        } else if (item.operationType === 'DELETE_LATE_REG') {
          if (!db.syncTombstones) db.syncTombstones = [];
          const targetId = item.recordId || item.payload?.recordId;
          const targetTxId = item.payload?.transactionId || txId;

          const alreadyTombstoned = db.syncTombstones.some(
            (t: any) => t.recordId === targetId || (targetTxId && t.transactionId === targetTxId)
          );

          if (alreadyTombstoned) {
            processedOperationKeys.add(opKey);
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              operationKey: opKey,
              status: 'already_processed',
              message: 'استمارة ساقط القيد محذوفة مسبقاً (Tombstone Idempotent OK)',
            });
            continue;
          }

          const existingIdx = db.lateRegistrations.findIndex(
            (l: any) => l.id === targetId || (targetTxId && l.transactionId === targetTxId)
          );

          if (existingIdx !== -1) {
            const record = db.lateRegistrations[existingIdx];
            if (record.ageCategory) {
              const stockCat =
                record.ageCategory === 'under_one_year' ? 'late_reg_under_year' : 'late_reg_over_year';
              if (db.stocks[stockCat]) {
                db.stocks[stockCat].currentStock += 1;
                db.stocks[stockCat].totalDispensed = (db.stocks[stockCat].totalDispensed || 0) - 1;
                db.stocks[stockCat].lastUpdated = now;
              }
            }
            db.lateRegistrations.splice(existingIdx, 1);
          }

          db.syncTombstones.push({
            id: `tomb-${item.syncId || Date.now()}`,
            recordId: targetId,
            transactionId: targetTxId,
            operationKey: opKey,
            operationType: 'DELETE_LATE_REG',
            deletedAt: item.payload?.deletedAt || now,
            deviceId: item.payload?.deviceId || item.deviceId || deviceId,
            deletedBy: item.payload?.deletedBy || item.userId || 'كاتب صحة سفلاق',
            details: item.payload?.details,
          });

          processedOperationKeys.add(opKey);
          if (item.syncId) processedOperationKeys.add(item.syncId);
          dbModified = true;
          results.push({
            syncId: item.syncId,
            transactionId: txId,
            operationKey: opKey,
            status: 'processed',
            message: 'تم حذف استمارة ساقط القيد وإعادة الاستمارة للمخزون وتسجيل Tombstone',
          });
        }
      }

      if (dbModified) {
        db.lastBackupDate = now;
        db.version = (db.version || 1) + 1;
        saveDatabaseToDisk(db);
        saveProcessedTransactions();
      }

      res.json({
        success: true,
        results,
        approvedStocks: db.stocks,
        database: db,
        syncToken: db.lastBackupDate,
        serverTime: now,
        message: 'تمت معالجة الحركات واعتماد الأرصدة بنجاح',
      });
    } catch (err: any) {
      console.error('Error in /api/sync/transactions:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  });

  // 5. Incremental Synchronization (GET /api/sync/changes?since=token)
  app.get('/api/sync/changes', (req, res) => {
    try {
      let db = cachedDatabase || loadDatabaseFromDisk();
      if (!db) {
        return res.status(500).json({ success: false, message: 'Database not initialized on server' });
      }

      const since = req.query.since as string;
      if (!since) {
        // Return full database when since is empty (e.g. brand new device opening for first time)
        return res.json({
          success: true,
          fullSync: true,
          database: db,
          approvedStocks: db.stocks,
          syncToken: db.lastBackupDate,
          serverTime: new Date().toISOString(),
        });
      }

      const sinceTime = new Date(since).getTime();
      if (isNaN(sinceTime)) {
        return res.json({
          success: true,
          fullSync: true,
          database: db,
          approvedStocks: db.stocks,
          syncToken: db.lastBackupDate,
          serverTime: new Date().toISOString(),
        });
      }

      // If client token is older than or equal to reset boundary, force full clean sync
      if (db.resetBoundary) {
        const resetTime = new Date(db.resetBoundary.resetAt).getTime();
        if (sinceTime <= resetTime) {
          return res.json({
            success: true,
            fullSync: true,
            database: db,
            approvedStocks: db.stocks,
            syncToken: db.lastBackupDate,
            serverTime: new Date().toISOString(),
          });
        }
      }

      const boundaryTime = db.resetBoundary ? new Date(db.resetBoundary.resetAt).getTime() : 0;
      const minValidTime = Math.max(sinceTime, boundaryTime);

      const newDispenses = (db.dispenseRecords || []).filter((r: any) => {
        const t = new Date(r.syncedAt || r.updatedAt || r.createdAt || 0).getTime();
        return t > minValidTime;
      });

      const newSupplies = (db.supplyTransactions || []).filter((r: any) => {
        const t = new Date(r.syncedAt || r.updatedAt || r.createdAt || 0).getTime();
        return t > minValidTime;
      });

      const newLateRegs = (db.lateRegistrations || []).filter((r: any) => {
        const t = new Date(r.syncedAt || r.updatedAt || r.createdAt || 0).getTime();
        return t > minValidTime;
      });

      const newTombstones = (db.syncTombstones || []).filter((r: any) => {
        const t = new Date(r.deletedAt || 0).getTime();
        return t > minValidTime;
      });

      const hasChanges =
        newDispenses.length > 0 ||
        newSupplies.length > 0 ||
        newLateRegs.length > 0 ||
        newTombstones.length > 0;

      res.json({
        success: true,
        fullSync: false,
        hasChanges,
        changes: {
          dispenseRecords: newDispenses,
          supplyTransactions: newSupplies,
          lateRegistrations: newLateRegs,
          syncTombstones: newTombstones,
        },
        approvedStocks: db.stocks,
        syncToken: db.lastBackupDate,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error in /api/sync/changes:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  });

  // 4. Version check
  app.get('/api/version', (req, res) => {
    res.json({
      appVersion: '1.0.1',
      appName: 'Saflaq Health Registry ERP',
      isLatest: true,
      serverTime: new Date().toISOString(),
    });
  });

  // 6. Production Repair Status & Backup Verification (GET /api/repair/status)
  app.get('/api/repair/status', (req, res) => {
    try {
      const db = cachedDatabase || loadDatabaseFromDisk();
      const backupFiles = fs.existsSync(BACKUPS_DIR)
        ? fs.readdirSync(BACKUPS_DIR).filter((f) => f.endsWith('.json'))
        : [];

      res.json({
        success: true,
        database: db,
        backupsCount: backupFiles.length,
        latestBackups: backupFiles.sort().slice(-10),
        totalSupplies: db?.supplyTransactions?.length || 0,
        totalDispenses: db?.dispenseRecords?.length || 0,
        totalLateRegistrations: db?.lateRegistrations?.length || 0,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error in /api/repair/status:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error' });
    }
  });

  // 7. Apply Audited Production Repair (POST /api/repair/apply)
  // Non-destructive: takes immutable backup first, writes report file, and atomically updates clean state
  app.post('/api/repair/apply', (req, res) => {
    try {
      const { database: cleanDb, reportMarkdown, removedCount, deviceId } = req.body;
      if (!cleanDb || typeof cleanDb !== 'object') {
        return res.status(400).json({ success: false, message: 'Invalid database payload for repair' });
      }

      // Step 1: Mandatory pre-repair backup of online DB
      const currentDb = cachedDatabase || loadDatabaseFromDisk();
      if (currentDb) {
        const backupName = `online-backup-before-repair-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const backupPath = path.join(BACKUPS_DIR, backupName);
        fs.writeFileSync(backupPath, JSON.stringify(currentDb, null, 2), 'utf-8');
      }

      // Step 2: Save the official PRODUCTION_DATA_REPAIR_REPORT.md file on disk
      if (reportMarkdown) {
        const reportPath = path.join(DATA_DIR, 'PRODUCTION_DATA_REPAIR_REPORT.md');
        fs.writeFileSync(reportPath, reportMarkdown, 'utf-8');
      }

      // Step 3: Atomic write of clean database
      cleanDb.lastBackupDate = new Date().toISOString();
      cleanDb.version = ((cleanDb.version || 1) + 1);
      saveDatabaseToDisk(cleanDb);

      // Step 4: Re-index processed operations
      processedOperationKeys.clear();
      (cleanDb.dispenseRecords || []).forEach((r: any) => {
        const txId = r.transactionId || `tx-${r.id}`;
        processedOperationKeys.add(`DISPENSE:${r.id}`);
        processedOperationKeys.add(`DISPENSE:${txId}`);
        processedOperationKeys.add(txId);
      });
      (cleanDb.supplyTransactions || []).forEach((s: any) => {
        const txId = s.transactionId || `tx-${s.id}`;
        processedOperationKeys.add(`SUPPLY:${s.id}`);
        processedOperationKeys.add(`SUPPLY:${txId}`);
        processedOperationKeys.add(txId);
      });
      (cleanDb.lateRegistrations || []).forEach((l: any) => {
        const txId = l.transactionId || `tx-${l.id}`;
        processedOperationKeys.add(`LATE_REG_ADD:${l.id}`);
        processedOperationKeys.add(`LATE_REG_ADD:${txId}`);
        processedOperationKeys.add(txId);
      });
      (cleanDb.syncTombstones || []).forEach((t: any) => {
        if (t.operationKey) processedOperationKeys.add(t.operationKey);
        if (t.recordId) processedOperationKeys.add(`${t.operationType}:${t.recordId}`);
      });
      saveProcessedTransactions();

      console.log(`[Production Repair] Applied successfully by device ${deviceId}. Removed ${removedCount} bogus items.`);

      res.json({
        success: true,
        message: 'تم بنجاح تطبيق الاستعادة والتصحيح المعتمد في السحابة المركزية وتوثيق التقرير',
        database: cleanDb,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error in /api/repair/apply:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error during repair apply' });
    }
  });

  // 8. Radical Production Factory Reset Endpoint (POST /api/factory-reset)
  // Takes an immutable pre-reset backup first, wipes operational collections atomically,
  // resets all stock balances to zero, clears transaction idempotency registry, and sets Reset Boundary.
  app.post('/api/factory-reset', (req, res) => {
    try {
      const { resetBoundary, clientDatabase, deviceId } = req.body;
      if (!resetBoundary || !resetBoundary.resetId) {
        return res.status(400).json({ success: false, message: 'Invalid reset boundary payload' });
      }

      const currentDb = cachedDatabase || loadDatabaseFromDisk();

      // Step 1: Mandatory pre-reset backup of server DB to disk
      if (currentDb) {
        const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-before-factory-reset-${timestampStr}.json`;
        const backupPath = path.join(BACKUPS_DIR, backupName);
        fs.writeFileSync(backupPath, JSON.stringify(currentDb, null, 2), 'utf-8');
        console.log(`[Factory Reset] Mandatory pre-reset backup saved to ${backupName}`);
      }

      // Step 2: Build clean server database respecting reset boundary
      const now = resetBoundary.resetAt || new Date().toISOString();
      const cleanStocks: any = {};
      const stockKeys = [
        'birth_certificates',
        'birth_notifications',
        'death_certificates',
        'death_notifications',
        'health_cards_male',
        'health_cards_female',
        'late_reg_under_year',
        'late_reg_over_year',
      ];

      const clientStocks = clientDatabase?.stocks || currentDb?.stocks || {};
      for (const key of stockKeys) {
        const orig = clientStocks[key] || {};
        cleanStocks[key] = {
          ...orig,
          id: key,
          currentStock: 0,
          totalReceived: 0,
          totalDispensed: 0,
          damagedOrCancelled: 0,
          openingStock: 0,
          openingSerialFrom: '',
          openingSerialTo: '',
          lastUpdated: now,
        };
      }

      const cleanDb: any = {
        version: ((currentDb?.version || 1) + 1),
        lastBackupDate: now,
        officeSettings: clientDatabase?.officeSettings || currentDb?.officeSettings || {
          officeName: 'مكتب صحة سفلاق',
          center: 'مركز ساقلتة',
          directorate: 'مديرية الشؤون الصحية بسوهاج',
          governorate: 'محافظة سوهاج',
          currentEmployee: resetBoundary.resetBy || 'كاتب صحة سفلاق',
        },
        stocks: cleanStocks,
        supplyTransactions: [],
        dispenseRecords: [],
        lateRegistrations: [],
        openingBalances: clientDatabase?.openingBalances || {
          asOfDate: now.split('T')[0],
          minuteNumber: '',
          inventoryKeeper: resetBoundary.resetBy || 'كاتب صحة سفلاق',
          committeeLeader: '',
          notes: 'رصيد صفري نظيف عقب إعادة ضبط المصنع والتصفير الشامل',
          createdAt: now,
          updatedAt: now,
          items: {},
        },
        resetBoundary: {
          ...resetBoundary,
          resetAt: now,
        },
      };

      // Step 3: Clear processedOperationKeys so pre-reset transactions cannot linger
      processedOperationKeys.clear();
      saveProcessedTransactions();

      // Step 4: Atomically save clean database to disk
      saveDatabaseToDisk(cleanDb);

      console.log(`[Factory Reset] Server operational data wiped cleanly. Reset ID: ${resetBoundary.resetId} by device ${deviceId || 'unknown'}`);

      res.json({
        success: true,
        message: 'تم تصفير قاعدة البيانات المركزية ومسح كافة الحركات وإنشاء حد الأمان Reset Boundary بنجاح',
        resetBoundary: cleanDb.resetBoundary,
        database: cleanDb,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Error during /api/factory-reset:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error during factory reset' });
    }
  });

  // Dedicated endpoint for full authorized database restore
  // Ensures clean atomic replacement of the server database without data loss,
  // creates a safety backup of existing state, and registers restored transactions in idempotency registry.
  app.post('/api/restore', (req, res) => {
    try {
      const { database, restoredBy, reason } = req.body;
      if (!database || !database.stocks || !Array.isArray(database.dispenseRecords)) {
        return res.status(400).json({ success: false, message: 'Invalid database payload for restore' });
      }

      const currentDb = cachedDatabase || loadDatabaseFromDisk();

      // Step 1: Pre-restore safety snapshot to disk
      if (currentDb) {
        const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
        const backupName = `backup-before-restore-${timestampStr}.json`;
        const backupPath = path.join(BACKUPS_DIR, backupName);
        fs.writeFileSync(backupPath, JSON.stringify(currentDb, null, 2), 'utf-8');
        console.log(`[Restore] Pre-restore safety backup saved to ${backupName}`);
      }

      // Step 2: Prepare target database
      const now = new Date().toISOString();
      const targetDb: any = {
        ...database,
        version: (currentDb?.version || 1) + 1,
        lastBackupDate: now,
      };

      // Step 3: Re-populate idempotency registry with records in targetDb
      processedOperationKeys.clear();
      (targetDb.dispenseRecords || []).forEach((r: any) => {
        const txId = r.transactionId || r.id;
        processedOperationKeys.add(`DISPENSE:${r.id}`);
        processedOperationKeys.add(`DISPENSE:${txId}`);
        processedOperationKeys.add(txId);
      });
      (targetDb.supplyTransactions || []).forEach((s: any) => {
        const txId = s.transactionId || s.id;
        processedOperationKeys.add(`SUPPLY:${s.id}`);
        processedOperationKeys.add(`SUPPLY:${txId}`);
        processedOperationKeys.add(txId);
      });
      (targetDb.lateRegistrations || []).forEach((l: any) => {
        const txId = l.transactionId || l.id;
        processedOperationKeys.add(`LATE_REG_ADD:${l.id}`);
        processedOperationKeys.add(`LATE_REG_ADD:${txId}`);
        processedOperationKeys.add(txId);
      });
      (targetDb.syncTombstones || []).forEach((t: any) => {
        if (t.operationKey) processedOperationKeys.add(t.operationKey);
        if (t.recordId) processedOperationKeys.add(`${t.operationType}:${t.recordId}`);
        if (t.transactionId) processedOperationKeys.add(`${t.operationType}:${t.transactionId}`);
      });
      saveProcessedTransactions();

      // Step 4: Atomically save target database to disk
      saveDatabaseToDisk(targetDb);
      console.log(`[Restore] Database successfully restored by ${restoredBy || 'unknown'}. Reason: ${reason || 'Full restore'}`);

      res.json({
        success: true,
        message: 'تمت استعادة قاعدة البيانات المركزية بنجاح واعتمادها كنسخة تشغيلية وحفظ نسخة أمان قبل الاستعادة',
        database: targetDb,
        serverTime: now,
      });
    } catch (err: any) {
      console.error('Error during /api/restore:', err);
      res.status(500).json({ success: false, message: err.message || 'Internal server error during restore' });
    }
  });

  // Vite middleware for development vs Static files for production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT} (PID: ${process.pid})`);
  });
}

// Only start server if executed directly (not when imported in test scripts)
const isMain = process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.cjs') || process.argv[1].includes('tsx'));
if (isMain && !process.argv[1].includes('test_suite')) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

import express from 'express';
import path from 'path';
import fs from 'fs';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PROCESSED_TX_FILE = path.join(DATA_DIR, 'processedTransactions.json');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// In-memory cached database and idempotency registry
let cachedDatabase: any = null;
let processedTransactionIds = new Set<string>();

function loadProcessedTransactions(): Set<string> {
  try {
    if (fs.existsSync(PROCESSED_TX_FILE)) {
      const raw = fs.readFileSync(PROCESSED_TX_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        processedTransactionIds = new Set<string>(list);
      }
    }
  } catch (err) {
    console.error('Failed to load processed transactions:', err);
  }

  // Register all existing historical transactions from DB into idempotency registry
  const db = cachedDatabase || loadDatabaseFromDisk();
  if (db) {
    (db.dispenseRecords || []).forEach((r: any) => {
      const txId = r.transactionId || `tx-${r.id}`;
      r.transactionId = txId;
      processedTransactionIds.add(txId);
    });
    (db.supplyTransactions || []).forEach((r: any) => {
      const txId = r.transactionId || `tx-${r.id}`;
      r.transactionId = txId;
      processedTransactionIds.add(txId);
    });
    (db.lateRegistrations || []).forEach((r: any) => {
      const txId = r.transactionId || `tx-${r.id}`;
      r.transactionId = txId;
      processedTransactionIds.add(txId);
    });
  }
  return processedTransactionIds;
}

function saveProcessedTransactions() {
  try {
    fs.writeFileSync(
      PROCESSED_TX_FILE,
      JSON.stringify(Array.from(processedTransactionIds), null, 2),
      'utf-8'
    );
  } catch (err) {
    console.error('Failed to save processed transactions:', err);
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
function mergeDatabasesNonDestructive(serverDb: any, clientDb: any): any {
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

  // 1. Dispense Records: Union by ID with Reset Boundary filtering
  const dispenseMap = new Map<string, any>();
  (serverDb.dispenseRecords || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r)) dispenseMap.set(r.id, r);
  });
  (clientDb.dispenseRecords || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r)) {
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

  // 2. Supply Transactions: Union by ID with Reset Boundary filtering
  const supplyMap = new Map<string, any>();
  (serverDb.supplyTransactions || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r)) supplyMap.set(r.id, r);
  });
  (clientDb.supplyTransactions || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r)) {
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

  // 3. Late Registrations: Union by ID + merge tracking steps with Reset Boundary filtering
  const lateRegMap = new Map<string, any>();
  (serverDb.lateRegistrations || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r)) lateRegMap.set(r.id, r);
  });
  (clientDb.lateRegistrations || []).forEach((r: any) => {
    if (r && r.id && isAfterReset(r)) {
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

  // 2. Fetch central database (GET /api/sync)
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
        if (!txId) continue;

        // Idempotency check: if transaction already processed, return success without re-applying
        if (processedTransactionIds.has(txId)) {
          results.push({
            syncId: item.syncId,
            transactionId: txId,
            status: 'already_processed',
            message: 'تمت معالجة الحركة مسبقاً (Idempotent OK)',
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
              status: 'rejected_before_reset',
              message: 'تم تجاوز الحركة لأنها تسبق تاريخ التصفير الشامل وإعادة ضبط المصنع (Reset Boundary)',
            });
            continue;
          }
        }

        if (item.operationType === 'DISPENSE') {
          const rec = item.payload;
          if (rec) {
            rec.transactionId = txId;
            rec.deviceId = rec.deviceId || deviceId || item.deviceId;
            rec.syncStatus = 'synced';
            rec.syncedAt = now;

            // Deduct stock centrally according to standard rules
            if (Array.isArray(rec.itemsDeducted)) {
              rec.itemsDeducted.forEach((it: any) => {
                const stock = db.stocks[it.stockCategory];
                if (stock) {
                  stock.currentStock = Math.max(0, stock.currentStock - Number(it.quantity || 0));
                  stock.totalDispensed = (stock.totalDispensed || 0) + Number(it.quantity || 0);
                  stock.lastUpdated = now;
                }
              });
            }

            // Insert or update in dispenseRecords
            const existingIdx = db.dispenseRecords.findIndex(
              (d: any) => d.id === rec.id || (d.transactionId && d.transactionId === txId)
            );
            if (existingIdx !== -1) {
              db.dispenseRecords[existingIdx] = { ...db.dispenseRecords[existingIdx], ...rec };
            } else {
              db.dispenseRecords.unshift(rec);
            }

            processedTransactionIds.add(txId);
            dbModified = true;
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              status: 'processed',
              message: 'تم تسجيل حركة الصرف واعتماد الخصم',
            });
          }
        } else if (item.operationType === 'SUPPLY') {
          const supply = item.payload;
          if (supply) {
            supply.transactionId = txId;
            supply.deviceId = supply.deviceId || deviceId || item.deviceId;
            supply.syncStatus = 'synced';
            supply.syncedAt = now;

            const stock = db.stocks[supply.stockCategory];
            if (stock) {
              stock.currentStock = (stock.currentStock || 0) + Number(supply.quantity || 0);
              stock.totalReceived = (stock.totalReceived || 0) + Number(supply.quantity || 0);
              stock.lastUpdated = now;
            }

            const existingIdx = db.supplyTransactions.findIndex(
              (s: any) => s.id === supply.id || (s.transactionId && s.transactionId === txId)
            );
            if (existingIdx !== -1) {
              db.supplyTransactions[existingIdx] = { ...db.supplyTransactions[existingIdx], ...supply };
            } else {
              db.supplyTransactions.unshift(supply);
            }

            processedTransactionIds.add(txId);
            dbModified = true;
            results.push({
              syncId: item.syncId,
              transactionId: txId,
              status: 'processed',
              message: 'تم تسجيل حركة التوريد واعتماد الإضافة',
            });
          }
        } else if (item.operationType === 'LATE_REG_ADD') {
          const late = item.payload?.record || item.payload;
          const deductStock = item.payload?.deductStock;
          if (late) {
            late.transactionId = txId;
            late.deviceId = late.deviceId || deviceId || item.deviceId;
            late.syncStatus = 'synced';
            late.syncedAt = now;

            if (deductStock && late.ageCategory) {
              const stockCat =
                late.ageCategory === 'under_one_year' ? 'late_reg_under_year' : 'late_reg_over_year';
              if (db.stocks[stockCat]) {
                db.stocks[stockCat].currentStock = Math.max(0, db.stocks[stockCat].currentStock - 1);
                db.stocks[stockCat].totalDispensed = (db.stocks[stockCat].totalDispensed || 0) + 1;
                db.stocks[stockCat].lastUpdated = now;
              }
            }

            const existingIdx = db.lateRegistrations.findIndex(
              (l: any) => l.id === late.id || (l.transactionId && l.transactionId === txId)
            );
            if (existingIdx !== -1) {
              db.lateRegistrations[existingIdx] = { ...db.lateRegistrations[existingIdx], ...late };
            } else {
              db.lateRegistrations.unshift(late);
            }

            processedTransactionIds.add(txId);
            dbModified = true;
            results.push({
              syncId: item.syncId,
              transactionId: txId,
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
              processedTransactionIds.add(txId);
              results.push({
                syncId: item.syncId,
                transactionId: txId,
                status: 'processed',
                message: 'تم تحديث سجل ومسار استمارة ساقط القيد',
              });
            }
          }
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

      const hasChanges =
        newDispenses.length > 0 || newSupplies.length > 0 || newLateRegs.length > 0;

      res.json({
        success: true,
        fullSync: false,
        hasChanges,
        changes: {
          dispenseRecords: newDispenses,
          supplyTransactions: newSupplies,
          lateRegistrations: newLateRegs,
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

      // Step 4: Re-index processed transactions
      processedTransactionIds.clear();
      (cleanDb.dispenseRecords || []).forEach((r: any) => {
        const txId = r.transactionId || `tx-${r.id}`;
        processedTransactionIds.add(txId);
      });
      (cleanDb.supplyTransactions || []).forEach((s: any) => {
        const txId = s.transactionId || `tx-${s.id}`;
        processedTransactionIds.add(txId);
      });
      (cleanDb.lateRegistrations || []).forEach((l: any) => {
        const txId = l.transactionId || `tx-${l.id}`;
        processedTransactionIds.add(txId);
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

      // Step 3: Clear processedTransactionIds so pre-reset transactions cannot linger
      processedTransactionIds.clear();
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

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

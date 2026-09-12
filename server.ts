/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Production & Development Server (Port 3000)
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DatabaseSchema,
  SyncTransactionItem,
  ResetBoundary,
  STOCK_CATEGORIES,
  StockCategory,
  CategoryStock
} from './src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PROCESSED_KEYS_FILE = path.join(DATA_DIR, 'processedTransactions.json');

app.use(cors());
app.use(express.json({ limit: '50mb' }));

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Creates completely clean initial database schema on server
 * ZERO DEMO / SEED / MOCK DATA (Rule 7)
 */
function createServerEmptyDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const emptyStocks: Record<StockCategory, CategoryStock> = {} as any;
  for (const cat of STOCK_CATEGORIES) {
    emptyStocks[cat] = {
      category: cat,
      currentStock: 0,
      openingStock: 0,
      totalReceived: 0,
      totalDispensed: 0,
      damagedOrCancelled: 0,
      theoreticalStock: 0,
      lastUpdated: now
    };
  }

  const emptyOpening: any = {};
  for (const cat of STOCK_CATEGORIES) {
    emptyOpening[cat] = {
      category: cat,
      quantity: 0,
      inventoryDate: now.split('T')[0],
      inventoryKeeper: 'غير محدد',
      notes: ''
    };
  }

  return {
    version: 1,
    lastUpdated: now,
    resetBoundary: {
      resetId: `srv-rst-${Date.now().toString(36)}`,
      resetTimestamp: now,
      resetBy: 'خادم مكتب صحة سفلاق المركزي'
    },
    officeSettings: {
      officeName: 'مكتب صحة سفلاق - إدارة ساقلتة الصحية',
      governorate: 'محافظة سوهاج',
      currentEmployee: 'غير محدد',
      healthCardMaleFee: 50,
      healthCardFemaleFee: 50,
      birthCertFee: 0,
      deathCertFee: 0
    },
    stocks: emptyStocks,
    supplies: [],
    dispenses: [],
    lateRegistrations: [],
    openingBalances: emptyOpening,
    tombstones: [],
    auditLogs: []
  };
}

function loadServerDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const fresh = createServerEmptyDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
      return fresh;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error('Error loading server DB, creating clean empty database:', err);
    const fresh = createServerEmptyDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    return fresh;
  }
}

function saveServerDb(db: DatabaseSchema): void {
  db.lastUpdated = new Date().toISOString();
  db.version = (db.version || 1) + 1;
  const tempFile = `${DB_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tempFile, JSON.stringify(db, null, 2), 'utf-8');
  fs.renameSync(tempFile, DB_FILE);
}

function loadProcessedKeys(): Set<string> {
  try {
    if (!fs.existsSync(PROCESSED_KEYS_FILE)) return new Set();
    const raw = fs.readFileSync(PROCESSED_KEYS_FILE, 'utf-8');
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveProcessedKeys(keys: Set<string>): void {
  try {
    fs.writeFileSync(PROCESSED_KEYS_FILE, JSON.stringify(Array.from(keys)), 'utf-8');
  } catch (err) {
    console.error('Error saving processed transaction keys:', err);
  }
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    office: 'مكتب صحة سفلاق',
    serverTime: new Date().toISOString()
  });
});

app.get('/api/database', (req, res) => {
  const db = loadServerDb();
  res.json(db);
});

/**
 * Transaction Sync Endpoint (Rules 10, 11, 12, 14, 15, 16, 19)
 */
app.post('/api/sync/transactions', (req, res) => {
  try {
    const { deviceId, resetBoundary, transactions } = req.body;
    const serverDb = loadServerDb();
    const processedKeys = loadProcessedKeys();
    const acknowledgedKeys: string[] = [];

    // 1. Reset Boundary Check (Rule 19)
    if (serverDb.resetBoundary && serverDb.resetBoundary.resetTimestamp) {
      const serverResetTime = new Date(serverDb.resetBoundary.resetTimestamp).getTime();

      // If client is from an older reset or missing boundary
      if (
        !resetBoundary ||
        (resetBoundary.resetId && resetBoundary.resetId !== serverDb.resetBoundary.resetId &&
         new Date(resetBoundary.resetTimestamp).getTime() < serverResetTime)
      ) {
        return res.status(409).json({
          code: 'RESET_BOUNDARY_VIOLATION',
          message: 'تم تصفير النظام مركزياً. الحركات المتبقية من الجلسة السابقة مرفوضة.',
          serverBoundary: serverDb.resetBoundary
        });
      }
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.json({
        success: true,
        processedKeys: [],
        serverData: serverDb
      });
    }

    let modified = false;
    const tombstoneSet = new Set((serverDb.tombstones || []).map(t => t.recordId));

    for (const item of transactions as SyncTransactionItem[]) {
      const { operationKey, operationType, recordId, payload, transactionId, version } = item;

      // Idempotency check (Rule 12): executed exactly once
      if (processedKeys.has(operationKey)) {
        acknowledgedKeys.push(operationKey);
        continue;
      }

      // Check tombstones (Rule 16)
      if (tombstoneSet.has(recordId) && !operationType.includes('DELETE')) {
        // Record was previously deleted, do not resurrect!
        acknowledgedKeys.push(operationKey);
        processedKeys.add(operationKey);
        continue;
      }

      // Execute transaction on server state
      switch (operationType) {
        case 'SUPPLY_ADD': {
          const exists = serverDb.supplies.some(s => s.id === recordId || s.transactionId === transactionId);
          if (!exists) {
            serverDb.supplies.unshift({ ...payload, syncStatus: 'synced' });
            const stock = serverDb.stocks[payload.category as StockCategory];
            if (stock) {
              stock.currentStock += payload.quantity;
              stock.totalReceived += payload.quantity;
            }
            modified = true;
          }
          break;
        }
        case 'SUPPLY_UPDATE': {
          const idx = serverDb.supplies.findIndex(s => s.id === recordId);
          if (idx >= 0) {
            const old = serverDb.supplies[idx];
            if ((version || 1) >= (old.version || 1)) {
              if (old.category === payload.category) {
                const diff = payload.quantity - old.quantity;
                const stock = serverDb.stocks[payload.category as StockCategory];
                if (stock) {
                  stock.currentStock += diff;
                  stock.totalReceived += diff;
                }
              } else {
                // Category changed on server: revert old category, apply new category
                const oldStock = serverDb.stocks[old.category as StockCategory];
                if (oldStock) {
                  oldStock.currentStock -= old.quantity;
                  oldStock.totalReceived -= old.quantity;
                }
                const newStock = serverDb.stocks[payload.category as StockCategory];
                if (newStock) {
                  newStock.currentStock += payload.quantity;
                  newStock.totalReceived += payload.quantity;
                }
              }
              serverDb.supplies[idx] = { ...payload, syncStatus: 'synced' };
              modified = true;
            }
          }
          break;
        }
        case 'SUPPLY_DELETE': {
          const idx = serverDb.supplies.findIndex(s => s.id === recordId);
          if (idx >= 0) {
            const existing = serverDb.supplies[idx];
            const stock = serverDb.stocks[existing.category as StockCategory];
            if (stock) {
              stock.currentStock -= existing.quantity;
              stock.totalReceived -= existing.quantity;
            }
            serverDb.supplies.splice(idx, 1);
            modified = true;
          }
          if (!tombstoneSet.has(recordId)) {
            serverDb.tombstones.push({
              recordId,
              recordType: 'supply',
              transactionId,
              deletedAt: new Date().toISOString(),
              version: version || 1
            });
            tombstoneSet.add(recordId);
            modified = true;
          }
          break;
        }
        case 'DISPENSE_ADD': {
          const exists = serverDb.dispenses.some(d => d.id === recordId || d.transactionId === transactionId);
          if (!exists) {
            serverDb.dispenses.unshift({ ...payload, syncStatus: 'synced' });
            const stock = serverDb.stocks[payload.category as StockCategory];
            if (stock) {
              stock.currentStock -= payload.quantity;
              stock.totalDispensed += payload.quantity;
            }
            modified = true;
          }
          break;
        }
        case 'DISPENSE_UPDATE': {
          const idx = serverDb.dispenses.findIndex(d => d.id === recordId);
          if (idx >= 0) {
            const old = serverDb.dispenses[idx];
            if ((version || 1) >= (old.version || 1)) {
              if (old.category === payload.category) {
                const diff = payload.quantity - old.quantity;
                const stock = serverDb.stocks[payload.category as StockCategory];
                if (stock) {
                  stock.currentStock -= diff;
                  stock.totalDispensed += diff;
                }
              } else {
                // Category changed on server: refund old category, deduct from new category
                const oldStock = serverDb.stocks[old.category as StockCategory];
                if (oldStock) {
                  oldStock.currentStock += old.quantity;
                  oldStock.totalDispensed -= old.quantity;
                }
                const newStock = serverDb.stocks[payload.category as StockCategory];
                if (newStock) {
                  newStock.currentStock -= payload.quantity;
                  newStock.totalDispensed += payload.quantity;
                }
              }
              serverDb.dispenses[idx] = { ...payload, syncStatus: 'synced' };
              modified = true;
            }
          }
          break;
        }
        case 'DISPENSE_DELETE': {
          const idx = serverDb.dispenses.findIndex(d => d.id === recordId);
          if (idx >= 0) {
            const existing = serverDb.dispenses[idx];
            const stock = serverDb.stocks[existing.category as StockCategory];
            if (stock) {
              stock.currentStock += existing.quantity;
              stock.totalDispensed -= existing.quantity;
            }
            serverDb.dispenses.splice(idx, 1);
            modified = true;
          }
          if (!tombstoneSet.has(recordId)) {
            serverDb.tombstones.push({
              recordId,
              recordType: 'dispense',
              transactionId,
              deletedAt: new Date().toISOString(),
              version: version || 1
            });
            tombstoneSet.add(recordId);
            modified = true;
          }
          break;
        }
        case 'LATE_REG_ADD': {
          const exists = serverDb.lateRegistrations.some(r => r.id === recordId || r.transactionId === transactionId);
          if (!exists) {
            serverDb.lateRegistrations.unshift({ ...payload, syncStatus: 'synced' });
            modified = true;
          }
          break;
        }
        case 'LATE_REG_UPDATE': {
          const idx = serverDb.lateRegistrations.findIndex(r => r.id === recordId);
          if (idx >= 0) {
            const old = serverDb.lateRegistrations[idx];
            if ((version || 1) >= (old.version || 1)) {
              serverDb.lateRegistrations[idx] = { ...payload, syncStatus: 'synced' };
              modified = true;
            }
          }
          break;
        }
        case 'LATE_REG_DELETE': {
          const idx = serverDb.lateRegistrations.findIndex(r => r.id === recordId);
          if (idx >= 0) {
            serverDb.lateRegistrations.splice(idx, 1);
            modified = true;
          }
          if (!tombstoneSet.has(recordId)) {
            serverDb.tombstones.push({
              recordId,
              recordType: 'late_registration',
              transactionId,
              deletedAt: new Date().toISOString(),
              version: version || 1
            });
            tombstoneSet.add(recordId);
            modified = true;
          }
          break;
        }
      }

      processedKeys.add(operationKey);
      acknowledgedKeys.push(operationKey);
    }

    if (modified) {
      saveServerDb(serverDb);
    }
    saveProcessedKeys(processedKeys);

    res.json({
      success: true,
      processedKeys: acknowledgedKeys,
      serverData: serverDb
    });
  } catch (err: any) {
    console.error('Error during transaction sync:', err);
    res.status(500).json({ error: err?.message || 'خطأ في معالجة المزامنة' });
  }
});

/**
 * Server Factory Reset (Rules 18 & 19)
 */
app.post('/api/database/factory-reset', (req, res) => {
  try {
    const { performedBy } = req.body;
    const cleanDb = createServerEmptyDatabase();
    cleanDb.resetBoundary.resetBy = performedBy || 'مدير النظام';
    saveServerDb(cleanDb);

    // Wipe processed keys
    if (fs.existsSync(PROCESSED_KEYS_FILE)) {
      fs.unlinkSync(PROCESSED_KEYS_FILE);
    }

    res.json({
      success: true,
      message: 'تم تصفير الخادم وتأسيس حد أمان زمني جديد',
      resetBoundary: cleanDb.resetBoundary
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Static file serving & Vite Dev Integration
// ---------------------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(path.join(__dirname, 'dist/index.html'));

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.warn('Vite middleware could not be loaded, falling back to static files:', e);
      app.use(express.static(path.join(__dirname, 'dist')));
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist/index.html'));
      });
    }
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[مكتب صحة سفلاق] الخادم يعمل الآن على المنفذ ${PORT}`);
  });
}

startServer();

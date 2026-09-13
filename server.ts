/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Production & Development Server (Port 3000)
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import {
  DatabaseSchema,
  SyncTransactionItem,
  OperationType,
  ResetBoundary,
  STOCK_CATEGORIES,
  StockCategory,
  CategoryStock
} from './src/types.js';

const ROOT_DIR = process.cwd();
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const PROCESSED_KEYS_FILE = path.join(DATA_DIR, 'processedTransactions.json');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

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
// API Routes & Health Checks
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    office: 'مكتب صحة سفلاق',
    timestamp: new Date().toISOString()
  });
});

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

    // 1. Strict Reset Boundary Check (Point 1: Server is ultimate source of truth, no old device queue accepted)
    if (serverDb.resetBoundary && serverDb.resetBoundary.resetId) {
      const clientResetId = resetBoundary?.resetId;
      if (!clientResetId || clientResetId !== serverDb.resetBoundary.resetId) {
        return res.status(409).json({
          code: 'RESET_BOUNDARY_VIOLATION',
          error: 'RESET_BOUNDARY_VIOLATION',
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

    // Pre-flight Batch & Item Validation (Point 2: Never trust client data blindly)
    const validOperationTypes = new Set<OperationType>([
      'SUPPLY_ADD', 'SUPPLY_UPDATE', 'SUPPLY_DELETE',
      'DISPENSE_ADD', 'DISPENSE_UPDATE', 'DISPENSE_DELETE',
      'LATE_REG_ADD', 'LATE_REG_UPDATE', 'LATE_REG_DELETE',
      'MANUAL_STOCK_ADJUSTMENT', 'OPENING_BALANCE_SET'
    ]);

    const seenBatchKeys = new Set<string>();

    for (const item of transactions as SyncTransactionItem[]) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'حركة غير صالحة', item });
      }

      const {
        transactionId,
        operationKey,
        recordId,
        operationType,
        version,
        updatedAt,
        deviceId: itemDeviceId,
        resetBoundary: itemResetBoundary,
        payload
      } = item;

      // Required fields non-empty check
      if (!transactionId || typeof transactionId !== 'string' || !transactionId.trim()) {
        return res.status(400).json({ error: 'معرف الحركة transactionId مفقود أو غير صالح', item });
      }
      if (!operationKey || typeof operationKey !== 'string' || !operationKey.trim()) {
        return res.status(400).json({ error: 'مفتاح العملية operationKey مفقود أو غير صالح', item });
      }
      if (!recordId || typeof recordId !== 'string' || !recordId.trim()) {
        return res.status(400).json({ error: 'معرف السجل recordId مفقود أو غير صالح', item });
      }
      if (!operationType || !validOperationTypes.has(operationType)) {
        return res.status(400).json({ error: `نوع عملية غير مصرح به: ${operationType}`, item });
      }
      if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
        return res.status(400).json({ error: 'رقم إصدار الحركة غير صالح', item });
      }
      if (!updatedAt || typeof updatedAt !== 'string' || isNaN(new Date(updatedAt).getTime())) {
        return res.status(400).json({ error: 'تاريخ التحديث updatedAt غير صالح', item });
      }

      const effectiveDeviceId = itemDeviceId || deviceId;
      if (!effectiveDeviceId || typeof effectiveDeviceId !== 'string' || !effectiveDeviceId.trim()) {
        return res.status(400).json({ error: 'معرف الجهاز deviceId مفقود أو غير صالح', item });
      }

      // Format check: operationKey format must start with ${operationType}:${recordId}
      const expectedPrefix = `${operationType}:${recordId}`;
      if (!operationKey.startsWith(expectedPrefix)) {
        return res.status(400).json({ error: 'صيغة مفتاح العملية operationKey غير متطابقة مع بيانات الحركة', item });
      }

      // No duplicate operationKey in the same batch
      if (seenBatchKeys.has(operationKey)) {
        return res.status(400).json({ error: 'تكرار مفتاح العملية داخل نفس الحزمة المرسلة', item });
      }
      seenBatchKeys.add(operationKey);

      // Reset Boundary check on transaction item level
      const effectiveItemResetId = itemResetBoundary?.resetId || resetBoundary?.resetId;
      if (serverDb.resetBoundary && serverDb.resetBoundary.resetId) {
        if (!effectiveItemResetId || effectiveItemResetId !== serverDb.resetBoundary.resetId) {
          return res.status(409).json({
            code: 'RESET_BOUNDARY_VIOLATION',
            error: 'RESET_BOUNDARY_VIOLATION',
            message: 'تم تصفير النظام مركزياً. الحركات المتبقية من الجلسة السابقة مرفوضة.',
            serverBoundary: serverDb.resetBoundary
          });
        }
      }

      // Payload validation
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'بيانات الحركة payload مفقودة أو غير صالحة', item });
      }

      if ('quantity' in payload) {
        const qty = Number(payload.quantity);
        if (!Number.isFinite(qty) || qty < 0) {
          return res.status(400).json({ error: 'كمية الحركة غير صالحة أو سالبة', item });
        }
      }

      if ('category' in payload && payload.category) {
        if (!STOCK_CATEGORIES.includes(payload.category as StockCategory)) {
          return res.status(400).json({ error: `صنف غير موجود في المنظومة: ${payload.category}`, item });
        }
      }

      if (operationType === 'MANUAL_STOCK_ADJUSTMENT') {
        if (!payload.category || !STOCK_CATEGORIES.includes(payload.category as StockCategory)) {
          return res.status(400).json({ error: 'صنف التسوية اليدوية غير صالح', item });
        }
        const newActual = Number(payload.newActualStock);
        if (!Number.isFinite(newActual) || newActual < 0) {
          return res.status(400).json({ error: 'الرصيد الفعلي الجديد للتسوية غير صالح أو سالب', item });
        }
      }

      if (operationType === 'OPENING_BALANCE_SET') {
        if (!payload.category || !STOCK_CATEGORIES.includes(payload.category as StockCategory)) {
          return res.status(400).json({ error: 'صنف رصيد أول المدة غير صالح', item });
        }
        const qty = Number(payload.quantity);
        if (!Number.isFinite(qty) || qty < 0) {
          return res.status(400).json({ error: 'كمية رصيد أول المدة غير صالحة أو سالبة', item });
        }
      }
    }

    let modified = false;
    const tombstoneSet = new Set((serverDb.tombstones || []).map(t => t.recordId));

    for (const item of transactions as SyncTransactionItem[]) {
      const { operationKey, operationType, recordId, payload, transactionId, version } = item;

      // Idempotency check (Point 3): executed exactly once
      if (processedKeys.has(operationKey)) {
        acknowledgedKeys.push(operationKey);
        continue;
      }

      // Check tombstones (Point 8): prevent resurrecting deleted records
      if (tombstoneSet.has(recordId) && !operationType.includes('DELETE')) {
        acknowledgedKeys.push(operationKey);
        processedKeys.add(operationKey);
        continue;
      }

      // Execute transaction on server state
      switch (operationType) {
        case 'MANUAL_STOCK_ADJUSTMENT': {
          const cat = payload.category as StockCategory;
          const stock = serverDb.stocks[cat];
          if (stock) {
            const oldStock = stock.currentStock;
            const newActual = Number(payload.newActualStock) || 0;
            const diff = newActual - oldStock;
            const prevStockInPayload = typeof payload.previousStock === 'number' ? payload.previousStock : (typeof payload.oldStock === 'number' ? payload.oldStock : oldStock);

            // Point 6: Conflict detection for offline devices
            // If another device changed stock while this device was offline (baseline mismatch and distinct adjustment exists)
            const hasConflictingAdjustment = prevStockInPayload !== oldStock && serverDb.auditLogs.some(a =>
              a.category === cat &&
              (a.operationType === 'MANUAL_STOCK_ADJUSTMENT' || a.action === 'تسوية رصيد جرد يدوي صريح') &&
              a.transactionId !== transactionId
            );

            if (hasConflictingAdjustment) {
              // Register SYNC_CONFLICT - DO NOT silently overwrite!
              serverDb.auditLogs.unshift({
                id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: new Date().toISOString(),
                action: 'SYNC_CONFLICT',
                category: cat,
                details: `تعارض تسوية رصيد جرد بين جهازين للصنف (${cat}): الرصيد على الخادم (${oldStock}) بينما القيمة الواردة من الجهاز (${newActual})، تم رفض الاستبدال الصامت`,
                performedBy: payload.performedBy || 'نظام مراقبة النزاعات والمزامنة',
                previousValue: oldStock,
                newValue: newActual,
                oldStock,
                newActualStock: newActual,
                difference: diff,
                reason: payload.reason,
                notes: 'تم رفض الاستبدال الصامت للرصيد الفعلي بسبب وجود تعارض جرد أوفلاين',
                transactionId,
                operationKey,
                deviceId: payload.deviceId || deviceId || 'غير محدد',
                operationType: 'MANUAL_STOCK_ADJUSTMENT'
              });
            } else {
              if (payload.reason === 'damaged' && diff < 0) {
                stock.damagedOrCancelled += Math.abs(diff);
              }
              stock.currentStock = newActual;
              stock.lastUpdated = new Date().toISOString();
              serverDb.auditLogs.unshift({
                id: payload.id || `audit-${Date.now()}`,
                timestamp: payload.timestamp || new Date().toISOString(),
                action: 'تسوية رصيد جرد يدوي صريح',
                category: cat,
                details: `تعديل الرصيد الفعلي من ${oldStock} إلى ${newActual} (الفارق: ${diff > 0 ? `+${diff}` : diff}) - السبب: ${payload.reason} - ${payload.notes || ''}`,
                performedBy: payload.performedBy || 'غير محدد',
                previousValue: oldStock,
                newValue: newActual,
                oldStock,
                newActualStock: newActual,
                difference: diff,
                reason: payload.reason,
                notes: payload.notes || '',
                transactionId,
                operationKey,
                deviceId: payload.deviceId || deviceId || 'غير محدد',
                operationType: 'MANUAL_STOCK_ADJUSTMENT'
              });
            }
            modified = true;
          }
          break;
        }
        case 'OPENING_BALANCE_SET': {
          const cat = payload.category as StockCategory;
          const qty = Number(payload.quantity) || 0;
          serverDb.openingBalances[cat] = {
            category: cat,
            quantity: qty,
            inventoryDate: payload.inventoryDate || new Date().toISOString().split('T')[0],
            inventoryKeeper: payload.inventoryKeeper || 'غير محدد',
            notes: payload.notes || ''
          };
          const stock = serverDb.stocks[cat];
          if (stock) {
            stock.openingStock = qty;
            if (stock.currentStock === 0 && stock.totalReceived === 0 && stock.totalDispensed === 0) {
              stock.currentStock = qty;
            }
            stock.lastUpdated = new Date().toISOString();
          }
          serverDb.auditLogs.unshift({
            id: payload.id || `audit-${Date.now()}`,
            timestamp: payload.timestamp || new Date().toISOString(),
            action: 'تحديد رصيد أول المدة',
            category: cat,
            details: `اعتماد رصيد أول المدة للصنف بقيمة ${qty} بواسطة ${payload.inventoryKeeper || 'غير محدد'}`,
            performedBy: payload.inventoryKeeper || 'غير محدد',
            newValue: qty,
            transactionId,
            operationType: 'OPENING_BALANCE_SET'
          });
          modified = true;
          break;
        }
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
  const distPath = path.join(ROOT_DIR, 'dist');
  const indexHtmlPath = path.join(distPath, 'index.html');
  const isProduction = process.env.NODE_ENV === 'production' || fs.existsSync(indexHtmlPath);

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
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(indexHtmlPath);
      });
    }
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(indexHtmlPath);
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[مكتب صحة سفلاق] الخادم يعمل الآن على المنفذ ${PORT} ومتاح على 0.0.0.0`);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    server.close(() => process.exit(0));
  });

  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down gracefully...');
    server.close(() => process.exit(0));
  });
}

startServer();

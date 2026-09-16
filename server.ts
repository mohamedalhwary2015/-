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
      resetId: `srv-rst-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`,
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

let cachedDatabase: DatabaseSchema | null = null;

function loadDatabaseFromDisk(): DatabaseSchema {
  return loadServerDb();
}

function loadServerDb(): DatabaseSchema {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const fresh = createServerEmptyDatabase();
      fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
      cachedDatabase = fresh;
      return fresh;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    cachedDatabase = parsed;
    return parsed;
  } catch (err) {
    console.error('Error loading server DB, creating clean empty database:', err);
    const fresh = createServerEmptyDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2), 'utf-8');
    cachedDatabase = fresh;
    return fresh;
  }
}

function saveServerDb(db: DatabaseSchema): void {
  cachedDatabase = db;
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

app.get('/api/integrity-check', (req, res) => {
  const db = loadServerDb();
  const categoryChecks = STOCK_CATEGORIES.map(cat => {
    const s = db.stocks[cat] || {
      currentStock: 0,
      openingStock: 0,
      totalReceived: 0,
      totalDispensed: 0,
      damagedOrCancelled: 0
    };
    const calculated = (s.openingStock || 0) + (s.totalReceived || 0) - (s.totalDispensed || 0) - (s.damagedOrCancelled || 0);
    const diff = s.currentStock - calculated;
    return {
      category: cat,
      currentStock: s.currentStock,
      openingStock: s.openingStock,
      totalReceived: s.totalReceived,
      totalDispensed: s.totalDispensed,
      damagedOrCancelled: s.damagedOrCancelled,
      calculatedStock: calculated,
      difference: diff,
      isBalanced: diff === 0
    };
  });

  const hasMismatch = categoryChecks.some(c => !c.isBalanced);

  res.json({
    status: 'ok',
    office: 'مكتب صحة سفلاق',
    timestamp: new Date().toISOString(),
    resetId: db.resetBoundary?.resetId || 'NONE',
    isBalanced: !hasMismatch,
    categoryChecks,
    tombstonesCount: (db.tombstones || []).length,
    suppliesCount: (db.supplies || []).filter(s => !s.isDeleted).length,
    dispensesCount: (db.dispenses || []).filter(d => !d.isDeleted).length,
    auditLogsCount: (db.auditLogs || []).length,
    demoCandidatesCount: 0,
    guarantee: 'currentStock is strictly protected and authoritative; no automatic stock recalculation or overwrite'
  });
});

app.get('/api/database', (req, res) => {
  const db = loadServerDb();
  res.json(db);
});

function requireMatchingResetId(
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
export { requireMatchingResetId };

/**
 * Transaction Sync Endpoint (Rules 10, 11, 12, 14, 15, 16, 19)
 */
app.post('/api/sync/transactions', (req, res) => {
  try {
    const { deviceId, resetBoundary, transactions } = req.body || {};
    const currentServerDb = cachedDatabase || loadServerDb();
    const serverDb = currentServerDb;
    const serverResetId = currentServerDb.resetBoundary?.resetId;
    const processedKeys = loadProcessedKeys();
    const acknowledgedKeys: string[] = [];

    try {
      requireMatchingResetId(
        req.body?.resetId ??
        req.body?.resetBoundary?.resetId ??
        req.body?.database?.resetBoundary?.resetId,
        currentServerDb?.resetBoundary?.resetId
      );
    } catch (err: any) {
      return res.status(409).json({
        success: false,
        error: "STALE_RESET_ID",
        message: "Client resetId does not match current server resetId."
      });
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.json({
        ok: true,
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

      if (
        typeof item.operationKey !== 'string' ||
        !item.operationKey.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_OPERATION_KEY',
          message: 'operationKey is required and must be non-empty.'
        });
      }

      const opKey = item.operationKey.trim();

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
      if (!opKey.startsWith(expectedPrefix)) {
        return res.status(400).json({ error: 'صيغة مفتاح العملية operationKey غير متطابقة مع بيانات الحركة', item });
      }

      // No duplicate operationKey in the same batch
      if (seenBatchKeys.has(opKey)) {
        return res.status(400).json({ error: 'تكرار مفتاح العملية داخل نفس الحزمة المرسلة', item });
      }
      seenBatchKeys.add(opKey);

      // Reset Boundary check on transaction item level
      const effectiveItemResetId =
        itemResetBoundary?.resetId ??
        req.body?.resetId ??
        resetBoundary?.resetId;
      try {
        requireMatchingResetId(effectiveItemResetId, serverResetId);
      } catch (err: any) {
        return res.status(409).json({
          ok: false,
          code: "STALE_RESET_ID",
          error: "STALE_RESET_ID",
          message: "Client resetId does not match server resetId. Full refresh required.",
          serverResetId,
          serverBoundary: serverDb.resetBoundary
        });
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
    const tombstoneSet = new Set((serverDb.tombstones || []).map((t: any) => t.recordId));

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
          const cat = (payload.itemId || payload.category) as StockCategory;
          const stock = serverDb.stocks[cat];
          if (stock) {
            const oldStock = stock.currentStock;
            const newActual = Number(payload.newStock ?? payload.newActualStock) || 0;
            const diff = newActual - oldStock;
            const prevStockInPayload = typeof payload.oldStock === 'number'
              ? payload.oldStock
              : (typeof payload.previousStock === 'number' ? payload.previousStock : oldStock);
            const creator = payload.createdBy || payload.performedBy || 'غير محدد';
            const opId = payload.operationId || recordId;

            // Point 6: Conflict detection for offline devices
            // If another device changed stock while this device was offline (baseline mismatch and distinct adjustment exists)
            const hasConflictingAdjustment = prevStockInPayload !== oldStock && serverDb.auditLogs.some((a: any) =>
              (a.category === cat || a.itemId === cat) &&
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
                itemId: cat,
                details: `تعارض تسوية رصيد جرد بين جهازين للصنف (${cat}): الرصيد على الخادم (${oldStock}) بينما القيمة الواردة من الجهاز (${newActual})، تم رفض الاستبدال الصامت`,
                performedBy: creator,
                createdBy: creator,
                previousValue: oldStock,
                newValue: newActual,
                oldStock,
                newStock: newActual,
                newActualStock: newActual,
                difference: diff,
                reason: payload.reason,
                notes: 'تم رفض الاستبدال الصامت للرصيد الفعلي بسبب وجود تعارض جرد أوفلاين',
                transactionId,
                operationId: opId,
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
                itemId: cat,
                details: `تعديل الرصيد الفعلي من ${oldStock} إلى ${newActual} (الفارق: ${diff > 0 ? `+${diff}` : diff}) - السبب: ${payload.reason} - ${payload.notes || ''}`,
                performedBy: creator,
                createdBy: creator,
                previousValue: oldStock,
                newValue: newActual,
                oldStock,
                newStock: newActual,
                newActualStock: newActual,
                difference: diff,
                reason: payload.reason,
                notes: payload.notes || '',
                transactionId,
                operationId: opId,
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
          const cat = (payload.itemId || payload.category) as StockCategory;
          const qty = Number(payload.quantity) || 0;
          const creator = payload.createdBy || payload.inventoryKeeper || 'غير محدد';
          const opId = payload.operationId || recordId;
          const stock = serverDb.stocks[cat];
          const hasExistingMovements = Boolean(
            stock && (
              stock.totalReceived > 0 ||
              stock.totalDispensed > 0 ||
              serverDb.supplies.some((s: any) => !s.isDeleted && s.category === cat) ||
              serverDb.dispenses.some((d: any) => !d.isDeleted && d.category === cat)
            )
          );
          const existingOb = serverDb.openingBalances?.[cat];
          const hasConflictingOb = Boolean(existingOb && existingOb.quantity !== qty && existingOb.quantity > 0);

          if (hasConflictingOb) {
            // Register conflict instead of silent overwrite (Rule 8)
            serverDb.auditLogs.unshift({
              id: `conflict-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: new Date().toISOString(),
              action: 'SYNC_CONFLICT',
              category: cat,
              itemId: cat,
              details: `تعارض في تسجيل رصيد أول المدة للصنف (${cat}): القيمة الحالية المعتمدة (${existingOb?.quantity}) مقابل القيمة الواردة (${qty}). تم رفض الاستبدال الصامت.`,
              performedBy: creator,
              createdBy: creator,
              previousValue: existingOb?.quantity,
              newValue: qty,
              reason: 'تعارض رصيد أول مدة بين الأجهزة',
              transactionId,
              operationId: opId,
              operationKey,
              deviceId: payload.deviceId || deviceId || 'غير محدد',
              operationType: 'OPENING_BALANCE_SET'
            });
          } else {
            serverDb.openingBalances = serverDb.openingBalances || ({} as any);
            serverDb.openingBalances[cat] = {
              category: cat,
              quantity: qty,
              inventoryDate: payload.inventoryDate || new Date().toISOString().split('T')[0],
              inventoryKeeper: creator,
              notes: payload.notes || ''
            };
            if (stock) {
              stock.openingStock = qty;
              // Rule 2: If there are genuine existing movements, DO NOT allow replacing currentStock!
              if (!hasExistingMovements && stock.currentStock === 0 && stock.totalReceived === 0 && stock.totalDispensed === 0) {
                stock.currentStock = qty;
              }
              stock.lastUpdated = new Date().toISOString();
            }
            serverDb.auditLogs.unshift({
              id: payload.id || `audit-${Date.now()}`,
              timestamp: payload.timestamp || new Date().toISOString(),
              action: 'تحديد رصيد أول المدة',
              category: cat,
              itemId: cat,
              details: `اعتماد رصيد أول المدة للصنف بقيمة ${qty} بواسطة ${creator}`,
              performedBy: creator,
              createdBy: creator,
              newValue: qty,
              transactionId,
              operationId: opId,
              operationKey,
              deviceId: payload.deviceId || deviceId || 'غير محدد',
              operationType: 'OPENING_BALANCE_SET'
            });
          }
          modified = true;
          break;
        }
        case 'SUPPLY_ADD': {
          const exists = serverDb.supplies.some((s: any) => s.id === recordId || s.transactionId === transactionId);
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
          const idx = serverDb.supplies.findIndex((s: any) => s.id === recordId);
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
          const idx = serverDb.supplies.findIndex((s: any) => s.id === recordId);
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
          const exists = serverDb.dispenses.some((d: any) => d.id === recordId || d.transactionId === transactionId);
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
          const idx = serverDb.dispenses.findIndex((d: any) => d.id === recordId);
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
          const idx = serverDb.dispenses.findIndex((d: any) => d.id === recordId);
          if (idx >= 0) {
            const existing = serverDb.dispenses[idx];
            const stock = serverDb.stocks[existing.category as StockCategory];
            if (stock) {
              stock.currentStock -= existing.quantity;
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
          const exists = serverDb.lateRegistrations.some((r: any) => r.id === recordId || r.transactionId === transactionId);
          if (!exists) {
            serverDb.lateRegistrations.unshift({ ...payload, syncStatus: 'synced' });
            modified = true;
          }
          break;
        }
        case 'LATE_REG_UPDATE': {
          const idx = serverDb.lateRegistrations.findIndex((r: any) => r.id === recordId);
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
          const idx = serverDb.lateRegistrations.findIndex((r: any) => r.id === recordId);
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
 * Non-destructive merge strictly protecting currentStock and validating resetId
 */
function mergeDatabasesNonDestructive(
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

  // 1. currentStock Protection: Server stocks are authoritative, NEVER overwritten by client or formulas
  merged.stocks = JSON.parse(JSON.stringify(serverDb.stocks));

  // 2. Tombstones union
  const tombstoneMap = new Map<string, any>();
  (serverDb.tombstones || []).forEach(t => tombstoneMap.set(t.recordId, t));
  (clientDb.tombstones || []).forEach(t => {
    if (!tombstoneMap.has(t.recordId)) {
      tombstoneMap.set(t.recordId, t);
    }
  });
  merged.tombstones = Array.from(tombstoneMap.values());
  const tombstoneSet = new Set(merged.tombstones.map(t => t.recordId));

  // 3. Supplies union (does not alter currentStock)
  const serverSupplyMap = new Map((serverDb.supplies || []).map(s => [s.id, s]));
  for (const cs of clientDb.supplies || []) {
    if (tombstoneSet.has(cs.id) || cs.isDeleted) continue;
    if (!serverSupplyMap.has(cs.id)) {
      merged.supplies.push({ ...cs, syncStatus: 'synced' });
      serverSupplyMap.set(cs.id, cs);
    }
  }

  // 4. Dispenses union (does not alter currentStock)
  const serverDispenseMap = new Map((serverDb.dispenses || []).map(d => [d.id, d]));
  for (const cd of clientDb.dispenses || []) {
    if (tombstoneSet.has(cd.id) || cd.isDeleted) continue;
    if (!serverDispenseMap.has(cd.id)) {
      merged.dispenses.push({ ...cd, syncStatus: 'synced' });
      serverDispenseMap.set(cd.id, cd);
    }
  }

  // 5. Late registrations union
  const serverLateMap = new Map((serverDb.lateRegistrations || []).map(r => [r.id, r]));
  for (const cr of clientDb.lateRegistrations || []) {
    if (tombstoneSet.has(cr.id) || cr.isDeleted) continue;
    if (!serverLateMap.has(cr.id)) {
      merged.lateRegistrations.push({ ...cr, syncStatus: 'synced' });
      serverLateMap.set(cr.id, cr);
    }
  }

  // 6. Audit logs union
  const auditIdSet = new Set((serverDb.auditLogs || []).map(a => a.id));
  for (const ca of clientDb.auditLogs || []) {
    if (!auditIdSet.has(ca.id)) {
      merged.auditLogs.push(ca);
      auditIdSet.add(ca.id);
    }
  }

  return merged;
}

/**
 * Full Sync Endpoint (Rules 1, 2 & 4: Strict resetId validation, non-destructive merge)
 */
app.post('/api/sync', (req, res) => {
  try {
    const currentServerDb =
      cachedDatabase || loadServerDb();

    const clientResetId =
      req.body?.resetId ??
      req.body?.resetBoundary?.resetId ??
      req.body?.database?.resetBoundary?.resetId ??
      req.body?.clientDb?.resetBoundary?.resetId;

    requireMatchingResetId(
      clientResetId,
      currentServerDb?.resetBoundary?.resetId
    );

    /*
     * Full database upload is NOT allowed.
     *
     * Database mutations must go through:
     * /api/sync/transactions
     *
     * This endpoint is now a safe synchronization/read endpoint.
     */

    return res.json({
      ok: true,
      success: true,
      serverResetId:
        currentServerDb.resetBoundary?.resetId,
      serverData: currentServerDb,
      message:
        'تم جلب الحالة المركزية الحالية بأمان. تعديل قاعدة البيانات الكاملة غير مسموح عبر هذا المسار.'
    });

  } catch (err: any) {
    if (
      err?.code === 'STALE_RESET_ID' ||
      err?.message === 'STALE_RESET_ID'
    ) {
      const serverDb =
        cachedDatabase || loadServerDb();

      return res.status(409).json({
        ok: false,
        success: false,
        code: 'STALE_RESET_ID',
        error: 'STALE_RESET_ID',
        message:
          'الجهاز ينتمي إلى دورة تصفير قديمة. يجب جلب الحالة الحالية من الخادم.',
        serverResetId:
          serverDb.resetBoundary?.resetId,
        serverBoundary:
          serverDb.resetBoundary
      });
    }

    return res.status(500).json({
      ok: false,
      success: false,
      error:
        err?.message ||
        'خطأ في المزامنة'
    });
  }
});

/**
 * Sync Changes Endpoint (Rules 1 & 2: Strict resetId validation)
 */
app.post('/api/sync/changes', (req, res) => {
  try {
    const { resetBoundary, resetId, changes, deviceId } = req.body || {};
    const currentServerDb = cachedDatabase || loadServerDb();
    const serverResetId = currentServerDb.resetBoundary?.resetId;

    try {
      requireMatchingResetId(
        req.body?.resetId ||
        req.body?.database?.resetBoundary?.resetId,
        currentServerDb?.resetBoundary?.resetId
      );
    } catch (err: any) {
      return res.status(409).json({
        success: false,
        error: "STALE_RESET_ID",
        message: "Client belongs to an old reset cycle."
      });
    }

    res.json({
      ok: true,
      success: true,
      serverResetId,
      serverData: currentServerDb
    });
  } catch (err: any) {
    if (err?.message?.includes('STALE_RESET_ID') || err?.code === 'STALE_RESET_ID') {
      const serverDb = cachedDatabase || loadServerDb();
      return res.status(409).json({
        success: false,
        ok: false,
        code: "STALE_RESET_ID",
        error: "STALE_RESET_ID",
        message: "Client belongs to an old reset cycle.",
        serverResetId: serverDb.resetBoundary?.resetId,
        serverBoundary: serverDb.resetBoundary
      });
    }
    res.status(500).json({ error: err?.message || 'خطأ في معالجة التغييرات' });
  }
});

/**
 * Server Factory Reset (Rules 18 & 19 - Full Wipe & Reset Boundary with Backup Snapshot)
 */
app.post('/api/database/factory-reset', (req, res) => {
  try {
    const { performedBy } = req.body;
    const oldServerDb = cachedDatabase || loadServerDb();
    const oldResetId = oldServerDb?.resetBoundary?.resetId;

    // Point 11 & 14: Save snapshot backup before factory reset
    if (fs.existsSync(DB_FILE)) {
      try {
        const backupFile = path.join(DATA_DIR, `snapshot-backup-pre-reset-${Date.now()}.json`);
        fs.copyFileSync(DB_FILE, backupFile);
      } catch (backupErr) {
        console.warn('Could not create backup snapshot before reset:', backupErr);
      }
    }

    const cleanDb = createServerEmptyDatabase();
    let newResetId = `srv-rst-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    while (newResetId === oldResetId) {
      newResetId = `srv-rst-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
    }
    cleanDb.resetBoundary.resetId = newResetId;
    cleanDb.resetBoundary.resetBy = performedBy || 'مدير النظام';
    saveServerDb(cleanDb);

    // Wipe processed keys
    if (fs.existsSync(PROCESSED_KEYS_FILE)) {
      fs.unlinkSync(PROCESSED_KEYS_FILE);
    }

    res.json({
      success: true,
      message: 'تم تصفير الخادم وتأسيس حد أمان زمني جديد مع حفظ نسخة احتياطية',
      resetBoundary: cleanDb.resetBoundary
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Controlled Production Repair Apply Endpoint
 * STRICT MANDATES:
 * - Automatic repair disabled for safety to protect live stock and confirmed movements.
 * - Diagnostic only.
 */
app.post('/api/repair/apply', (req, res) => {
  try {
    const currentDb =
      cachedDatabase || loadServerDb();

    const clientResetId =
      req.body?.resetId ??
      req.body?.database?.resetBoundary?.resetId ??
      req.body?.cleanDb?.resetBoundary?.resetId;

    requireMatchingResetId(
      clientResetId,
      currentDb?.resetBoundary?.resetId
    );

    return res.status(409).json({
      ok: false,
      success: false,
      code: 'REPAIR_DISABLED_FOR_SAFETY',
      error: 'REPAIR_DISABLED_FOR_SAFETY',
      message:
        'الإصلاح التلقائي لقاعدة البيانات معطل لحماية الأرصدة والحركات الحقيقية. استخدم التشخيص فقط ثم نفذ تسوية يدوية صريحة إذا لزم الأمر.'
    });

  } catch (err: any) {
    if (
      err?.code === 'STALE_RESET_ID' ||
      err?.message === 'STALE_RESET_ID'
    ) {
      const currentDb =
        cachedDatabase || loadServerDb();

      return res.status(409).json({
        ok: false,
        success: false,
        code: 'STALE_RESET_ID',
        error: 'STALE_RESET_ID',
        message:
          'رفض الإصلاح لأن الجهاز يحمل Reset ID قديمًا.',
        serverResetId:
          currentDb.resetBoundary?.resetId
      });
    }

    return res.status(500).json({
      ok: false,
      success: false,
      error:
        err?.message ||
        'خطأ في طلب الإصلاح'
    });
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

const isDirectRun = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.cjs')) &&
  !process.argv.some(arg => arg.includes('test'))
);

if (isDirectRun) {
  startServer();
}

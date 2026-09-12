/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Types & Schema Definitions
 */

export type StockCategory =
  | 'birth_certificates'      // شهادات ميلاد
  | 'birth_notifications'     // بلاغات ميلاد
  | 'death_certificates'      // شهادات وفاة
  | 'death_notifications'     // بلاغات وفاة
  | 'health_cards_male'       // بطاقات صحية (ذكور)
  | 'health_cards_female';    // بطاقات صحية (إناث)

export const STOCK_CATEGORIES: StockCategory[] = [
  'birth_certificates',
  'birth_notifications',
  'death_certificates',
  'death_notifications',
  'health_cards_male',
  'health_cards_female'
];

export const CATEGORY_LABELS: Record<StockCategory, string> = {
  birth_certificates: 'شهادات ميلاد مميكنة',
  birth_notifications: 'بلاغات ميلاد (دفاتر ورقية)',
  death_certificates: 'شهادات وفاة',
  death_notifications: 'بلاغات وفاة (دفاتر ورقية)',
  health_cards_male: 'بطاقات صحية (ذكور)',
  health_cards_female: 'بطاقات صحية (إناث)'
};

export const CATEGORY_SHORT_LABELS: Record<StockCategory, string> = {
  birth_certificates: 'شهادات ميلاد',
  birth_notifications: 'بلاغات ميلاد',
  death_certificates: 'شهادات وفاة',
  death_notifications: 'بلاغات وفاة',
  health_cards_male: 'بطاقات ذكور',
  health_cards_female: 'بطاقات إناث'
};

export type TransactionType =
  | 'birth'                 // قيد ميلاد
  | 'death'                 // قيد وفاة
  | 'health_card_male'      // صرف بطاقة صحية ذكور
  | 'health_card_female'    // صرف بطاقة صحية إناث
  | 'birth_notification'    // بلاغ ميلاد
  | 'death_notification'    // بلاغ وفاة
  | 'replacement'           // بدل فاقد/تالف
  | 'other';                // أخرى

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  birth: 'قيد ميلاد (شهادة)',
  death: 'قيد وفاة (شهادة)',
  health_card_male: 'بطاقة صحية (ذكور)',
  health_card_female: 'بطاقة صحية (إناث)',
  birth_notification: 'بلاغ ميلاد ورقي',
  death_notification: 'بلاغ وفاة ورقي',
  replacement: 'استخراج بدل فاقد',
  other: 'معاملة أخرى'
};

export type AdjustmentReason =
  | 'inventory_count'       // جرد فعلي للخزينة
  | 'book_reconciliation'   // تسوية ومطابقة دفترية
  | 'damaged'               // تالف ومستهلك رسمياً
  | 'lost'                  // مفقود أو استبعاد رسمي
  | 'administrative_entry'; // تصحيح إداري معتمد

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  inventory_count: 'جرد فعلي بالخزينة',
  book_reconciliation: 'تسوية ومطابقة دفترية',
  damaged: 'تالف ومثبت بمحضر إتلاف',
  lost: 'مفقود أو استبعاد بمحضر',
  administrative_entry: 'تصحيح إداري معتمد'
};

export interface CategoryStock {
  category: StockCategory;
  currentStock: number;       // الرصيد الفعلي المحمي تشغيلياً (ممنوع تغييره تلقائياً)
  openingStock: number;       // رصيد البداية المعتمد
  totalReceived: number;      // إجمالي التوريدات الفعلية المؤكدة
  totalDispensed: number;     // إجمالي المنصرف الفعلي المؤكد
  damagedOrCancelled: number; // إجمالي التالف أو الملغى بمحاضر
  theoreticalStock: number;   // الرصيد النظري للتحقق فقط = opening + received - dispensed - damaged
  lastUpdated: string;
}

export interface SupplyTransaction {
  id: string;                 // معرف السجل
  transactionId: string;      // المعرف الثابت للعملية (Idempotency Key)
  documentNumber: string;     // رقم إذن الصرف / التوريد
  date: string;               // تاريخ التوريد
  category: StockCategory;    // الصنف
  quantity: number;           // الكمية
  receivedBy: string;         // الموظف المستلم (الافتراضي: غير محدد)
  supplierSource: string;     // جهة التوريد (مخزن الإدارة الصحية بساقلتة، إلخ)
  notes?: string;             // ملاحظات
  version: number;            // رقم الإصدار للمزامنة الموثوقة
  updatedAt: string;          // وقت التعديل
  isDeleted?: boolean;        // علامة الحذف
  deletedAt?: string;         // تاريخ الحذف
  syncStatus?: 'pending' | 'synced' | 'unconfirmed';
}

export interface DispenseRecord {
  id: string;                 // معرف السجل
  transactionId: string;      // المعرف الثابت للعملية
  date: string;               // تاريخ المعاملة
  citizenName: string;        // اسم المواطن / ولي الأمر / المبلغ
  nationalId?: string;        // الرقم القومي
  childOrDeceasedName?: string; // اسم المولود أو المتوفى
  transactionType: TransactionType; // نوع المعاملة
  gender?: 'ذكر' | 'أنثى' | 'غير محدد'; // النوع
  category: StockCategory;    // الصنف المصروف
  quantity: number;           // الكمية (عادة 1)
  dispensedBy: string;        // الموظف القائم بالصرف (الافتراضي: غير محدد)
  collectedAmount: number;    // المبلغ المحصل / المورد (بالجنيه)
  receiptNumber?: string;     // رقم الإيصال (33 ع.ح أو قسيمة السداد)
  serialNumber?: string;      // الرقم المسلسل للمستند أو الدفتر
  notes?: string;             // ملاحظات
  version: number;            // رقم الإصدار
  updatedAt: string;          // وقت التعديل
  isDeleted?: boolean;        // علامة الحذف
  deletedAt?: string;         // تاريخ الحذف
  syncStatus?: 'pending' | 'synced' | 'unconfirmed';
}

export interface LateRegistrationRecord {
  id: string;
  transactionId: string;
  formNumber: string;         // رقم الاستمارة أو الطلب
  date: string;               // تاريخ تقديم الطلب
  personName: string;         // اسم صاحب الواقعة المراد قيدها
  personNationalId?: string;  // الرقم القومي إن وجد
  fatherName: string;         // اسم الوالد
  motherName: string;         // اسم الوالدة
  eventDate: string;          // تاريخ الواقعة (الميلاد أو الوفاة الفعلي أو التقريبي)
  eventType: 'ميلاد' | 'وفاة'; // نوع الواقعة
  gender: 'ذكر' | 'أنثى';     // النوع
  applicantName: string;      // اسم مقدم الطلب
  applicantRelation: string;  // صلة القرابة
  status: 'قيد الفحص' | 'محول للجنة' | 'معتمد ومقيد' | 'مرفوض'; // حالة الطلب
  staffName: string;          // الموظف المختص (الافتراضي: غير محدد)
  notes?: string;
  version: number;
  updatedAt: string;
  isDeleted?: boolean;
  deletedAt?: string;
  syncStatus?: 'pending' | 'synced' | 'unconfirmed';
}

export interface OpeningBalanceEntry {
  category: StockCategory;
  quantity: number;
  inventoryDate: string;
  inventoryKeeper: string;
  notes?: string;
}

export interface OfficeSettings {
  officeName: string;
  governorate: string;
  currentEmployee: string;    // اسم الموظف الحالي (افتراضي: غير محدد)
  healthCardMaleFee: number;  // تسعيرة بطاقة الذكور
  healthCardFemaleFee: number;// تسعيرة بطاقة الإناث
  birthCertFee: number;
  deathCertFee: number;
}

export interface Tombstone {
  recordId: string;
  recordType: 'supply' | 'dispense' | 'late_registration';
  transactionId: string;
  deletedAt: string;
  version: number;
}

export interface ResetBoundary {
  resetId: string;
  resetTimestamp: string;
  resetBy: string;
  reason?: string;
}

export type OperationType =
  | 'SUPPLY_ADD'
  | 'SUPPLY_UPDATE'
  | 'SUPPLY_DELETE'
  | 'DISPENSE_ADD'
  | 'DISPENSE_UPDATE'
  | 'DISPENSE_DELETE'
  | 'LATE_REG_ADD'
  | 'LATE_REG_UPDATE'
  | 'LATE_REG_DELETE'
  | 'MANUAL_STOCK_ADJUSTMENT'
  | 'OPENING_BALANCE_SET';

export interface SyncTransactionItem {
  transactionId: string;
  operationKey: string;       // ${operationType}:${recordId}:${version}
  recordId: string;
  operationType: OperationType;
  version: number;
  updatedAt: string;
  deviceId: string;
  payload: any;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  category?: StockCategory;
  details: string;
  performedBy: string;
  previousValue?: any;
  newValue?: any;
}

export interface DatabaseSchema {
  version: number;
  lastUpdated: string;
  resetBoundary: ResetBoundary;
  officeSettings: OfficeSettings;
  stocks: Record<StockCategory, CategoryStock>;
  supplies: SupplyTransaction[];
  dispenses: DispenseRecord[];
  lateRegistrations: LateRegistrationRecord[];
  openingBalances: Record<StockCategory, OpeningBalanceEntry>;
  tombstones: Tombstone[];
  auditLogs: AuditLogEntry[];
}

export interface IntegrityIssue {
  id: string;
  code:
    | 'STOCK_INTEGRITY_MISMATCH'
    | 'NEGATIVE_STOCK'
    | 'DUPLICATE_TRANSACTION'
    | 'DUPLICATE_RECORD'
    | 'INVALID_CATEGORY'
    | 'INVALID_TRANSACTION_TYPE'
    | 'INVALID_GENDER'
    | 'ORPHAN_TRANSACTION'
    | 'STALE_UPDATE'
    | 'ONLINE_ONLY_TRANSACTION'
    | 'DEMO_TRANSACTION'
    | 'RESET_BOUNDARY_VIOLATION'
    | 'DELETED_TRANSACTION_RETURNING';
  severity: 'critical' | 'warning' | 'info';
  category?: StockCategory;
  title: string;
  description: string;
  details: Record<string, any>;
  detectedAt: string;
}

export interface IntegrityReport {
  timestamp: string;
  hasErrors: boolean;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  issues: IntegrityIssue[];
  categoryAudits: Array<{
    category: StockCategory;
    currentStock: number;
    theoreticalStock: number;
    difference: number;
    isBalanced: boolean;
    openingStock: number;
    totalReceived: number;
    totalDispensed: number;
    damagedOrCancelled: number;
  }>;
}

import React, { useState } from 'react';
import { AppDatabase, StockCategory, OpeningBalanceRecord, OpeningBalanceItem, SerialRange } from '../types';
import { saveOpeningBalances, exportToCSV } from '../storage/db';
import { MultipleSerialsModal } from './MultipleSerialsModal';
import { 
  Boxes, 
  Save, 
  Printer, 
  FileSpreadsheet, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle, 
  Calendar, 
  FileText, 
  UserCheck, 
  ShieldCheck, 
  Building2, 
  HelpCircle,
  Hash,
  Layers,
  ArrowDownToLine,
  X
} from 'lucide-react';

interface OpeningBalancesScreenProps {
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
  onNavigateToStock?: () => void;
}

export const OpeningBalancesScreen: React.FC<OpeningBalancesScreenProps> = ({
  db,
  onDatabaseUpdate,
  onNavigateToStock,
}) => {
  // Existing or default opening balance record
  const existingOpening = db.openingBalances;

  // Metadata form state
  const [asOfDate, setAsOfDate] = useState<string>(existingOpening?.asOfDate || '2026-01-01');
  const [minuteNumber, setMinuteNumber] = useState<string>(existingOpening?.minuteNumber || 'محضر جرد عهدة رقم 1 لسنة 2026');
  const [inventoryKeeper, setInventoryKeeper] = useState<string>(
    existingOpening?.inventoryKeeper || db.officeSettings.currentEmployee || 'غير محدد'
  );
  const [committeeLeader, setCommitteeLeader] = useState<string>(
    existingOpening?.committeeLeader || 'د. مفتش صحة سفلاق'
  );
  const [committeeMember, setCommitteeMember] = useState<string>(
    existingOpening?.committeeMember || 'مراقب أول صحة سفلاق'
  );
  const [officeManager, setOfficeManager] = useState<string>(
    existingOpening?.officeManager || 'مدير مكتب صحة سفلاق'
  );
  const [generalNotes, setGeneralNotes] = useState<string>(
    existingOpening?.notes || 'تم جرد وإثبات الأرصدة الافتتاحية للدفاتر والنماذج الرسمية كعهدة مستندية بمكتب صحة سفلاق ومطابقتها دفترياً وفعلياً.'
  );

  // Items opening balance state
  const initializeItemsState = (): Record<StockCategory, OpeningBalanceItem> => {
    const categories: StockCategory[] = [
      'birth_certificates',
      'birth_notifications',
      'health_cards_male',
      'health_cards_female',
      'death_certificates',
      'death_notifications',
      'late_reg_under_year',
      'late_reg_over_year',
    ];

    const state: Partial<Record<StockCategory, OpeningBalanceItem>> = {};

    categories.forEach((cat) => {
      const existingItem = existingOpening?.items?.[cat];
      const stock = db.stocks[cat];
      const sFrom = existingItem?.serialFrom ?? stock?.openingSerialFrom ?? '';
      const sTo = existingItem?.serialTo ?? stock?.openingSerialTo ?? '';
      const fallbackRanges: SerialRange[] = (sFrom || sTo) ? [
        {
          id: `range-${cat}-0`,
          bookNumber: 'دفتر 1',
          from: sFrom,
          to: sTo,
          notes: 'التسلسل الأول',
        }
      ] : [];

      state[cat] = {
        stockCategory: cat,
        openingQuantity: existingItem?.openingQuantity ?? stock?.openingStock ?? stock?.currentStock ?? 0,
        serialFrom: sFrom,
        serialTo: sTo,
        serialRanges: existingItem?.serialRanges ?? stock?.openingSerialRanges ?? fallbackRanges,
        minThreshold: existingItem?.minThreshold ?? stock?.minThreshold ?? 20,
        notes: existingItem?.notes ?? '',
      };
    });

    return state as Record<StockCategory, OpeningBalanceItem>;
  };

  const [items, setItems] = useState<Record<StockCategory, OpeningBalanceItem>>(initializeItemsState);
  const [updateMode, setUpdateMode] = useState<'recalculate' | 'override_current'>('recalculate');
  const [savedSuccessToast, setSavedSuccessToast] = useState<string | null>(null);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [multipleSerialsModalCategory, setMultipleSerialsModalCategory] = useState<StockCategory | null>(null);

  const handleSaveMultipleSerials = (ranges: SerialRange[], totalQuantity: number) => {
    if (!multipleSerialsModalCategory) return;
    const firstFrom = ranges[0]?.from || '';
    const lastTo = ranges[ranges.length - 1]?.to || '';

    setItems((prev) => {
      const current = prev[multipleSerialsModalCategory];
      return {
        ...prev,
        [multipleSerialsModalCategory]: {
          ...current,
          serialRanges: ranges,
          serialFrom: firstFrom,
          serialTo: lastTo,
          openingQuantity: totalQuantity > 0 ? totalQuantity : current.openingQuantity,
        },
      };
    });

    setSavedSuccessToast(`تم حفظ ${ranges.length} دفاتر/تسلسلات بنجاح لصنف ${categoryConfig[multipleSerialsModalCategory].label}`);
    setTimeout(() => setSavedSuccessToast(null), 3000);
  };

  // Categories config for presentation
  const categoryConfig: Record<StockCategory, {
    label: string;
    group: 'birth' | 'health_card' | 'death' | 'late_reg';
    groupName: string;
    badgeColor: string;
    unit: string;
  }> = {
    birth_certificates: {
      label: 'دفاتر شهادات الميلاد الورقية الرسمية',
      group: 'birth',
      groupName: 'المواليد',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      unit: 'شهادة / استمارة',
    },
    birth_notifications: {
      label: 'دفاتر بلاغات الميلاد (إخطار تبليغ)',
      group: 'birth',
      groupName: 'المواليد',
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      unit: 'أصل بلاغ',
    },
    health_cards_male: {
      label: 'البطاقات الصحية - ذكور (الزرقاء)',
      group: 'health_card',
      groupName: 'البطاقات الصحية',
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
      unit: 'بطاقة صحية',
    },
    health_cards_female: {
      label: 'البطاقات الصحية - إناث (الوردية)',
      group: 'health_card',
      groupName: 'البطاقات الصحية',
      badgeColor: 'bg-pink-100 text-pink-800 border-pink-300',
      unit: 'بطاقة صحية',
    },
    death_certificates: {
      label: 'دفاتر شهادات الوفاة الورقية الرسمية',
      group: 'death',
      groupName: 'الوفيات',
      badgeColor: 'bg-slate-200 text-slate-800 border-slate-300',
      unit: 'شهادة / تصريح دفن',
    },
    death_notifications: {
      label: 'دفاتر بلاغات الوفاة (إخطار تبليغ)',
      group: 'death',
      groupName: 'الوفيات',
      badgeColor: 'bg-slate-200 text-slate-800 border-slate-300',
      unit: 'أصل بلاغ',
    },
    late_reg_under_year: {
      label: 'استمارات ساقط قيد (أقل من عام)',
      group: 'late_reg',
      groupName: 'ساقط القيد',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
      unit: 'استمارة 26 أ.ح',
    },
    late_reg_over_year: {
      label: 'استمارات ساقط قيد (أكبر من عام)',
      group: 'late_reg',
      groupName: 'ساقط القيد',
      badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
      unit: 'استمارة 26 أ.ح',
    },
  };

  const categories = Object.keys(categoryConfig) as StockCategory[];

  // Update a single item field
  const handleItemChange = (
    cat: StockCategory, 
    field: keyof OpeningBalanceItem, 
    val: string | number
  ) => {
    setItems((prev) => ({
      ...prev,
      [cat]: {
        ...prev[cat],
        [field]: val,
      },
    }));
  };

  // Helper to auto-fill opening quantities from current stock
  const handleCopyFromCurrentStock = () => {
    if (window.confirm('هل تريد نسخ الأرصدة الحالية المسجلة في النظام كأرصدة افتتاحية؟')) {
      const updated: Record<StockCategory, OpeningBalanceItem> = { ...items };
      categories.forEach((cat) => {
        const stock = db.stocks[cat];
        if (stock) {
          updated[cat] = {
            ...updated[cat],
            openingQuantity: stock.currentStock,
            minThreshold: stock.minThreshold,
          };
        }
      });
      setItems(updated);
      setSavedSuccessToast('تم نسخ الأرصدة الحالية إلى حقول الأرصدة الافتتاحية بنجاح.');
      setTimeout(() => setSavedSuccessToast(null), 4000);
    }
  };

  // Save changes to DB
  const executeSave = () => {
    const record: OpeningBalanceRecord = {
      asOfDate,
      minuteNumber: minuteNumber.trim() || 'محضر جرد عهدة غير مرقم',
      inventoryKeeper: inventoryKeeper.trim() || 'كاتب صحة سفلاق',
      committeeLeader: committeeLeader.trim() || 'د. مفتش صحة سفلاق',
      committeeMember: committeeMember.trim() || 'مراقب أول صحة سفلاق',
      officeManager: officeManager.trim() || 'مدير مكتب صحة سفلاق',
      items,
      notes: generalNotes.trim(),
      createdAt: existingOpening?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedDb = saveOpeningBalances(record, updateMode);
    onDatabaseUpdate(updatedDb);

    setShowConfirmModal(false);
    setSavedSuccessToast('تم حفظ واعتماد الأرصدة الافتتاحية وتحديث أرصدة المخزن بنجاح!');
    setTimeout(() => setSavedSuccessToast(null), 5000);
  };

  // Export to Excel (CSV with UTF-8 BOM)
  const handleExportCSV = () => {
    const rows: string[][] = [
      ['محضر جرد وإثبات الأرصدة الافتتاحية للعهدة الدفترية'],
      ['الجهة:', 'مديرية الشؤون الصحية بسوهاج - الإدارة الصحية بساقلتة - مكتب صحة سفلاق'],
      ['تاريخ الرصيد الافتتاحي:', asOfDate],
      ['رقم محضر الجرد:', minuteNumber],
      ['أمين العهدة (كاتب الصحة):', inventoryKeeper],
      ['رئيس لجنة الجرد:', committeeLeader],
      ['عضو لجنة الجرد (مراقب الصحة):', committeeMember || ''],
      ['مدير مكتب الصحة:', officeManager || ''],
      ['ملاحظات عامة:', generalNotes],
      [''],
      [
        'م',
        'اسم الصنف / الدفتر',
        'الفئة',
        'الوحدة',
        'الرصيد الافتتاحي',
        'من مسلسل',
        'إلى مسلسل',
        'حد التنبيه (الحد الأدنى)',
        'الرصيد الفعلي الحالي',
        'الوارد بعد الافتتاحي',
        'المنصرف بعد الافتتاحي',
        'ملاحظات الصنف',
      ],
    ];

    categories.forEach((cat, index) => {
      const item = items[cat];
      const stock = db.stocks[cat];
      const config = categoryConfig[cat];
      rows.push([
        String(index + 1),
        config.label,
        config.groupName,
        config.unit,
        String(item.openingQuantity),
        item.serialFrom || '-',
        item.serialTo || '-',
        String(item.minThreshold ?? 20),
        String(stock?.currentStock ?? 0),
        String(stock?.totalReceived ?? 0),
        String(stock?.totalDispensed ?? 0),
        item.notes || '-',
      ]);
    });

    const dateStr = new Date().toISOString().split('T')[0];
    exportToCSV(`الارصدة_الافتتاحية_مكتب_صحة_سفلاق_${dateStr}.csv`, rows);
  };

  // Calculations for quick KPIs
  const totalOpeningUnits = categories.reduce((sum, cat) => sum + (Number(items[cat]?.openingQuantity) || 0), 0);
  const birthOpeningUnits = (Number(items['birth_certificates']?.openingQuantity) || 0) + (Number(items['birth_notifications']?.openingQuantity) || 0);
  const cardsOpeningUnits = (Number(items['health_cards_male']?.openingQuantity) || 0) + (Number(items['health_cards_female']?.openingQuantity) || 0);
  const deathOpeningUnits = (Number(items['death_certificates']?.openingQuantity) || 0) + (Number(items['death_notifications']?.openingQuantity) || 0);
  const lateRegOpeningUnits = (Number(items['late_reg_under_year']?.openingQuantity) || 0) + (Number(items['late_reg_over_year']?.openingQuantity) || 0);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {savedSuccessToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-emerald-800 text-white px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 border border-emerald-600 animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="font-bold text-sm md:text-base">{savedSuccessToast}</span>
        </div>
      )}

      {/* Main Title & Action Bar */}
      <div className="bg-white rounded-2xl p-5 md:p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-200">
                <Boxes className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl md:text-2xl font-black text-slate-900">
                  الأرصدة الافتتاحية ومحضر جرد العهدة الدفترية
                </h2>
                <p className="text-xs md:text-sm text-slate-600 mt-0.5">
                  مكتب صحة سفلاق - الإدارة الصحية بساقلتة | إثبات وتحديث الأرصدة البداية للمستندات والدفاتر الثمانية الرسمية
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="opening-balance-copy-current-btn"
              type="button"
              onClick={handleCopyFromCurrentStock}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs md:text-sm font-semibold transition cursor-pointer border border-slate-300"
              title="نسخ الأرصدة الحالية في المخزن إلى خانات الأرصدة الافتتاحية"
            >
              <ArrowDownToLine className="w-4 h-4 text-slate-600" />
              <span>استيراد من الرصيد الحالي</span>
            </button>

            <button
              id="opening-balance-export-csv-btn"
              type="button"
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs md:text-sm font-semibold transition cursor-pointer border border-emerald-300"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel (CSV)</span>
            </button>

            <button
              id="opening-balance-print-modal-btn"
              type="button"
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs md:text-sm font-bold transition cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4 text-slate-300" />
              <span>طباعة محضر الجرد الرسمي</span>
            </button>

            <button
              id="opening-balance-save-main-btn"
              type="button"
              onClick={() => setShowConfirmModal(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs md:text-sm font-black transition cursor-pointer shadow-sm shadow-emerald-700/20"
            >
              <Save className="w-4 h-4" />
              <span>حفظ واعتماد الأرصدة الافتتاحية</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
        <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 text-white p-4 rounded-2xl shadow-xs border border-emerald-800">
          <div className="flex items-center justify-between text-emerald-200 text-xs mb-1 font-medium">
            <span>إجمالي الأرصدة الافتتاحية</span>
            <Boxes className="w-4 h-4" />
          </div>
          <div className="text-2xl md:text-3xl font-black text-white">
            {totalOpeningUnits.toLocaleString('ar-EG')}
          </div>
          <div className="text-[11px] text-emerald-300 mt-1">
            دفتر / بطاقة / استمارة
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1 font-semibold">
            <span>دفاتر المواليد الرسمية</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          </div>
          <div className="text-xl md:text-2xl font-black text-slate-800">
            {birthOpeningUnits.toLocaleString('ar-EG')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            شهادات وبلاغات ميلاد
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1 font-semibold">
            <span>البطاقات الصحية (ذكور وإناث)</span>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          </div>
          <div className="text-xl md:text-2xl font-black text-blue-900">
            {cardsOpeningUnits.toLocaleString('ar-EG')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            بطاقة صحية رعاية وتطعيمات
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1 font-semibold">
            <span>دفاتر الوفيات الرسمية</span>
            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
          </div>
          <div className="text-xl md:text-2xl font-black text-slate-800">
            {deathOpeningUnits.toLocaleString('ar-EG')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            شهادات وبلاغات وفاة
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-1 font-semibold">
            <span>نماذج ساقط القيد</span>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          </div>
          <div className="text-xl md:text-2xl font-black text-purple-900">
            {lateRegOpeningUnits.toLocaleString('ar-EG')}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            استمارات نموذج 26 أ.ح
          </div>
        </div>
      </div>

      {/* Protocol Meta Information Form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-700" />
            <h3 className="font-black text-slate-900 text-base md:text-lg">
              بيانات محضر جرد العهدة وتشكيل اللجنة
            </h3>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200">
            معتمد بلائحة المخازن الحكومية
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              تاريخ الرصيد الافتتاحي (تاريخ الجرد) *
            </label>
            <div className="relative">
              <input
                id="opening-as-of-date"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              تاريخ بداية العهدة أو السنة الدفترية لمكتب صحة سفلاق
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رقم محضر الجرد الافتتاحي *
            </label>
            <input
              id="opening-minute-number"
              type="text"
              value={minuteNumber}
              onChange={(e) => setMinuteNumber(e.target.value)}
              placeholder="مثال: محضر جرد رقم 1 لسنة 2026"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
            />
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              رقم الإثبات أو القيد بسجلات مكتب صحة سفلاق
            </span>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              أمين العهدة (كاتب صحة سفلاق) *
            </label>
            <input
              id="opening-inventory-keeper"
              type="text"
              value={inventoryKeeper}
              onChange={(e) => setInventoryKeeper(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
            />
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              الموظف المسؤول عن تسلم وحفظ الدفاتر بالمكتب
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              رئيس لجنة الجرد (المفتش الصحي)
            </label>
            <input
              id="opening-committee-leader"
              type="text"
              value={committeeLeader}
              onChange={(e) => setCommitteeLeader(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              عضو لجنة الجرد (مراقب أول الصحة)
            </label>
            <input
              id="opening-committee-member"
              type="text"
              value={committeeMember}
              onChange={(e) => setCommitteeMember(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              الاعتماد (مدير مكتب صحة سفلاق)
            </label>
            <input
              id="opening-office-manager"
              type="text"
              value={officeManager}
              onChange={(e) => setOfficeManager(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">
            ملاحظات عامة حول محضر الجرد وحالة الدفاتر
          </label>
          <input
            id="opening-general-notes"
            type="text"
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            placeholder="ملاحظات حول سريان الدفاتر ومطابقة الأرصدة الفعلية..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Opening Balances Detail Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 md:p-5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-700" />
              <span>جدول حصر وإدخال الأرصدة الافتتاحية للأصناف الثمانية</span>
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              قم بكتابة الرصيد الافتتاحي الفعلي والمسلسلات من/إلى وحد التنبيه لكل صنف بدقة
            </p>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-300 text-xs font-bold">
            <span className="text-slate-600 px-2">طريقة التطبيق:</span>
            <button
              type="button"
              onClick={() => setUpdateMode('recalculate')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                updateMode === 'recalculate'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="الرصيد الحالي = الرصيد الافتتاحي + الوارد - المنصرف"
            >
              احتساب مع الوارد والمنصرف
            </button>
            <button
              type="button"
              onClick={() => setUpdateMode('override_current')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                updateMode === 'override_current'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="يتم ضبط الرصيد الحالي بالمخزن ليكون مساوياً للرصيد الافتتاحي مباشرة"
            >
              تعيين كرصيد حالي مباشر
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-700 text-xs font-black border-b border-slate-200">
                <th className="p-3 w-12 text-center">م</th>
                <th className="p-3 min-w-[220px]">اسم الصنف / الدفتر الرسمي</th>
                <th className="p-3 w-28 text-center">الوحدة</th>
                <th className="p-3 w-36 text-center bg-emerald-50 text-emerald-950 font-black border-x border-emerald-200">
                  الرصيد الافتتاحي *
                </th>
                <th className="p-3 w-32 text-center">من مسلسل</th>
                <th className="p-3 w-32 text-center">إلى مسلسل</th>
                <th className="p-3 w-28 text-center">حد التنبيه</th>
                <th className="p-3 w-32 text-center bg-slate-50 text-slate-800">
                  الرصيد الفعلي الحالي
                </th>
                <th className="p-3 min-w-[180px]">ملاحظات الصنف</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {categories.map((cat, idx) => {
                const item = items[cat];
                const stock = db.stocks[cat];
                const config = categoryConfig[cat];

                // Auto-calculate difference or expected count if numeric
                const numFrom = parseInt(item.serialFrom || '', 10);
                const numTo = parseInt(item.serialTo || '', 10);
                const serialCount = (!isNaN(numFrom) && !isNaN(numTo) && numTo >= numFrom)
                  ? (numTo - numFrom + 1)
                  : null;

                // Preview current stock after mode
                const previewStock = updateMode === 'override_current'
                  ? item.openingQuantity
                  : ((item.openingQuantity || 0) + (stock?.totalReceived || 0) - (stock?.totalDispensed || 0) - (stock?.damagedOrCancelled || 0));

                return (
                  <tr key={cat} className="hover:bg-slate-50/80 transition">
                    <td className="p-3 text-center text-xs text-slate-500 font-bold">
                      {idx + 1}
                    </td>

                    <td className="p-3">
                      <div className="font-bold text-slate-900">{config.label}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border ${config.badgeColor}`}>
                          {config.groupName}
                        </span>
                        {serialCount !== null && (
                          <span className="text-[11px] text-slate-500">
                            (إجمالي المسلسل: {serialCount.toLocaleString('ar-EG')} ورقة)
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="p-3 text-center text-xs font-semibold text-slate-600">
                      {config.unit}
                    </td>

                    {/* Opening Quantity Input */}
                    <td className="p-3 text-center bg-emerald-50/50 border-x border-emerald-100">
                      <input
                        id={`opening-qty-${cat}`}
                        type="number"
                        min="0"
                        value={item.openingQuantity === 0 ? '0' : item.openingQuantity || ''}
                        onChange={(e) => handleItemChange(cat, 'openingQuantity', Math.max(0, parseInt(e.target.value, 10) || 0))}
                        className="w-24 text-center py-1.5 px-2 font-black text-base text-emerald-950 bg-white border-2 border-emerald-400 rounded-xl focus:border-emerald-600 focus:outline-hidden shadow-2xs"
                      />
                    </td>

                    {/* Serial From & To */}
                    <td className="p-3 text-center" colSpan={2}>
                      <div className="flex items-center justify-center gap-2">
                        <div className="text-right">
                          <span className="block text-[10px] text-slate-500 font-bold mb-0.5">من مسلسل:</span>
                          <input
                            id={`opening-serial-from-${cat}`}
                            type="text"
                            value={item.serialFrom || ''}
                            onChange={(e) => handleItemChange(cat, 'serialFrom', e.target.value)}
                            placeholder="001001"
                            className="w-24 sm:w-28 text-center py-1 px-2 font-mono text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                          />
                        </div>

                        <span className="text-slate-400 mt-4 font-bold text-xs">⬅</span>

                        <div className="text-right">
                          <span className="block text-[10px] text-slate-500 font-bold mb-0.5">إلى مسلسل:</span>
                          <input
                            id={`opening-serial-to-${cat}`}
                            type="text"
                            value={item.serialTo || ''}
                            onChange={(e) => handleItemChange(cat, 'serialTo', e.target.value)}
                            placeholder="001200"
                            className="w-24 sm:w-28 text-center py-1 px-2 font-mono text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                          />
                        </div>
                      </div>

                      {/* Multiple Serials Trigger & Badges */}
                      <div className="mt-1.5 pt-1.5 border-t border-slate-100">
                        {item.serialRanges && item.serialRanges.length > 1 ? (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                                <Layers className="w-3 h-3 text-emerald-700" />
                                <span>{item.serialRanges.length} دفاتر / تسلسلات منفصلة</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => setMultipleSerialsModalCategory(cat)}
                                className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                              >
                                تعديل
                              </button>
                            </div>

                            <div className="flex flex-wrap gap-1 max-w-xs mx-auto justify-center">
                              {item.serialRanges.map((sr, sIdx) => (
                                <span 
                                  key={sIdx}
                                  className="text-[10px] font-mono font-bold bg-white text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 shadow-2xs"
                                  title={sr.notes || ''}
                                >
                                  {sr.bookNumber || `دفتر ${sIdx + 1}`}: {sr.from} إلى {sr.to} {sr.count ? `(${sr.count})` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setMultipleSerialsModalCategory(cat)}
                            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition cursor-pointer ${
                              (cat === 'birth_certificates' || cat === 'death_certificates')
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-300 shadow-2xs'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <Layers className="w-3.5 h-3.5 text-emerald-700" />
                            <span>
                              {(cat === 'birth_certificates' || cat === 'death_certificates')
                                ? '+ إضافة أكثر من تسلسل / دفاتر متعددة'
                                : '+ مسلسلات / دفاتر متعددة'}
                            </span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Min Threshold */}
                    <td className="p-3 text-center">
                      <input
                        id={`opening-threshold-${cat}`}
                        type="number"
                        min="1"
                        value={item.minThreshold ?? 20}
                        onChange={(e) => handleItemChange(cat, 'minThreshold', Math.max(1, parseInt(e.target.value, 10) || 1))}
                        className="w-20 text-center py-1 px-2 font-bold text-xs text-slate-800 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                      />
                    </td>

                    {/* Live Preview Current Stock */}
                    <td className="p-3 text-center bg-slate-50">
                      <div className="font-black text-sm text-slate-900">
                        {previewStock.toLocaleString('ar-EG')}
                      </div>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-sm ${
                        previewStock <= (item.minThreshold ?? 20)
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {previewStock <= (item.minThreshold ?? 20) ? 'رصيد منخفض' : 'رصيد آمن'}
                      </span>
                    </td>

                    {/* Notes */}
                    <td className="p-3">
                      <input
                        id={`opening-notes-${cat}`}
                        type="text"
                        value={item.notes || ''}
                        onChange={(e) => handleItemChange(cat, 'notes', e.target.value)}
                        placeholder="حالة الدفتر أو ملاحظات العهدة..."
                        className="w-full py-1 px-2 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:border-emerald-500 focus:outline-hidden"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer info & bottom action */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>
              يتم حفظ الأرصدة الافتتاحية في قاعدة البيانات وتحديث أرصدة بطاقات الصنف الدفترية فورياً.
            </span>
          </div>

          <button
            id="opening-balance-save-footer-btn"
            type="button"
            onClick={() => setShowConfirmModal(true)}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer transition shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>حفظ واعتماد محضر الأرصدة الافتتاحية</span>
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-emerald-800">
              <div className="p-2 bg-emerald-50 rounded-xl border border-emerald-200">
                <Boxes className="w-6 h-6 text-emerald-700" />
              </div>
              <h3 className="text-lg font-black text-slate-900">
                تأكيد حفظ واعتماد الأرصدة الافتتاحية
              </h3>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              أنت على وشك اعتماد محضر الأرصدة الافتتاحية لمكتب صحة سفلاق بتاريخ{' '}
              <strong className="text-slate-900 font-bold">{asOfDate}</strong>.
            </p>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-600">طريقة التطبيق المختارة:</span>
                <span className="font-bold text-slate-900">
                  {updateMode === 'recalculate'
                    ? 'احتساب تلقائي مع الوارد والمنصرف'
                    : 'تعيين مباشر كرصيد حالي'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">إجمالي الأرصدة الافتتاحية:</span>
                <span className="font-black text-emerald-700">
                  {totalOpeningUnits.toLocaleString('ar-EG')} وحدة
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">أمين العهدة المسؤول:</span>
                <span className="font-bold text-slate-900">{inventoryKeeper}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-xl text-sm font-semibold transition cursor-pointer"
              >
                إلغاء وتراجع
              </button>
              <button
                id="opening-balance-confirm-save-btn"
                type="button"
                onClick={executeSave}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-black transition cursor-pointer shadow-xs"
              >
                نعم، اعتمد واحفظ الأرصدة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Official Print Modal (محضر جرد وإثبات الأرصدة الافتتاحية) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-300">
            {/* Modal Actions Bar */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-700" />
                <h3 className="font-black text-slate-900 text-base">
                  معاينة طباعة محضر جرد وإثبات الأرصدة الافتتاحية الرسمي
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs md:text-sm font-bold transition cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الآن (A4)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Sheet */}
            <div className="p-6 md:p-8 overflow-y-auto space-y-6 text-slate-900" id="official-opening-balance-sheet">
              {/* Document Header */}
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-4">
                <div className="text-right space-y-1 text-xs md:text-sm font-bold">
                  <div>جمهورية مصر العربية</div>
                  <div>وزارة الصحة والسكان</div>
                  <div>مديرية الشؤون الصحية بسوهاج</div>
                  <div>الإدارة الصحية بساقلتة</div>
                  <div className="text-emerald-900 font-black">مكتب صحة سفلاق</div>
                </div>

                <div className="text-center space-y-1">
                  <div className="w-16 h-16 mx-auto rounded-full border-2 border-slate-900 flex items-center justify-center font-bold text-xs p-1 text-slate-800">
                    شعار الجمهورية
                  </div>
                  <div className="text-[10px] text-slate-600 font-bold">نموذج مخازن حكومية معتمد</div>
                </div>

                <div className="text-left space-y-1 text-xs md:text-sm font-bold" dir="ltr">
                  <div>Date: {asOfDate}</div>
                  <div>No: {minuteNumber}</div>
                  <div>Fiscal Year: 2026</div>
                </div>
              </div>

              {/* Protocol Title */}
              <div className="text-center py-2">
                <h1 className="text-lg md:text-xl font-black text-slate-900 underline underline-offset-8">
                  محضر جرد وإثبات الأرصدة الافتتاحية للعهدة الدفترية والمستندية
                </h1>
                <p className="text-xs md:text-sm font-semibold text-slate-700 mt-2">
                  خاص بمكتب صحة سفلاق - عن السنة الدفترية والمالية 2026
                </p>
              </div>

              {/* Protocol Body Text */}
              <div className="text-xs md:text-sm text-slate-800 leading-relaxed text-justify bg-slate-50 p-4 rounded-xl border border-slate-200">
                إنه في يوم <span className="font-bold underline">...............</span> الموافق{' '}
                <span className="font-bold underline">{asOfDate}</span>، بناءً على أحكام اللائحة المالية للموازنة والحسابات
                وتعليمات وزارة الصحة والسكان بشأن تنظيم العهد الدفترية بمكاتب الصحة، اجتمعت اللجنة المشكلة برئاسة{' '}
                <strong className="font-black text-slate-900">{committeeLeader}</strong> وعضوية كل من{' '}
                <strong className="font-black text-slate-900">{committeeMember}</strong> وبحضور أمين العهدة كاتب صحة سفلاق السيد/{' '}
                <strong className="font-black text-slate-900">{inventoryKeeper}</strong>، وقامت اللجنة بجرد وفحص وتحديد الأرصدة
                الافتتاحية للدفاتر ذات القيمة والنماذج الرسمية المسلمة كعهدة بالمكتب وجاءت النتائج مطابقة كما يلي:
              </div>

              {/* Protocol Items Table */}
              <table className="w-full text-right border-collapse border border-slate-400 text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-200 text-slate-900 font-black border-b border-slate-400">
                    <th className="p-2 border border-slate-400 text-center w-8">م</th>
                    <th className="p-2 border border-slate-400">اسم الصنف / الدفتر</th>
                    <th className="p-2 border border-slate-400 text-center w-20">الوحدة</th>
                    <th className="p-2 border border-slate-400 text-center w-24 bg-slate-100">الرصيد الافتتاحي</th>
                    <th className="p-2 border border-slate-400 text-center w-24">من مسلسل</th>
                    <th className="p-2 border border-slate-400 text-center w-24">إلى مسلسل</th>
                    <th className="p-2 border border-slate-400 text-center w-20">حد التنبيه</th>
                    <th className="p-2 border border-slate-400">حالة العهدة وملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, idx) => {
                    const item = items[cat];
                    const config = categoryConfig[cat];
                    return (
                      <tr key={cat} className="border-b border-slate-300">
                        <td className="p-2 border border-slate-300 text-center font-bold">{idx + 1}</td>
                        <td className="p-2 border border-slate-300 font-bold">{config.label}</td>
                        <td className="p-2 border border-slate-300 text-center">{config.unit}</td>
                        <td className="p-2 border border-slate-300 text-center font-black text-slate-950 bg-slate-50">
                          {item.openingQuantity.toLocaleString('ar-EG')}
                        </td>
                        {item.serialRanges && item.serialRanges.length > 1 ? (
                          <td className="p-2 border border-slate-300 text-center font-mono text-[11px]" colSpan={2}>
                            <div className="space-y-0.5 text-right pr-2">
                              {item.serialRanges.map((sr, sIdx) => (
                                <div key={sIdx} className="text-slate-800 font-semibold border-b border-slate-150 last:border-0 pb-0.5">
                                  <span>{sr.bookNumber || `دفتر ${sIdx + 1}`}:</span> {sr.from} ⬅ {sr.to} {sr.count ? `(${sr.count} و)` : ''}
                                </div>
                              ))}
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="p-2 border border-slate-300 text-center font-mono">{item.serialFrom || '-'}</td>
                            <td className="p-2 border border-slate-300 text-center font-mono">{item.serialTo || '-'}</td>
                          </>
                        )}
                        <td className="p-2 border border-slate-300 text-center font-bold">{item.minThreshold ?? 20}</td>
                        <td className="p-2 border border-slate-300 text-xs">{item.notes || 'سليمة ومعتمدة'}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-100 font-black border-t-2 border-slate-400">
                    <td colSpan={3} className="p-2 border border-slate-400 text-left pl-4">
                      إجمالي عدد الوحدات الافتتاحية:
                    </td>
                    <td className="p-2 border border-slate-400 text-center text-emerald-950 text-base">
                      {totalOpeningUnits.toLocaleString('ar-EG')}
                    </td>
                    <td colSpan={4} className="p-2 border border-slate-400 text-xs text-slate-600">
                      دفتر / بطاقة / استمارة رسمية مسلسلة
                    </td>
                  </tr>
                </tbody>
              </table>

              {/* Protocol Closing Statement */}
              <div className="text-xs md:text-sm text-slate-800 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <strong>إقرار:</strong> أقر أنا كاتب صحة سفلاق (أمين العهدة) بأنني استلمت الأرصدة المبينة أعلاه بعاليها
                وهي في حيازتي وتحت مسؤوليتي الكاملة وأتعهد بعدم صرف أي ورقة أو نموذج إلا طبقاً للتعليمات واللوائح والقرارات
                الوزارية المنظمة لذلك، وقيد كافة العمليات بأرقامها المسلسلة بدفاتر القيد بالمكتب.
              </div>

              {/* Signatures Section */}
              <div className="grid grid-cols-4 gap-4 pt-6 text-center text-xs md:text-sm font-bold border-t border-slate-300">
                <div className="space-y-8">
                  <div>أمين العهدة (كاتب الصحة)</div>
                  <div className="text-slate-700 font-medium">
                    {inventoryKeeper}
                    <div className="text-[11px] text-slate-400 mt-1">التوقيع: .....................</div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>عضو لجنة الجرد (مراقب الصحة)</div>
                  <div className="text-slate-700 font-medium">
                    {committeeMember}
                    <div className="text-[11px] text-slate-400 mt-1">التوقيع: .....................</div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>رئيس لجنة الجرد (المفتش الصحي)</div>
                  <div className="text-slate-700 font-medium">
                    {committeeLeader}
                    <div className="text-[11px] text-slate-400 mt-1">التوقيع: .....................</div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div>يعتمد، مدير مكتب صحة سفلاق</div>
                  <div className="text-slate-700 font-medium">
                    {officeManager}
                    <div className="text-[11px] text-slate-400 mt-1">خاتم شعار الجمهورية:</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multiple Serials / Books Configuration Modal */}
      {multipleSerialsModalCategory && (
        <MultipleSerialsModal
          isOpen={!!multipleSerialsModalCategory}
          category={multipleSerialsModalCategory}
          categoryName={categoryConfig[multipleSerialsModalCategory].label}
          unit={categoryConfig[multipleSerialsModalCategory].unit}
          initialRanges={items[multipleSerialsModalCategory].serialRanges}
          initialSingleFrom={items[multipleSerialsModalCategory].serialFrom}
          initialSingleTo={items[multipleSerialsModalCategory].serialTo}
          onClose={() => setMultipleSerialsModalCategory(null)}
          onSave={handleSaveMultipleSerials}
        />
      )}
    </div>
  );
};

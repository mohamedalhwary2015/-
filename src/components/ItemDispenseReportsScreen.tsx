import React, { useState, useMemo, useRef } from 'react';
import { AppDatabase, DispenseRecord, StockCategory, StockItem } from '../types';
import { exportToCSV } from '../storage/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Calendar,
  Filter,
  Download,
  Printer,
  Search,
  FileSpreadsheet,
  Package,
  Baby,
  Skull,
  CreditCard,
  FileQuestion,
  CheckCircle2,
  TrendingDown,
  Building2,
  Layers,
  ArrowRightLeft,
  CalendarDays,
  FileText,
  Clock,
  ChevronRight,
  Eye,
  Info,
  BarChart3,
  FileCheck2
} from 'lucide-react';

interface ItemDispenseReportsScreenProps {
  db: AppDatabase;
  onSelectPrintRecord: (record: DispenseRecord) => void;
}

export type SelectedItemFilter = 'all' | StockCategory;

interface ItemMeta {
  id: StockCategory;
  name: string;
  shortName: string;
  categoryGroup: 'birth' | 'death' | 'health_card' | 'late_registration';
  groupLabel: string;
  unit: string;
  colorClass: string;
  badgeClass: string;
  icon: React.FC<{ className?: string }>;
}

const ITEMS_CONFIG: Record<StockCategory, ItemMeta> = {
  birth_certificates: {
    id: 'birth_certificates',
    name: 'دفاتر شهادات الميلاد الورقية',
    shortName: 'شهادات ميلاد',
    categoryGroup: 'birth',
    groupLabel: 'مواليد',
    unit: 'شهادة',
    colorClass: 'border-blue-500 text-blue-800 bg-blue-50',
    badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
    icon: Baby,
  },
  birth_notifications: {
    id: 'birth_notifications',
    name: 'دفاتر بلاغات الميلاد (إخطارات الولادة)',
    shortName: 'بلاغات ميلاد',
    categoryGroup: 'birth',
    groupLabel: 'مواليد',
    unit: 'بلاغ',
    colorClass: 'border-cyan-500 text-cyan-800 bg-cyan-50',
    badgeClass: 'bg-cyan-100 text-cyan-900 border-cyan-200',
    icon: Baby,
  },
  health_cards_male: {
    id: 'health_cards_male',
    name: 'البطاقات الصحية (ذكور - زرقاء)',
    shortName: 'بطاقات ذكور',
    categoryGroup: 'health_card',
    groupLabel: 'بطاقات صحية',
    unit: 'بطاقة',
    colorClass: 'border-indigo-500 text-indigo-800 bg-indigo-50',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    icon: CreditCard,
  },
  health_cards_female: {
    id: 'health_cards_female',
    name: 'البطاقات الصحية (إناث - وردية)',
    shortName: 'بطاقات إناث',
    categoryGroup: 'health_card',
    groupLabel: 'بطاقات صحية',
    unit: 'بطاقة',
    colorClass: 'border-pink-500 text-pink-800 bg-pink-50',
    badgeClass: 'bg-pink-100 text-pink-900 border-pink-200',
    icon: CreditCard,
  },
  death_certificates: {
    id: 'death_certificates',
    name: 'دفاتر شهادات الوفاة الورقية',
    shortName: 'شهادات وفاة',
    categoryGroup: 'death',
    groupLabel: 'وفيات',
    unit: 'شهادة',
    colorClass: 'border-slate-500 text-slate-800 bg-slate-50',
    badgeClass: 'bg-slate-200 text-slate-900 border-slate-300',
    icon: Skull,
  },
  death_notifications: {
    id: 'death_notifications',
    name: 'دفاتر بلاغات الوفاة (إخطارات الوفاة)',
    shortName: 'بلاغات وفاة',
    categoryGroup: 'death',
    groupLabel: 'وفيات',
    unit: 'بلاغ',
    colorClass: 'border-stone-500 text-stone-800 bg-stone-50',
    badgeClass: 'bg-stone-200 text-stone-900 border-stone-300',
    icon: Skull,
  },
  late_reg_under_year: {
    id: 'late_reg_under_year',
    name: 'استمارات ساقط قيد (أقل من عام - حديث)',
    shortName: 'ساقط قيد < عام',
    categoryGroup: 'late_registration',
    groupLabel: 'ساقط قيد',
    unit: 'استمارة',
    colorClass: 'border-amber-500 text-amber-900 bg-amber-50',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
    icon: FileQuestion,
  },
  late_reg_over_year: {
    id: 'late_reg_over_year',
    name: 'استمارات ساقط قيد (أكبر من عام - معتمد)',
    shortName: 'ساقط قيد > عام',
    categoryGroup: 'late_registration',
    groupLabel: 'ساقط قيد',
    unit: 'استمارة',
    colorClass: 'border-orange-500 text-orange-900 bg-orange-50',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
    icon: FileQuestion,
  },
};

const ALL_CATEGORIES: StockCategory[] = [
  'birth_certificates',
  'birth_notifications',
  'health_cards_male',
  'health_cards_female',
  'death_certificates',
  'death_notifications',
  'late_reg_under_year',
  'late_reg_over_year',
];

// Helper to extract how many items of a given category were deducted in a record
function getItemQuantityFromRecord(record: DispenseRecord, category: StockCategory): number {
  if (record.itemsDeducted && Array.isArray(record.itemsDeducted)) {
    const item = record.itemsDeducted.find((i) => i.stockCategory === category);
    if (item) return item.quantity;
  }
  // Fallbacks for older legacy records
  if (
    category === 'birth_certificates' &&
    (record.dispenseType === 'birth_male' || record.dispenseType === 'birth_female')
  ) {
    return 1;
  }
  if (
    category === 'birth_notifications' &&
    (record.dispenseType === 'birth_male' || record.dispenseType === 'birth_female')
  ) {
    return 1;
  }
  if (category === 'health_cards_male' && record.dispenseType === 'birth_male') return 1;
  if (category === 'health_cards_female' && record.dispenseType === 'birth_female') return 1;
  if (category === 'death_certificates' && record.dispenseType === 'death') return 1;
  if (category === 'death_notifications' && record.dispenseType === 'death') return 1;
  if (category === 'late_reg_under_year' && record.dispenseType === 'late_reg_under_year') return 1;
  if (category === 'late_reg_over_year' && record.dispenseType === 'late_reg_over_year') return 1;
  return 0;
}

export const ItemDispenseReportsScreen: React.FC<ItemDispenseReportsScreenProps> = ({
  db,
  onSelectPrintRecord,
}) => {
  const todayStr = new Date().toISOString().split('T')[0];

  // Default date period: first day of current month to today
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  const defaultStartStr = firstDayOfMonth.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState<string>(defaultStartStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedItem, setSelectedItem] = useState<SelectedItemFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showPrintView, setShowPrintView] = useState<boolean>(false);

  // Quick Presets
  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'all') => {
    const now = new Date();
    if (preset === 'today') {
      const today = now.toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const str = yest.toISOString().split('T')[0];
      setStartDate(str);
      setEndDate(str);
    } else if (preset === 'week') {
      const sevenDaysAgo = new Date(now);
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      setStartDate(sevenDaysAgo.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'month') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(first.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'last_month') {
      const firstLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setStartDate(firstLastMonth.toISOString().split('T')[0]);
      setEndDate(lastLastMonth.toISOString().split('T')[0]);
    } else if (preset === 'year') {
      const firstYear = new Date(now.getFullYear(), 0, 1);
      setStartDate(firstYear.toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    } else if (preset === 'all') {
      setStartDate('2020-01-01');
      setEndDate(todayStr);
    }
  };

  // Dispense records filtered by the selected date range
  const periodDispenseRecords = useMemo(() => {
    return db.dispenseRecords.filter((r) => {
      const d = r.date;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [db.dispenseRecords, startDate, endDate]);

  // Calculate statistics per category for the date period
  const itemStatistics = useMemo(() => {
    const stats: Record<
      StockCategory,
      {
        totalDispensed: number;
        transactionCount: number;
        currentStock: number;
        minThreshold: number;
      }
    > = {} as any;

    ALL_CATEGORIES.forEach((cat) => {
      const stockObj = db.stocks[cat];
      let totalQty = 0;
      let txCount = 0;

      periodDispenseRecords.forEach((record) => {
        const qty = getItemQuantityFromRecord(record, cat);
        if (qty > 0) {
          totalQty += qty;
          txCount += 1;
        }
      });

      stats[cat] = {
        totalDispensed: totalQty,
        transactionCount: txCount,
        currentStock: stockObj?.currentStock ?? 0,
        minThreshold: stockObj?.minThreshold ?? 10,
      };
    });

    return stats;
  }, [db.stocks, periodDispenseRecords]);

  // Overall grand total of items dispensed during period
  const overallTotalDispensed = useMemo(() => {
    return ALL_CATEGORIES.reduce((acc, cat) => acc + itemStatistics[cat].totalDispensed, 0);
  }, [itemStatistics]);

  // Detailed records matching selected item & search term
  const filteredRecords = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return periodDispenseRecords
      .map((record) => {
        // Calculate items in this record for the selected filter
        let relevantQty = 0;
        if (selectedItem === 'all') {
          // Total items in record across all categories
          relevantQty = ALL_CATEGORIES.reduce(
            (sum, cat) => sum + getItemQuantityFromRecord(record, cat),
            0
          );
        } else {
          relevantQty = getItemQuantityFromRecord(record, selectedItem);
        }

        return {
          record,
          relevantQty,
        };
      })
      .filter(({ record, relevantQty }) => {
        // Must contain at least 1 unit of the item (or any item if 'all')
        if (relevantQty <= 0) return false;

        if (!query) return true;

        const ben = record.beneficiaryName.toLowerCase();
        const cert = (record.certificateNumber || '').toLowerCase();
        const staff = (record.dispensedBy || '').toLowerCase();
        const notes = (record.notes || '').toLowerCase();

        return ben.includes(query) || cert.includes(query) || staff.includes(query) || notes.includes(query);
      });
  }, [periodDispenseRecords, selectedItem, searchTerm]);

  // Summary stats for currently selected view
  const currentViewStats = useMemo(() => {
    if (selectedItem === 'all') {
      return {
        name: 'كافة الأصناف والمستندات',
        totalDispensed: overallTotalDispensed,
        transactionCount: periodDispenseRecords.length,
        currentStock: (Object.values(db.stocks) as StockItem[]).reduce((sum, s) => sum + (s.currentStock || 0), 0),
        unit: 'مستند/بطاقة',
      };
    }

    const info = ITEMS_CONFIG[selectedItem];
    const catStats = itemStatistics[selectedItem];
    return {
      name: info.name,
      totalDispensed: catStats.totalDispensed,
      transactionCount: catStats.transactionCount,
      currentStock: catStats.currentStock,
      unit: info.unit,
    };
  }, [selectedItem, overallTotalDispensed, periodDispenseRecords.length, db.stocks, itemStatistics]);

  // Calculate days in selected period for average
  const daysInPeriod = useMemo(() => {
    if (!startDate || !endDate) return 1;
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1);
  }, [startDate, endDate]);

  const dailyAverage = (currentViewStats.totalDispensed / daysInPeriod).toFixed(1);

  // Export to Excel / CSV
  const handleExportCSV = () => {
    const itemNameStr = selectedItem === 'all' ? 'كافة_الأصناف' : ITEMS_CONFIG[selectedItem].shortName.replace(/\s+/g, '_');
    const filename = `تقرير_صرف_${itemNameStr}_من_${startDate}_إلى_${endDate}.csv`;

    if (selectedItem === 'all') {
      // Export breakdown of all items + transaction list
      const rows: string[][] = [
        ['تقرير حصر منصرف الأصناف والمستندات - مكتب صحة سفلاق'],
        [`الفترة المحددة: من ${startDate} إلى ${endDate}`],
        [`تاريخ استخراج التقرير: ${new Date().toLocaleDateString('ar-EG')}`],
        [],
        ['--- ملخص إجمالي المنصرف حسب الصنف ---'],
        ['م', 'اسم الصنف والمستند', 'التصنيف', 'الرصيد الحالي بالمخزن', 'الكمية المنصرفة خلال الفترة', 'الوحدة', 'عدد حركات الصرف'],
      ];

      ALL_CATEGORIES.forEach((cat, idx) => {
        const item = ITEMS_CONFIG[cat];
        const s = itemStatistics[cat];
        rows.push([
          String(idx + 1),
          item.name,
          item.groupLabel,
          String(s.currentStock),
          String(s.totalDispensed),
          item.unit,
          String(s.transactionCount),
        ]);
      });

      rows.push([]);
      rows.push(['الإجمالي العام للمستندات المنصرفة', '', '', '', String(overallTotalDispensed), 'مستند', String(periodDispenseRecords.length)]);
      rows.push([]);
      rows.push(['--- بيان تفصيلي لعمليات الصرف خلال الفترة ---']);
      rows.push(['م', 'تاريخ الصرف', 'الوقت', 'اسم المستلم / المنصرف له', 'رقم الشهادة / الإيصال', 'الأصناف المصروفة والكميات', 'القائم بالصرف', 'ملاحظات']);

      filteredRecords.forEach(({ record }, idx) => {
        const itemsStr = (record.itemsDeducted || [])
          .map((i) => `${ITEMS_CONFIG[i.stockCategory]?.shortName || i.stockCategory}: ${i.quantity}`)
          .join(' | ');

        rows.push([
          String(idx + 1),
          record.date,
          record.time || '',
          record.beneficiaryName,
          record.certificateNumber || 'غير محدد',
          itemsStr || `كمية: ${record.itemsDeducted?.length || 1}`,
          record.dispensedBy,
          record.notes || '',
        ]);
      });

      exportToCSV(filename, rows);
    } else {
      // Export specific item records
      const meta = ITEMS_CONFIG[selectedItem];
      const rows: string[][] = [
        [`تقرير صرف صنف: ${meta.name} - مكتب صحة سفلاق`],
        [`الفترة: من ${startDate} إلى ${endDate}`],
        [`إجمالي الكمية المصروفة خلال الفترة: ${currentViewStats.totalDispensed} ${meta.unit}`],
        [`الرصيد الحالي بالمخزن: ${currentViewStats.currentStock} ${meta.unit}`],
        [],
        ['م', 'تاريخ الصرف', 'الوقت', 'اسم المستلم / المنصرف له', 'الكمية المنصرفة', 'رقم الشهادة / الإيصال', 'القائم بالصرف', 'الملاحظات'],
      ];

      filteredRecords.forEach(({ record, relevantQty }, idx) => {
        rows.push([
          String(idx + 1),
          record.date,
          record.time || '',
          record.beneficiaryName,
          `${relevantQty} ${meta.unit}`,
          record.certificateNumber || 'غير مسجل',
          record.dispensedBy,
          record.notes || '',
        ]);
      });

      exportToCSV(filename, rows);
    }
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    doc.setFontSize(16);
    doc.text('جمهورية مصر العربية - وزارة الصحة والسكان', 105, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text('مديرية الشؤون الصحية بسوهاج - الإدارة الصحية بساقلتة', 105, 22, { align: 'center' });
    doc.setFontSize(14);
    doc.text('مكتب صحة سفلاق - سجل تقارير صرف الأصناف والمستندات', 105, 30, { align: 'center' });

    doc.setFontSize(10);
    doc.text(`الفترة الزمنية: من ${startDate} إلى ${endDate}`, 105, 37, { align: 'center' });
    doc.text(`تاريخ الطباعة: ${new Date().toLocaleDateString('ar-EG')} - إجمالي المنصرف: ${currentViewStats.totalDispensed} ${currentViewStats.unit}`, 105, 43, { align: 'center' });

    if (selectedItem === 'all') {
      const tableRows = ALL_CATEGORIES.map((cat, idx) => {
        const item = ITEMS_CONFIG[cat];
        const s = itemStatistics[cat];
        return [
          String(idx + 1),
          item.name,
          String(s.currentStock),
          `${s.totalDispensed} ${item.unit}`,
          String(s.transactionCount),
        ];
      });

      autoTable(doc, {
        head: [['م', 'الصنف', 'الرصيد الحالي', 'المنصرف خلال الفترة', 'عدد العمليات']],
        body: tableRows,
        startY: 50,
        styles: { halign: 'center', fontSize: 9 },
        headStyles: { fillColor: [4, 120, 87] },
      });
    } else {
      const meta = ITEMS_CONFIG[selectedItem];
      const tableRows = filteredRecords.map(({ record, relevantQty }, idx) => [
        String(idx + 1),
        record.date,
        record.beneficiaryName,
        `${relevantQty} ${meta.unit}`,
        record.certificateNumber || '-',
        record.dispensedBy,
      ]);

      autoTable(doc, {
        head: [['م', 'التاريخ', 'اسم المستلم', 'الكمية', 'رقم الشهادة', 'القائم بالصرف']],
        body: tableRows,
        startY: 50,
        styles: { halign: 'center', fontSize: 8 },
        headStyles: { fillColor: [4, 120, 87] },
      });
    }

    doc.save(`تقرير_صرف_${selectedItem}_${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-800 text-white flex items-center justify-center shadow-md shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-black text-slate-900">
                  تقارير صرف الأصناف والمستندات
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  مكتب صحة سفلاق
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                تقرير إحصائي ورقمي تفصيلي لمتابعة حركة صرف كل صنف ومستند بدقة مع تحديد تاريخ الفترة المطلوبة
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              id="btn-print-item-report"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-white hover:bg-slate-900 font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير</span>
            </button>

            <button
              id="btn-export-excel-item-report"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white hover:bg-emerald-800 font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel (CSV)</span>
            </button>

            <button
              id="btn-export-pdf-item-report"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-700 text-white hover:bg-red-800 font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تصدير PDF</span>
            </button>
          </div>
        </div>

        {/* Date Period Filter Section */}
        <div className="mt-5 pt-5 border-t border-slate-100">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            {/* Date Inputs */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700 whitespace-nowrap">
                <Calendar className="w-4 h-4 text-emerald-700" />
                <span>تحديد تاريخ الفترة:</span>
              </span>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-semibold whitespace-nowrap">من تاريخ:</label>
                <input
                  id="filter-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600 shadow-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-500 font-semibold whitespace-nowrap">إلى تاريخ:</label>
                <input
                  id="filter-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-800 focus:outline-emerald-600 focus:border-emerald-600 shadow-xs"
                />
              </div>

              <div className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                الفترة: <span className="text-emerald-800 font-black">{daysInPeriod}</span> يوم
              </div>
            </div>

            {/* Quick Period Presets */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-400 font-semibold ml-1">فترات سريعة:</span>
              <button
                type="button"
                onClick={() => handleQuickPreset('today')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition cursor-pointer"
              >
                اليوم
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('yesterday')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition cursor-pointer"
              >
                أمس
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('week')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition cursor-pointer"
              >
                آخر 7 أيام
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('month')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold bg-emerald-50 border-emerald-300 text-emerald-800 transition cursor-pointer"
              >
                الشهر الحالي
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('last_month')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition cursor-pointer"
              >
                الشهر السابق
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('year')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition cursor-pointer"
              >
                العام الحالي
              </button>
              <button
                type="button"
                onClick={() => handleQuickPreset('all')}
                className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-800 transition cursor-pointer"
              >
                الكل
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Item Selector Bar (Tabs / Badges for each item) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-700" />
            <span className="font-black text-slate-800 text-sm">اختر الصنف لعرض تقرير الصرف الخاص به:</span>
          </div>
          <span className="text-xs text-slate-500 font-semibold">
            إجمالي المنصرف خلال الفترة: <strong className="text-emerald-800">{overallTotalDispensed}</strong> مستند
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-2">
          {/* All Items Option */}
          <button
            type="button"
            onClick={() => setSelectedItem('all')}
            className={`p-2.5 rounded-xl border text-right transition flex flex-col justify-between cursor-pointer ${
              selectedItem === 'all'
                ? 'bg-emerald-800 border-emerald-900 text-white shadow-sm'
                : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-emerald-400 hover:bg-white'
            }`}
          >
            <div className="flex items-center justify-between gap-1 mb-1">
              <Layers className="w-4 h-4 shrink-0" />
              <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                selectedItem === 'all' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                شامل
              </span>
            </div>
            <div className="font-black text-xs">كافة الأصناف</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-[11px] opacity-80">منصرف:</span>
              <span className="text-sm font-black">{overallTotalDispensed}</span>
            </div>
          </button>

          {/* 8 Individual Items */}
          {ALL_CATEGORIES.map((cat) => {
            const meta = ITEMS_CONFIG[cat];
            const stats = itemStatistics[cat];
            const Icon = meta.icon;
            const isSelected = selectedItem === cat;

            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedItem(cat)}
                className={`p-2.5 rounded-xl border text-right transition flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-800 border-emerald-900 text-white shadow-sm ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-emerald-400 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-emerald-200' : 'text-slate-500'}`} />
                  <span className={`text-[10px] px-1 py-0.2 rounded font-bold ${
                    isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {meta.groupLabel}
                  </span>
                </div>
                <div className="font-bold text-[11px] leading-tight line-clamp-1" title={meta.name}>
                  {meta.shortName}
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[10px] opacity-80">منصرف:</span>
                  <span className={`text-xs font-black ${stats.totalDispensed > 0 ? (isSelected ? 'text-emerald-100' : 'text-emerald-700') : 'text-slate-400'}`}>
                    {stats.totalDispensed} {meta.unit}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* KPI Highlight Cards for the Selected Item and Period */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Dispensed */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-bold">إجمالي المنصرف خلال الفترة</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
              <TrendingDown className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-emerald-800">
              {currentViewStats.totalDispensed}
            </span>
            <span className="text-xs font-bold text-slate-500">{currentViewStats.unit}</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>الفترة: من {startDate} إلى {endDate}</span>
            <span className="text-emerald-700 font-bold">
              {overallTotalDispensed > 0
                ? `${((currentViewStats.totalDispensed / overallTotalDispensed) * 100).toFixed(0)}% من إجمالي الصرف`
                : '0%'}
            </span>
          </div>
        </div>

        {/* Metric 2: Transaction Count */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-bold">عدد أذون / حركات الصرف</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
              <FileCheck2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-slate-800">
              {filteredRecords.length}
            </span>
            <span className="text-xs font-bold text-slate-500">حركة صرف</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>معدل الصرف اليومي:</span>
            <span className="font-bold text-slate-700">{dailyAverage} {currentViewStats.unit} / يوم</span>
          </div>
        </div>

        {/* Metric 3: Current Stock */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-bold">الرصيد الحالي بالمخزن</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl md:text-3xl font-black text-slate-900">
              {currentViewStats.currentStock}
            </span>
            <span className="text-xs font-bold text-slate-500">{currentViewStats.unit}</span>
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>الحالة المخزنية:</span>
            <span className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>رصيد متوفر بالمكتب</span>
            </span>
          </div>
        </div>

        {/* Metric 4: Active Item Info */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
            <span className="font-bold">الصنف المعروض حالياً</span>
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="font-black text-slate-800 text-sm md:text-base line-clamp-1">
            {currentViewStats.name}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between pt-2 border-t border-slate-100">
            <span>مركز ساقلتة - سوهاج</span>
            <span className="font-bold text-slate-700">مكتب صحة سفلاق</span>
          </div>
        </div>
      </div>

      {/* Comparative Summary Table when 'all' is selected */}
      {selectedItem === 'all' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-700" />
              <h3 className="font-bold text-slate-900 text-sm md:text-base">
                جدول مقارنة توزيع منصرف الأصناف خلال الفترة المحددة ({startDate} إلى {endDate})
              </h3>
            </div>
            <span className="text-xs text-slate-500 font-semibold">
              انقر على أي صنف لعرض سجل عملياته المفصلة
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm border-collapse">
              <thead>
                <tr className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                  <th className="py-3 px-4">م</th>
                  <th className="py-3 px-4">اسم الصنف والمستند</th>
                  <th className="py-3 px-4">التصنيف</th>
                  <th className="py-3 px-4 text-center">الرصيد بالمخزن</th>
                  <th className="py-3 px-4 text-center">المنصرف بالفترة</th>
                  <th className="py-3 px-4 text-center">عدد الحركات</th>
                  <th className="py-3 px-4 text-center">نسبة الاستهلاك</th>
                  <th className="py-3 px-4 text-center no-print">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {ALL_CATEGORIES.map((cat, idx) => {
                  const meta = ITEMS_CONFIG[cat];
                  const s = itemStatistics[cat];
                  const percentage = overallTotalDispensed > 0
                    ? ((s.totalDispensed / overallTotalDispensed) * 100).toFixed(1)
                    : '0';

                  return (
                    <tr
                      key={cat}
                      onClick={() => setSelectedItem(cat)}
                      className="hover:bg-slate-50 transition cursor-pointer group"
                    >
                      <td className="py-3 px-4 font-mono text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-600" />
                        <span>{meta.name}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border ${meta.badgeClass}`}>
                          {meta.groupLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700 font-mono">
                        {s.currentStock} {meta.unit}
                      </td>
                      <td className="py-3 px-4 text-center font-black text-emerald-800 font-mono text-base">
                        {s.totalDispensed} {meta.unit}
                      </td>
                      <td className="py-3 px-4 text-center font-semibold text-slate-600 font-mono">
                        {s.transactionCount}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="bg-emerald-600 h-2 rounded-full"
                              style={{ width: `${Math.min(100, Number(percentage))}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs font-bold text-slate-700">{percentage}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center no-print">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedItem(cat);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 hover:bg-emerald-100 text-xs font-bold transition"
                        >
                          <span>عرض الحركات</span>
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={3} className="py-3.5 px-4">الإجمالي العام لكافة الأصناف</td>
                  <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                    {(Object.values(db.stocks) as StockItem[]).reduce((sum, s) => sum + (s.currentStock || 0), 0)}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono text-emerald-900 text-base">
                    {overallTotalDispensed} مستند
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono">
                    {periodDispenseRecords.length}
                  </td>
                  <td className="py-3.5 px-4 text-center font-mono">100%</td>
                  <td className="py-3.5 px-4 text-center no-print"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Transaction Log Table for the Selected Item & Period */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        {/* Table Header Controls */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-black text-slate-900 text-sm md:text-base">
                سجل عمليات صرف: {currentViewStats.name}
              </h3>
              <p className="text-xs text-slate-500">
                الفترة من {startDate} إلى {endDate} — عدد العمليات: {filteredRecords.length} عملية
              </p>
            </div>
          </div>

          {/* Search Input */}
          <div className="flex items-center gap-2">
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="بحث بالمستلم، رقم الشهادة، الموظف..."
                className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-800 placeholder-slate-400 focus:outline-emerald-600"
              />
            </div>

            {selectedItem !== 'all' && (
              <button
                type="button"
                onClick={() => setSelectedItem('all')}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-600 hover:bg-slate-100 transition whitespace-nowrap cursor-pointer"
              >
                عرض كافة الأصناف
              </button>
            )}
          </div>
        </div>

        {/* Transactions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs md:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">م</th>
                <th className="py-3 px-3">تاريخ ووقت الصرف</th>
                <th className="py-3 px-4">اسم المستلم / المنصرف له</th>
                <th className="py-3 px-3 text-center">
                  {selectedItem === 'all' ? 'الأصناف المنصرفة' : 'الكمية المنصرفة'}
                </th>
                <th className="py-3 px-3">رقم الشهادة / الإيصال</th>
                <th className="py-3 px-3">الموظف القائم بالصرف</th>
                <th className="py-3 px-4">ملاحظات</th>
                <th className="py-3 px-3 text-center no-print">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                    <Info className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm text-slate-600 font-bold">لا توجد عمليات صرف مسجلة لهذا الصنف خلال الفترة المحددة</p>
                    <p className="text-xs text-slate-400 mt-1">
                      جرب تغيير تواريخ الفترة أو تصفية الصنف المختار
                    </p>
                  </td>
                </tr>
              ) : (
                filteredRecords.map(({ record, relevantQty }, idx) => (
                  <tr key={record.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-800">{record.date}</div>
                      {record.time && (
                        <div className="text-[11px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{record.time}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      {record.beneficiaryName}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {selectedItem === 'all' ? (
                        <div className="flex flex-wrap gap-1 justify-center max-w-xs mx-auto">
                          {(record.itemsDeducted || []).map((item, iIdx) => (
                            <span
                              key={iIdx}
                              className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-800 border border-slate-200"
                            >
                              {ITEMS_CONFIG[item.stockCategory]?.shortName || item.stockCategory}: {item.quantity}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-black text-xs md:text-sm font-mono border border-emerald-200">
                          {relevantQty} {ITEMS_CONFIG[selectedItem].unit}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono text-xs">
                      {record.certificateNumber ? (
                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          {record.certificateNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">غير مسجل</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-xs text-slate-600 font-medium">
                      {record.dispensedBy}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate" title={record.notes}>
                      {record.notes || '-'}
                    </td>
                    <td className="py-3 px-3 text-center no-print">
                      <button
                        type="button"
                        onClick={() => onSelectPrintRecord(record)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                        title="طباعة إيصال الصرف الفردي"
                      >
                        <Printer className="w-3 h-3" />
                        <span>إيصال</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredRecords.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={3} className="py-3 px-4">
                    إجمالي المنصرف من {currentViewStats.name} في الجدول:
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-emerald-900 text-base">
                    {filteredRecords.reduce((sum, item) => sum + item.relevantQty, 0)} {currentViewStats.unit}
                  </td>
                  <td colSpan={3} className="py-3 px-4 text-xs text-slate-500">
                    عدد الحركات: {filteredRecords.length} عملية
                  </td>
                  <td className="no-print"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Official Print Sheet (Hidden on screen, rendered on Print) */}
      <div className="hidden print:block font-serif text-black p-4" dir="rtl">
        {/* Egyptian Ministry Official Header */}
        <div className="border-b-2 border-black pb-4 mb-6">
          <div className="flex justify-between items-start text-xs font-bold">
            <div>
              <p>جمهورية مصر العربية</p>
              <p>وزارة الصحة والسكان</p>
              <p>مديرية الشؤون الصحية بسوهاج</p>
              <p>الإدارة الصحية بساقلتة</p>
              <p>مكتب صحة سفلاق</p>
            </div>
            <div className="text-center">
              <h1 className="text-lg font-black underline mb-1">
                تقرير حصر صرف الأصناف والمستندات
              </h1>
              <p className="text-sm font-bold">الصنف: {currentViewStats.name}</p>
              <p className="text-xs">عن الفترة من: {startDate} إلى: {endDate}</p>
            </div>
            <div className="text-left font-mono">
              <p>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
              <p>كود الوحدة: 26-08-04</p>
              <p>رقم السجل: 2026/ص</p>
            </div>
          </div>
        </div>

        {/* Print Summary Statistics */}
        <div className="mb-4 grid grid-cols-3 gap-2 border border-black p-2 text-xs">
          <div>
            <strong>إجمالي المنصرف خلال الفترة:</strong> {currentViewStats.totalDispensed} {currentViewStats.unit}
          </div>
          <div>
            <strong>عدد أذون وعمليات الصرف:</strong> {filteredRecords.length} عملية
          </div>
          <div>
            <strong>الرصيد المتبقي بالمخزن:</strong> {currentViewStats.currentStock} {currentViewStats.unit}
          </div>
        </div>

        {/* Official Signatures */}
        <div className="mt-12 pt-6 border-t border-black grid grid-cols-4 gap-4 text-center text-xs font-bold">
          <div>
            <p>كاتب الصحة القائم بالصرف</p>
            <p className="mt-8">..................................</p>
          </div>
          <div>
            <p>مراقب أول الصحة</p>
            <p className="mt-8">..................................</p>
          </div>
          <div>
            <p>مدير مكتب صحة سفلاق</p>
            <p className="mt-8">..................................</p>
          </div>
          <div>
            <p>خاتم شعار الجمهورية (ختم النسر)</p>
            <div className="mt-2 w-16 h-16 border border-dashed border-black mx-auto rounded-full flex items-center justify-center text-[10px]">
              موضع الختم
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

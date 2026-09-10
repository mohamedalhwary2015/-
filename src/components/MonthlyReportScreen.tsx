import React, { useState, useMemo } from 'react';
import { AppDatabase, DispenseRecord, StockCategory, StockItem } from '../types';
import { exportToCSV } from '../storage/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  normalizeGender,
  isActualBirthRegistration,
  isDeathRegistration,
  getDispensedHealthCards,
  getDispenseTypeDisplay,
  isPureHealthCardDispense,
} from '../services/reportService';
import {
  Calendar,
  Download,
  Printer,
  FileSpreadsheet,
  Baby,
  Skull,
  CreditCard,
  Package,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  Building2,
  FileText,
  Clock,
  Search,
  Layers,
  ArrowRightLeft,
  Info,
  DollarSign
} from 'lucide-react';

interface MonthlyReportScreenProps {
  db: AppDatabase;
  onSelectPrintRecord: (record: DispenseRecord) => void;
}

const MONTH_NAMES_AR = [
  'يناير',
  'فبراير',
  'مارس',
  'أبريل',
  'مايو',
  'يونيو',
  'يوليو',
  'أغسطس',
  'سبتمبر',
  'أكتوبر',
  'نوفمبر',
  'ديسمبر',
];

const ALL_CATEGORIES: { id: StockCategory; name: string; group: string; unit: string }[] = [
  { id: 'birth_certificates', name: 'دفاتر شهادات الميلاد الورقية', group: 'مواليد', unit: 'شهادة' },
  { id: 'birth_notifications', name: 'دفاتر بلاغات الميلاد (إخطارات الولادة)', group: 'مواليد', unit: 'بلاغ' },
  { id: 'health_cards_male', name: 'البطاقات الصحية (ذكور - زرقاء)', group: 'بطاقات صحية', unit: 'بطاقة' },
  { id: 'health_cards_female', name: 'البطاقات الصحية (إناث - وردية)', group: 'بطاقات صحية', unit: 'بطاقة' },
  { id: 'death_certificates', name: 'دفاتر شهادات الوفاة الورقية', group: 'وفيات', unit: 'شهادة' },
  { id: 'death_notifications', name: 'دفاتر بلاغات الوفاة (إخطارات الوفاة)', group: 'وفيات', unit: 'بلاغ' },
  { id: 'late_reg_under_year', name: 'استمارات ساقط قيد (أقل من عام)', group: 'ساقط قيد', unit: 'استمارة' },
  { id: 'late_reg_over_year', name: 'استمارات ساقط قيد (أكبر من عام)', group: 'ساقط قيد', unit: 'استمارة' },
];

export const MonthlyReportScreen: React.FC<MonthlyReportScreenProps> = ({
  db,
  onSelectPrintRecord,
}) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonthIdx = currentDate.getMonth(); // 0-indexed

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(currentMonthIdx);
  const [activeSubTab, setActiveSubTab] = useState<'all' | 'births' | 'deaths' | 'cards' | 'stock'>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Format month string: YYYY-MM
  const monthStr = useMemo(() => {
    const mm = String(selectedMonthIdx + 1).padStart(2, '0');
    return `${selectedYear}-${mm}`;
  }, [selectedYear, selectedMonthIdx]);

  const monthNameAr = MONTH_NAMES_AR[selectedMonthIdx];

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonthIdx === 0) {
      setSelectedMonthIdx(11);
      setSelectedYear(prev => prev - 1);
    } else {
      setSelectedMonthIdx(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonthIdx === 11) {
      setSelectedMonthIdx(0);
      setSelectedYear(prev => prev + 1);
    } else {
      setSelectedMonthIdx(prev => prev + 1);
    }
  };

  const handleCurrentMonth = () => {
    setSelectedYear(currentYear);
    setSelectedMonthIdx(currentMonthIdx);
  };

  // Dispense records for this month
  const monthDispenses = useMemo(() => {
    return db.dispenseRecords.filter((r) => r.date.startsWith(monthStr));
  }, [db.dispenseRecords, monthStr]);

  // Supply transactions for this month
  const monthSupplies = useMemo(() => {
    return db.supplyTransactions.filter((s) => s.date.startsWith(monthStr));
  }, [db.supplyTransactions, monthStr]);

  // 1. BIRTHS CALCULATIONS (إجمالي المواليد الفعلية فقط - لا تحتسب البطاقات الصحية المنفردة كمواليد)
  const birthsData = useMemo(() => {
    const birthRecords = monthDispenses.filter((r) => isActualBirthRegistration(r));

    const males = birthRecords.filter((r) => {
      const g = normalizeGender(r.gender);
      if (g === 'male') return true;
      if (g === 'unknown' && r.dispenseType === 'birth_male') return true;
      return false;
    });

    const females = birthRecords.filter((r) => {
      const g = normalizeGender(r.gender);
      if (g === 'female') return true;
      if (g === 'unknown' && r.dispenseType === 'birth_female') return true;
      return false;
    });

    const unspecified = birthRecords.filter(
      (r) => !males.includes(r) && !females.includes(r)
    );

    return {
      records: birthRecords,
      total: birthRecords.length,
      malesCount: males.length,
      femalesCount: females.length,
      unspecifiedCount: unspecified.length,
      malesPercent: birthRecords.length > 0 ? ((males.length / birthRecords.length) * 100).toFixed(1) : '0',
      femalesPercent: birthRecords.length > 0 ? ((females.length / birthRecords.length) * 100).toFixed(1) : '0',
    };
  }, [monthDispenses]);

  // 2. DEATHS CALCULATIONS (إجمالي الوفيات، ذكور، إناث بتطبيع دقيق للنوع)
  const deathsData = useMemo(() => {
    const deathRecords = monthDispenses.filter((r) => isDeathRegistration(r));

    const males = deathRecords.filter((r) => {
      const g = normalizeGender(r.gender);
      return g === 'male';
    });

    const females = deathRecords.filter((r) => {
      const g = normalizeGender(r.gender);
      return g === 'female';
    });

    const unspecified = deathRecords.filter(
      (r) => !males.includes(r) && !females.includes(r)
    );

    return {
      records: deathRecords,
      total: deathRecords.length,
      malesCount: males.length,
      femalesCount: females.length,
      unspecifiedCount: unspecified.length,
      malesPercent: deathRecords.length > 0 ? ((males.length / deathRecords.length) * 100).toFixed(1) : '0',
      femalesPercent: deathRecords.length > 0 ? ((females.length / deathRecords.length) * 100).toFixed(1) : '0',
    };
  }, [monthDispenses]);

  // 3. HEALTH CARDS DISPENSED (منصرف بطاقات صحية ذكور وإناث بدقة)
  const healthCardsData = useMemo(() => {
    let maleCards = 0;
    let femaleCards = 0;

    monthDispenses.forEach((r) => {
      const cardCounts = getDispensedHealthCards(r);
      maleCards += cardCounts.male;
      femaleCards += cardCounts.female;
    });

    return {
      maleCards,
      femaleCards,
      totalCards: maleCards + femaleCards,
    };
  }, [monthDispenses]);

  // 3.1 FINANCIAL DATA (المبالغ المحصلة والمورّدة للخزينة)
  const financialData = useMemo(() => {
    let totalAmount = 0;
    let paidCount = 0;
    monthDispenses.forEach((r) => {
      if (r.paymentAmount !== undefined && r.paymentAmount !== null && !isNaN(Number(r.paymentAmount))) {
        totalAmount += Number(r.paymentAmount);
        paidCount += 1;
      }
    });
    return {
      totalAmount,
      paidCount,
    };
  }, [monthDispenses]);

  // 4. REMAINING STOCK FOR EACH CATEGORY (الرصيد المتبقي لكل فئة)
  const stockCategoriesData = useMemo(() => {
    return ALL_CATEGORIES.map((catInfo) => {
      const cat = catInfo.id;
      const stockObj = db.stocks[cat];
      const currentStock = stockObj?.currentStock ?? 0;
      const minThreshold = stockObj?.minThreshold ?? 10;

      // Calculate dispensed this month for this category
      let dispensedThisMonth = 0;
      monthDispenses.forEach((r) => {
        if (r.itemsDeducted && Array.isArray(r.itemsDeducted)) {
          const item = r.itemsDeducted.find((i) => i.stockCategory === cat);
          if (item) dispensedThisMonth += item.quantity;
        } else {
          // Fallback legacy
          if (
            (cat === 'birth_certificates' || cat === 'birth_notifications') &&
            (r.dispenseType === 'birth_male' || r.dispenseType === 'birth_female')
          ) {
            dispensedThisMonth += 1;
          } else if (cat === 'health_cards_male' && r.dispenseType === 'birth_male') {
            dispensedThisMonth += 1;
          } else if (cat === 'health_cards_female' && r.dispenseType === 'birth_female') {
            dispensedThisMonth += 1;
          } else if (
            (cat === 'death_certificates' || cat === 'death_notifications') &&
            r.dispenseType === 'death'
          ) {
            dispensedThisMonth += 1;
          }
        }
      });

      // Calculate supply received this month for this category
      const receivedThisMonth = monthSupplies
        .filter((s) => s.stockCategory === cat)
        .reduce((sum, s) => sum + s.quantity, 0);

      // Accurate starting stock for the month
      const startingStock = currentStock + dispensedThisMonth - receivedThisMonth;

      const isLowStock = currentStock <= minThreshold;

      return {
        ...catInfo,
        startingStock,
        receivedThisMonth,
        dispensedThisMonth,
        currentStock, // الرصيد المتبقي الحالي
        minThreshold,
        isLowStock,
      };
    });
  }, [db.stocks, monthDispenses, monthSupplies]);

  // Filter records in the bottom table by active sub-tab and search
  const displayedRecords = useMemo(() => {
    let list = monthDispenses;

    if (activeSubTab === 'births') {
      list = birthsData.records;
    } else if (activeSubTab === 'deaths') {
      list = deathsData.records;
    } else if (activeSubTab === 'cards') {
      list = monthDispenses.filter((r) => getDispensedHealthCards(r).total > 0);
    }

    if (!searchTerm.trim()) return list;
    const q = searchTerm.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.beneficiaryName.toLowerCase().includes(q) ||
        (r.certificateNumber || '').toLowerCase().includes(q) ||
        (r.dispensedBy || '').toLowerCase().includes(q) ||
        (r.notes || '').toLowerCase().includes(q)
    );
  }, [monthDispenses, activeSubTab, birthsData.records, deathsData.records, searchTerm]);

  // Export to Excel / CSV
  const handleExportCSV = () => {
    const filename = `التقرير_الشهري_مكتب_صحة_سفلاق_${monthNameAr}_${selectedYear}.csv`;

    const rows: string[][] = [
      ['جمهورية مصر العربية - وزارة الصحة والسكان'],
      ['مديرية الشؤون الصحية بسوهاج - الإدارة الصحية بساقلتة'],
      [`مكتب صحة سفلاق - التقرير الإحصائي الشهري عن شهر ${monthNameAr} ${selectedYear}`],
      [`تاريخ استخراج التقرير: ${new Date().toLocaleDateString('ar-EG')}`],
      [],
      ['=================================================================='],
      ['أولاً: إحصائية المواليد لهذا الشهر'],
      ['البيان', 'العدد', 'النسبة المئوية'],
      ['عدد المواليد ذكور', String(birthsData.malesCount), `${birthsData.malesPercent}%`],
      ['عدد المواليد إناث', String(birthsData.femalesCount), `${birthsData.femalesPercent}%`],
      ['إجمالي عدد المواليد لهذا الشهر', String(birthsData.total), '100%'],
      [],
      ['ثانياً: إحصائية الوفيات لهذا الشهر'],
      ['البيان', 'العدد', 'النسبة المئوية'],
      ['عدد الوفيات ذكور', String(deathsData.malesCount), `${deathsData.malesPercent}%`],
      ['عدد الوفيات إناث', String(deathsData.femalesCount), `${deathsData.femalesPercent}%`],
      ['إجمالي عدد الوفيات لهذا الشهر', String(deathsData.total), '100%'],
      [],
      ['ثالثاً: حركة البطاقات الصحية المنصرفة'],
      ['البيان', 'العدد المصروف'],
      ['بطاقات صحية ذكور (زرقاء)', String(healthCardsData.maleCards)],
      ['بطاقات صحية إناث (وردية)', String(healthCardsData.femaleCards)],
      ['إجمالي البطاقات الصحية المنصرفة', String(healthCardsData.totalCards)],
      [],
      ['رابعاً: الرصيد المخزني المتبقي لكافة الفئات والمستندات'],
      ['م', 'اسم الفئة / الصنف', 'التصنيف', 'رصيد أول الشهر', 'الوارد خلال الشهر', 'المنصرف خلال الشهر', 'الرصيد المتبقي بالمكتب', 'الوحدة', 'حد التنبيه'],
    ];

    stockCategoriesData.forEach((s, idx) => {
      rows.push([
        String(idx + 1),
        s.name,
        s.group,
        String(s.startingStock),
        String(s.receivedThisMonth),
        String(s.dispensedThisMonth),
        String(s.currentStock),
        s.unit,
        String(s.minThreshold),
      ]);
    });

    rows.push([]);
    rows.push(['--- سجل المعاملات والشهادات الصادرة خلال الشهر ---']);
    rows.push(['م', 'التاريخ', 'اسم المستلم / المنصرف له', 'النوع', 'رقم الشهادة', 'الموظف الصارف', 'الملاحظات']);

    monthDispenses.forEach((r, idx) => {
      rows.push([
        String(idx + 1),
        r.date,
        r.beneficiaryName,
        r.gender === 'male' ? 'ذكر' : r.gender === 'female' ? 'أنثى' : 'غير محدد',
        r.certificateNumber || 'غير مسجل',
        r.dispensedBy,
        r.notes || '',
      ]);
    });

    exportToCSV(filename, rows);
  };

  // Export to PDF
  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    doc.setFontSize(16);
    doc.text('جمهورية مصر العربية - وزارة الصحة والسكان', 105, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text('مديرية الشؤون الصحية بسوهاج - الإدارة الصحية بساقلتة', 105, 22, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`مكتب صحة سفلاق - التقرير الشهري عن: ${monthNameAr} ${selectedYear}`, 105, 30, { align: 'center' });

    // Section 1: Vital Stats Table
    const vitalRows = [
      ['إجمالي المواليد لهذا الشهر', String(birthsData.total), 'إجمالي الوفيات لهذا الشهر', String(deathsData.total)],
      ['المواليد ذكور', String(birthsData.malesCount), 'الوفيات ذكور', String(deathsData.malesCount)],
      ['المواليد إناث', String(birthsData.femalesCount), 'الوفيات إناث', String(deathsData.femalesCount)],
      ['بطاقات صحية ذكور', String(healthCardsData.maleCards), 'بطاقات صحية إناث', String(healthCardsData.femaleCards)],
      ['إجمالي البطاقات المنصرفة', String(healthCardsData.totalCards), 'تاريخ الحصر', new Date().toLocaleDateString('ar-EG')],
    ];

    autoTable(doc, {
      head: [['بيان المواليد والبطاقات', 'العدد', 'بيان الوفيات والمؤشرات', 'العدد']],
      body: vitalRows,
      startY: 38,
      styles: { halign: 'center', fontSize: 9 },
      headStyles: { fillColor: [4, 120, 87] },
    });

    // Section 2: Remaining Stock Table
    const stockRows = stockCategoriesData.map((s, idx) => [
      String(idx + 1),
      s.name,
      String(s.startingStock),
      String(s.receivedThisMonth),
      String(s.dispensedThisMonth),
      `${s.currentStock} ${s.unit}`,
    ]);

    const finalY = (doc as any).lastAutoTable?.finalY || 100;

    doc.setFontSize(12);
    doc.text('جدول الأرصدة المتبقية والمصروفة لكافة الفئات:', 105, finalY + 10, { align: 'center' });

    autoTable(doc, {
      head: [['م', 'اسم الفئة / الصنف', 'أول الشهر', 'الوارد', 'المنصرف', 'الرصيد المتبقي']],
      body: stockRows,
      startY: finalY + 14,
      styles: { halign: 'center', fontSize: 8 },
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`التقرير_الشهري_مكتب_صحة_سفلاق_${monthNameAr}_${selectedYear}.pdf`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header Card with Month Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-900 text-white flex items-center justify-center shadow-md shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl md:text-2xl font-black text-slate-900">
                  التقرير الإحصائي الشهري لمكتب الصحة
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold">
                  مكتب صحة سفلاق
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1">
                حصر شامل لحركة المواليد (ذكور وإناث)، والوفيات (ذكور وإناث)، والبطاقات الصحية، والرصيد المتبقي لكل فئة
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              id="btn-print-monthly-report"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة التقرير الشهري</span>
            </button>

            <button
              id="btn-export-csv-monthly-report"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>تصدير Excel (CSV)</span>
            </button>

            <button
              id="btn-export-pdf-monthly-report"
              onClick={handleExportPDF}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تصدير PDF</span>
            </button>
          </div>
        </div>

        {/* Month Selector Navigation Bar */}
        <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition cursor-pointer text-slate-700"
              title="الشهر السابق"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Month Dropdown */}
            <select
              id="select-month"
              value={selectedMonthIdx}
              onChange={(e) => setSelectedMonthIdx(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm text-slate-800 focus:outline-emerald-600 shadow-xs cursor-pointer"
            >
              {MONTH_NAMES_AR.map((mName, idx) => (
                <option key={idx} value={idx}>
                  {mName}
                </option>
              ))}
            </select>

            {/* Year Dropdown */}
            <select
              id="select-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-sm text-slate-800 focus:outline-emerald-600 shadow-xs cursor-pointer font-mono"
            >
              {[2024, 2025, 2026, 2027, 2028].map((yr) => (
                <option key={yr} value={yr}>
                  {yr}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 transition cursor-pointer text-slate-700"
              title="الشهر التالي"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={handleCurrentMonth}
              className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold hover:bg-emerald-100 transition cursor-pointer mr-1"
            >
              الشهر الحالي
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-semibold">
              بيانات التقرير المعروضة عن:
            </span>
            <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-800 font-black text-sm border border-slate-200">
              شهر {monthNameAr} {selectedYear}
            </span>
            <span className="text-xs text-slate-400">
              ({monthDispenses.length} معاملة مسجلة بالشهر)
            </span>
          </div>
        </div>
      </div>

      {/* CORE HIGHLIGHTS GRID: MOTHERS, BIRTHS, DEATHS, HEALTH CARDS, FINANCIALS */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* CARD 1: المواليد لهذا الشهر (إجمالي + ذكور + إناث) */}
        <div className="bg-white rounded-2xl border border-blue-200 p-5 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-blue-600" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold">
                <Baby className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-base">إحصائية المواليد لهذا الشهر</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold font-mono">
              {monthNameAr} {selectedYear}
            </span>
          </div>

          {/* Grand Total Births */}
          <div className="bg-blue-50/60 rounded-xl p-3.5 border border-blue-100 mb-4 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-blue-900">عدد إجمالي المواليد لهذا الشهر:</span>
              <span className="text-xs text-blue-700">شامل المواليد المقيدين بالدفاتر الرسمية</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-blue-900 font-mono">
                {birthsData.total}
              </span>
              <span className="text-xs font-bold text-blue-800">مولود</span>
            </div>
          </div>

          {/* Gender Breakdown (Males vs Females) */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Males */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <span>عدد الميلاد ذكور:</span>
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {birthsData.malesCount}
                </span>
                <span className="text-xs font-bold text-blue-700 font-mono">
                  {birthsData.malesPercent}%
                </span>
              </div>
            </div>

            {/* Females */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-pink-500" />
                <span>عدد الميلاد إناث:</span>
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {birthsData.femalesCount}
                </span>
                <span className="text-xs font-bold text-pink-600 font-mono">
                  {birthsData.femalesPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-600 h-full transition-all"
                style={{ width: `${birthsData.malesPercent}%` }}
                title={`ذكور: ${birthsData.malesCount}`}
              />
              <div
                className="bg-pink-500 h-full transition-all"
                style={{ width: `${birthsData.femalesPercent}%` }}
                title={`إناث: ${birthsData.femalesCount}`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-0.5">
              <span>ذكور: {birthsData.malesCount}</span>
              <span>إناث: {birthsData.femalesCount}</span>
            </div>
          </div>
        </div>

        {/* CARD 2: الوفيات لهذا الشهر (إجمالي + ذكور + إناث) */}
        <div className="bg-white rounded-2xl border border-slate-300 p-5 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-slate-700" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
                <Skull className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-base">إحصائية الوفيات لهذا الشهر</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-800 text-xs font-bold font-mono">
              {monthNameAr} {selectedYear}
            </span>
          </div>

          {/* Grand Total Deaths */}
          <div className="bg-slate-100/70 rounded-xl p-3.5 border border-slate-200 mb-4 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-slate-900">عدد إجمالي الوفيات لهذا الشهر:</span>
              <span className="text-xs text-slate-600">شامل تصاريح الدفن وبلاغات الوفاة</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-slate-900 font-mono">
                {deathsData.total}
              </span>
              <span className="text-xs font-bold text-slate-700">حالة وفاة</span>
            </div>
          </div>

          {/* Gender Breakdown (Males vs Females) */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Males */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-700" />
                <span>عدد الوفيات ذكور:</span>
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {deathsData.malesCount}
                </span>
                <span className="text-xs font-bold text-slate-700 font-mono">
                  {deathsData.malesPercent}%
                </span>
              </div>
            </div>

            {/* Females */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-stone-500" />
                <span>عدد الوفيات إناث:</span>
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {deathsData.femalesCount}
                </span>
                <span className="text-xs font-bold text-slate-700 font-mono">
                  {deathsData.femalesPercent}%
                </span>
              </div>
            </div>
          </div>

          {/* Visual Ratio Bar */}
          <div className="space-y-1">
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden flex">
              <div
                className="bg-slate-700 h-full transition-all"
                style={{ width: `${deathsData.malesPercent}%` }}
                title={`ذكور: ${deathsData.malesCount}`}
              />
              <div
                className="bg-stone-500 h-full transition-all"
                style={{ width: `${deathsData.femalesPercent}%` }}
                title={`إناث: ${deathsData.femalesCount}`}
              />
            </div>
            <div className="flex justify-between text-[10px] text-slate-400 font-semibold px-0.5">
              <span>ذكور: {deathsData.malesCount}</span>
              <span>إناث: {deathsData.femalesCount}</span>
            </div>
          </div>
        </div>

        {/* CARD 3: البطاقات الصحية (ذكور + إناث + إجمالي) */}
        <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-indigo-600" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold">
                <CreditCard className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-base">البطاقات الصحية المنصرفة</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold font-mono">
              {monthNameAr} {selectedYear}
            </span>
          </div>

          {/* Grand Total Health Cards */}
          <div className="bg-indigo-50/60 rounded-xl p-3.5 border border-indigo-100 mb-4 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-indigo-900">إجمالي البطاقات الصحية المنصرفة:</span>
              <span className="text-xs text-indigo-700">بطاقات رعاية الأمومة والطفولة والتطعيمات</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-indigo-900 font-mono">
                {healthCardsData.totalCards}
              </span>
              <span className="text-xs font-bold text-indigo-800">بطاقة</span>
            </div>
          </div>

          {/* Cards Breakdown: Male vs Female Cards */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {/* Male Cards */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span>بطاقات صحية ذكور:</span>
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-indigo-950 font-mono">
                  {healthCardsData.maleCards}
                </span>
                <span className="text-xs font-bold text-indigo-700">زرقاء</span>
              </div>
            </div>

            {/* Female Cards */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-pink-500" />
                <span>بطاقات صحية إناث:</span>
              </span>
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-black text-pink-950 font-mono">
                  {healthCardsData.femaleCards}
                </span>
                <span className="text-xs font-bold text-pink-600">وردية</span>
              </div>
            </div>
          </div>

          {/* Match Indicator */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between text-slate-600">
            <span>تطابق البطاقات مع المواليد:</span>
            <span className="font-bold text-emerald-800 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>
                {healthCardsData.totalCards === birthsData.total
                  ? 'متطابق تماماً (100%)'
                  : `${healthCardsData.totalCards} من ${birthsData.total} مولود`}
              </span>
            </span>
          </div>
        </div>

        {/* CARD 4: المبالغ المحصلة / المورّدة */}
        <div className="bg-white rounded-2xl border border-emerald-200 p-5 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-emerald-600" />
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold">
                <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="font-black text-slate-900 text-base">المبالغ المحصلة والمورّدة</h3>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold font-mono">
              {monthNameAr} {selectedYear}
            </span>
          </div>

          {/* Grand Total Collected */}
          <div className="bg-emerald-50/60 rounded-xl p-3.5 border border-emerald-100 mb-4 flex items-center justify-between">
            <div>
              <span className="block text-xs font-bold text-emerald-900">إجمالي المبالغ المورّدة للخزينة:</span>
              <span className="text-xs text-emerald-700">رسوم بطاقات صحية ومستندات</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-emerald-900 font-mono">
                {financialData.totalAmount}
              </span>
              <span className="text-xs font-bold text-emerald-800">ج.م</span>
            </div>
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5">عدد العمليات المحصلة:</span>
              <span className="text-xl font-black text-slate-900 font-mono">
                {financialData.paidCount}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <span className="block text-[11px] font-bold text-slate-600 mb-0.5">متوسط العملية:</span>
              <span className="text-xl font-black text-slate-900 font-mono">
                {financialData.paidCount > 0 ? Math.round(financialData.totalAmount / financialData.paidCount) : 0} ج.م
              </span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200 text-xs flex items-center justify-between text-emerald-900 font-bold">
            <span>توريدات قسائم 33 ع.ح:</span>
            <span>{financialData.paidCount > 0 ? 'مسجلة وموثقة' : 'لا توجد توريدات'}</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: REMAINING STOCK FOR EACH CATEGORY TABLE (الرصيد المتبقي لكل فئة) */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 md:p-5 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-emerald-800" />
            <div>
              <h3 className="font-black text-slate-900 text-base md:text-lg">
                جدول حركة الأرصدة المخزنية والرصيد المتبقي لكل فئة
              </h3>
              <p className="text-xs text-slate-500">
                بيان رصيد أول الشهر، الوارد، المنصرف، والرصيد المتبقي الفعلي بالمكتب بنهاية شهر {monthNameAr} {selectedYear}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-200">
              إجمالي الأصناف: 8 فئات رسمية
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs md:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">م</th>
                <th className="py-3 px-4">اسم الفئة / الصنف والمستند</th>
                <th className="py-3 px-3">التصنيف</th>
                <th className="py-3 px-3 text-center">رصيد أول الشهر</th>
                <th className="py-3 px-3 text-center">الوارد بالشهر</th>
                <th className="py-3 px-3 text-center text-red-700">المنصرف بالشهر</th>
                <th className="py-3 px-4 text-center bg-emerald-50 text-emerald-900">
                  الرصيد المتبقي الحالي
                </th>
                <th className="py-3 px-3 text-center">حد التنبيه</th>
                <th className="py-3 px-3 text-center">حالة الرصيد</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {stockCategoriesData.map((cat, idx) => (
                <tr key={cat.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                  <td className="py-3.5 px-4 font-bold text-slate-900">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${cat.isLowStock ? 'bg-amber-500' : 'bg-emerald-600'}`} />
                      <span>{cat.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-3">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {cat.group}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-600">
                    {cat.startingStock} {cat.unit}
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono font-bold text-blue-700">
                    {cat.receivedThisMonth > 0 ? `+${cat.receivedThisMonth}` : '0'}
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono font-black text-red-700">
                    {cat.dispensedThisMonth > 0 ? `-${cat.dispensedThisMonth}` : '0'}
                  </td>
                  <td className="py-3.5 px-4 text-center bg-emerald-50/60">
                    <span className={`inline-block px-3 py-1 rounded-xl font-mono font-black text-sm md:text-base ${
                      cat.isLowStock
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-950 border border-emerald-300'
                    }`}>
                      {cat.currentStock} {cat.unit}
                    </span>
                  </td>
                  <td className="py-3.5 px-3 text-center font-mono text-slate-500">
                    {cat.minThreshold}
                  </td>
                  <td className="py-3.5 px-3 text-center">
                    {cat.isLowStock ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <AlertTriangle className="w-3 h-3" />
                        <span>رصيد منخفض</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>رصيد آمن</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-black text-slate-900 border-t-2 border-slate-300">
                <td colSpan={3} className="py-3.5 px-4">إجمالي كافة المستندات والبطاقات</td>
                <td className="py-3.5 px-3 text-center font-mono text-slate-600">
                  {stockCategoriesData.reduce((acc, c) => acc + c.startingStock, 0)}
                </td>
                <td className="py-3.5 px-3 text-center font-mono text-blue-800">
                  +{stockCategoriesData.reduce((acc, c) => acc + c.receivedThisMonth, 0)}
                </td>
                <td className="py-3.5 px-3 text-center font-mono text-red-800">
                  -{stockCategoriesData.reduce((acc, c) => acc + c.dispensedThisMonth, 0)}
                </td>
                <td className="py-3.5 px-4 text-center bg-emerald-100/70 font-mono text-emerald-950 text-base">
                  {stockCategoriesData.reduce((acc, c) => acc + c.currentStock, 0)} مستند
                </td>
                <td colSpan={2} className="py-3.5 px-3 text-center text-xs text-slate-500">
                  الرصيد الفعلي بمكتب صحة سفلاق
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* SECTION 3: DETAILED RECORD LOG OF THIS MONTH */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-slate-900 text-sm">عرض تفاصيل المعاملات:</span>
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setActiveSubTab('all')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  activeSubTab === 'all' ? 'bg-emerald-800 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الكل ({monthDispenses.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('births')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  activeSubTab === 'births' ? 'bg-blue-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                المواليد ({birthsData.total})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('deaths')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  activeSubTab === 'deaths' ? 'bg-slate-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                الوفيات ({deathsData.total})
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('cards')}
                className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                  activeSubTab === 'cards' ? 'bg-indigo-700 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                البطاقات الصحية ({healthCardsData.totalCards})
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="بحث بالاسم أو رقم الشهادة..."
              className="w-full pr-9 pl-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white text-slate-800 focus:outline-emerald-600"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs md:text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/70 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3">م</th>
                <th className="py-3 px-3">التاريخ والوقت</th>
                <th className="py-3 px-4">اسم المستلم / المنصرف له</th>
                <th className="py-3 px-3">النوع</th>
                <th className="py-3 px-3">نوع المعاملة</th>
                <th className="py-3 px-3">المستندات المصروفة</th>
                <th className="py-3 px-3">رقم الشهادة / الإيصال</th>
                <th className="py-3 px-3 font-mono">المبلغ المورّد</th>
                <th className="py-3 px-3">الموظف الصارف</th>
                <th className="py-3 px-4">ملاحظات</th>
                <th className="py-3 px-3 text-center no-print">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {displayedRecords.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-slate-400">
                    <Info className="w-7 h-7 mx-auto text-slate-300 mb-1" />
                    <p className="font-bold text-slate-600">لا توجد معاملات مسجلة في هذا التصنيف لشهر {monthNameAr} {selectedYear}</p>
                  </td>
                </tr>
              ) : (
                displayedRecords.map((r, idx) => {
                  const typeInfo = getDispenseTypeDisplay(r);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-3 font-mono text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="font-bold text-slate-800">{r.date}</span>
                        {r.time && <span className="text-[11px] text-slate-400 block">{r.time}</span>}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 whitespace-nowrap">
                        {r.beneficiaryName}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {normalizeGender(r.gender) === 'male' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-900 border border-blue-200">
                            ذكر
                          </span>
                        ) : normalizeGender(r.gender) === 'female' ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-pink-100 text-pink-900 border border-pink-200">
                            أنثى
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold border ${typeInfo.badgeClass}`}>
                          {r.dispenseEventType || typeInfo.label}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {(r.itemsDeducted || []).map((it, iIdx) => (
                            <span
                              key={iIdx}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200 whitespace-nowrap"
                            >
                              {db.stocks[it.stockCategory]?.name || it.stockCategory}: {it.quantity}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs font-bold text-slate-700 whitespace-nowrap">
                        <div>{r.certificateNumber || '-'}</div>
                        {r.healthCardReceiptNumber && (
                          <div className="text-[10px] text-blue-700 font-mono">إيصال: {r.healthCardReceiptNumber}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                        {r.paymentAmount !== undefined && r.paymentAmount !== null ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-mono font-bold">
                            {r.paymentAmount} ج.م
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-600 whitespace-nowrap">
                        {r.dispensedBy}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate" title={r.notes}>
                        {r.notes || '-'}
                      </td>
                      <td className="py-3 px-3 text-center no-print whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onSelectPrintRecord(r)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                          title="طباعة إيصال الصرف"
                        >
                          <Printer className="w-3 h-3" />
                          <span>إيصال</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OFFICIAL PRINT SHEET (Hidden on screen, shown on print) */}
      <div className="hidden print:block font-serif text-black p-4" dir="rtl">
        {/* Header */}
        <div className="border-b-2 border-black pb-4 mb-5">
          <div className="flex justify-between items-start text-xs font-bold">
            <div>
              <p>جمهورية مصر العربية</p>
              <p>وزارة الصحة والسكان</p>
              <p>مديرية الشؤون الصحية بسوهاج</p>
              <p>الإدارة الصحية بساقلتة</p>
              <p>مكتب صحة سفلاق</p>
            </div>
            <div className="text-center">
              <h1 className="text-xl font-black underline mb-1">
                التقرير الإحصائي الشهري للمواليد والوفيات والأرصدة
              </h1>
              <p className="text-sm font-bold">عن شهر: {monthNameAr} {selectedYear}</p>
            </div>
            <div className="text-left font-mono">
              <p>كود الوحدة: 26-08-04</p>
              <p>تاريخ الاستخراج: {new Date().toLocaleDateString('ar-EG')}</p>
            </div>
          </div>
        </div>

        {/* Vital Stats Table */}
        <table className="w-full border-collapse border border-black text-xs text-center mb-6">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-black p-2 font-black" colSpan={3}>إحصائية المواليد لهذا الشهر</th>
              <th className="border border-black p-2 font-black" colSpan={3}>إحصائية الوفيات لهذا الشهر</th>
              <th className="border border-black p-2 font-black" colSpan={3}>البطاقات الصحية المنصرفة</th>
            </tr>
            <tr className="bg-gray-100 font-bold">
              <th className="border border-black p-1">ذكور</th>
              <th className="border border-black p-1">إناث</th>
              <th className="border border-black p-1 font-black">الإجمالي</th>
              <th className="border border-black p-1">ذكور</th>
              <th className="border border-black p-1">إناث</th>
              <th className="border border-black p-1 font-black">الإجمالي</th>
              <th className="border border-black p-1">ذكور</th>
              <th className="border border-black p-1">إناث</th>
              <th className="border border-black p-1 font-black">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-bold text-sm">
              <td className="border border-black p-2">{birthsData.malesCount}</td>
              <td className="border border-black p-2">{birthsData.femalesCount}</td>
              <td className="border border-black p-2 font-black bg-gray-50">{birthsData.total}</td>
              <td className="border border-black p-2">{deathsData.malesCount}</td>
              <td className="border border-black p-2">{deathsData.femalesCount}</td>
              <td className="border border-black p-2 font-black bg-gray-50">{deathsData.total}</td>
              <td className="border border-black p-2">{healthCardsData.maleCards}</td>
              <td className="border border-black p-2">{healthCardsData.femaleCards}</td>
              <td className="border border-black p-2 font-black bg-gray-50">{healthCardsData.totalCards}</td>
            </tr>
          </tbody>
        </table>

        {/* Stock Ledger Table */}
        <h3 className="font-bold text-sm mb-2 underline text-center">
          بيان الأرصدة المخزنية والرصيد المتبقي لكل فئة بنهاية شهر {monthNameAr} {selectedYear}
        </h3>
        <table className="w-full border-collapse border border-black text-xs text-center mb-6">
          <thead>
            <tr className="bg-gray-100 font-bold">
              <th className="border border-black p-1.5">م</th>
              <th className="border border-black p-1.5 text-right">اسم الفئة / الصنف</th>
              <th className="border border-black p-1.5">رصيد أول الشهر</th>
              <th className="border border-black p-1.5">الوارد خلال الشهر</th>
              <th className="border border-black p-1.5">المنصرف خلال الشهر</th>
              <th className="border border-black p-1.5 font-black bg-gray-200">الرصيد المتبقي</th>
              <th className="border border-black p-1.5">الوحدة</th>
            </tr>
          </thead>
          <tbody>
            {stockCategoriesData.map((s, idx) => (
              <tr key={s.id}>
                <td className="border border-black p-1.5 font-mono">{idx + 1}</td>
                <td className="border border-black p-1.5 text-right font-bold">{s.name}</td>
                <td className="border border-black p-1.5 font-mono">{s.startingStock}</td>
                <td className="border border-black p-1.5 font-mono">{s.receivedThisMonth}</td>
                <td className="border border-black p-1.5 font-mono">{s.dispensedThisMonth}</td>
                <td className="border border-black p-1.5 font-mono font-black bg-gray-100">{s.currentStock}</td>
                <td className="border border-black p-1.5">{s.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Official Signatures */}
        <div className="mt-10 pt-4 border-t border-black grid grid-cols-4 gap-4 text-center text-xs font-bold">
          <div>
            <p>كاتب صحة سفلاق</p>
            <p className="mt-10">..................................</p>
          </div>
          <div>
            <p>مراقب أول الصحة</p>
            <p className="mt-10">..................................</p>
          </div>
          <div>
            <p>مدير مكتب صحة سفلاق</p>
            <p className="mt-10">..................................</p>
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

import React, { useState, useMemo, useRef } from 'react';
import { AppDatabase, DispenseRecord, LateRegistrationRecord } from '../types';
import { exportToCSV } from '../storage/db';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  normalizeGender,
  isActualBirthRegistration,
  isDeathRegistration,
  getDispensedHealthCards,
  getDispenseTypeDisplay,
  getItemCategory,
} from '../services/reportService';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Filter,
  Search,
  Baby,
  Skull,
  CreditCard,
  FileQuestion,
  Receipt,
  DollarSign,
  TrendingDown,
  Building2,
  FileCheck2,
  X,
  Clock
} from 'lucide-react';

export type RecordTypeFilter =
  | 'all'
  | 'birth_certificates'
  | 'death_certificates'
  | 'health_cards'
  | 'omitted_registrations';

interface CustomReportsScreenProps {
  db: AppDatabase;
  onSelectPrintRecord: (record: DispenseRecord) => void;
}

export const CustomReportsScreen: React.FC<CustomReportsScreenProps> = ({
  db,
  onSelectPrintRecord,
}) => {
  // Date range state
  const todayStr = new Date().toISOString().split('T')[0];

  // Default to the first day of current month to today
  const firstDayOfMonth = new Date();
  firstDayOfMonth.setDate(1);
  const firstDayStr = firstDayOfMonth.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState<string>(firstDayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [recordType, setRecordType] = useState<RecordTypeFilter>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);

  const printAreaRef = useRef<HTMLDivElement>(null);

  // Quick Preset Handlers
  const handleSetPreset = (preset: 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'year' | 'all') => {
    const now = new Date();
    if (preset === 'today') {
      const today = now.toISOString().split('T')[0];
      setStartDate(today);
      setEndDate(today);
    } else if (preset === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      const yestStr = yest.toISOString().split('T')[0];
      setStartDate(yestStr);
      setEndDate(yestStr);
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

  // Filter Dispense Records by Date Range
  const dateFilteredDispenses = useMemo(() => {
    return db.dispenseRecords.filter((r) => {
      const d = r.date;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [db.dispenseRecords, startDate, endDate]);

  // Filter Late Registrations by Date Range (using submissionDate)
  const dateFilteredLateRegs = useMemo(() => {
    return db.lateRegistrations.filter((l) => {
      const d = l.submissionDate;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [db.lateRegistrations, startDate, endDate]);

  // Filter Supply Transactions by Date Range
  const dateFilteredSupplies = useMemo(() => {
    return db.supplyTransactions.filter((s) => {
      const d = s.date;
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [db.supplyTransactions, startDate, endDate]);

  // Key Summary Metrics in the selected Date Range
  const metrics = useMemo(() => {
    // 1. Birth registrations: actual birth registrations only
    const actualBirthRecords = dateFilteredDispenses.filter((r) => isActualBirthRegistration(r));
    const totalMaleBirths = actualBirthRecords.filter((r) => {
      const g = normalizeGender(r.gender);
      return g === 'male' || (g === 'unknown' && r.dispenseType === 'birth_male');
    });
    const totalFemaleBirths = actualBirthRecords.filter((r) => {
      const g = normalizeGender(r.gender);
      return g === 'female' || (g === 'unknown' && r.dispenseType === 'birth_female');
    });

    // 2. Death registrations
    const deathRecords = dateFilteredDispenses.filter((r) => isDeathRegistration(r));
    const maleDeaths = deathRecords.filter((r) => normalizeGender(r.gender) === 'male');
    const femaleDeaths = deathRecords.filter((r) => normalizeGender(r.gender) === 'female');

    // 3. Health cards issued
    let maleCards = 0;
    let femaleCards = 0;
    dateFilteredDispenses.forEach((r) => {
      const cards = getDispensedHealthCards(r);
      maleCards += cards.male;
      femaleCards += cards.female;
    });
    const totalHealthCards = maleCards + femaleCards;

    // 4. Payments: sum of paymentAmount
    const totalPaymentsReceived = dateFilteredDispenses.reduce(
      (sum, r) => sum + (Number(r.paymentAmount) || 0),
      0
    );

    // 5. Number of health card receipts issued
    const validReceiptsCount = dateFilteredDispenses.filter(
      (r) => r.healthCardReceiptNumber && r.healthCardReceiptNumber.trim() !== '' && !r.healthCardReceiptNumber.includes('غير مطلوب')
    ).length;

    // 6. Omitted registrations summary
    const lateBirths = dateFilteredLateRegs.filter((l) => l.type === 'birth').length;
    const lateDeaths = dateFilteredLateRegs.filter((l) => l.type === 'death').length;
    const lateUnderYear = dateFilteredLateRegs.filter((l) => (l.ageCategory || 'under_one_year') === 'under_one_year').length;
    const lateOverYear = dateFilteredLateRegs.filter((l) => l.ageCategory === 'over_one_year').length;
    const lateApproved = dateFilteredLateRegs.filter((l) => l.status === 'approved').length;
    const latePending = dateFilteredLateRegs.filter((l) => l.status !== 'approved' && l.status !== 'rejected').length;

    // 7. Total documents dispensed (sum of all itemsDeducted in this range)
    const totalDocsDispensed = dateFilteredDispenses.reduce((sum, r) => {
      return sum + (r.itemsDeducted?.reduce((inner, item) => inner + (Number(item.quantity) || 0), 0) || 0);
    }, 0);

    return {
      totalDispenses: dateFilteredDispenses.length,
      totalBirthsCount: actualBirthRecords.length,
      maleBirthsCount: totalMaleBirths.length,
      femaleBirthsCount: totalFemaleBirths.length,
      totalDeathsCount: deathRecords.length,
      maleDeathsCount: maleDeaths.length,
      femaleDeathsCount: femaleDeaths.length,
      maleCardsCount: maleCards,
      femaleCardsCount: femaleCards,
      totalHealthCardsCount: totalHealthCards,
      totalPaymentsReceived,
      validReceiptsCount,
      totalLateRegsCount: dateFilteredLateRegs.length,
      lateBirthsCount: lateBirths,
      lateDeathsCount: lateDeaths,
      lateUnderYear,
      lateOverYear,
      lateApprovedCount: lateApproved,
      latePendingCount: latePending,
      totalDocsDispensed,
      suppliesCount: dateFilteredSupplies.length,
    };
  }, [dateFilteredDispenses, dateFilteredLateRegs, dateFilteredSupplies]);

  // Combined and filtered records according to Record Type and Search
  const filteredDispenses = useMemo(() => {
    if (recordType === 'omitted_registrations') return [];

    return dateFilteredDispenses.filter((r) => {
      // Record type check
      if (recordType === 'birth_certificates') {
        if (!isActualBirthRegistration(r)) return false;
      } else if (recordType === 'death_certificates') {
        if (!isDeathRegistration(r)) return false;
      } else if (recordType === 'health_cards') {
        if (getDispensedHealthCards(r).total <= 0) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const match =
          r.beneficiaryName.toLowerCase().includes(s) ||
          r.certificateNumber.toLowerCase().includes(s) ||
          r.healthCardReceiptNumber.toLowerCase().includes(s) ||
          (r.fatherName && r.fatherName.toLowerCase().includes(s)) ||
          (r.reporterName && r.reporterName.toLowerCase().includes(s));
        if (!match) return false;
      }

      return true;
    });
  }, [dateFilteredDispenses, recordType, searchTerm]);

  const filteredLateRegs = useMemo(() => {
    if (
      recordType === 'birth_certificates' ||
      recordType === 'death_certificates' ||
      recordType === 'health_cards'
    ) {
      return [];
    }

    return dateFilteredLateRegs.filter((l) => {
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase().trim();
        const match =
          l.personName.toLowerCase().includes(s) ||
          l.formNumber.toLowerCase().includes(s) ||
          l.applicantName.toLowerCase().includes(s) ||
          (l.delayReason && l.delayReason.toLowerCase().includes(s));
        if (!match) return false;
      }
      return true;
    });
  }, [dateFilteredLateRegs, recordType, searchTerm]);

  // Export to CSV
  const handleExportCSV = () => {
    const reportTitle = `تقرير_مكتب_صحة_سفلاق_من_${startDate}_إلى_${endDate}`;

    const summaryRows: string[][] = [
      ['تقرير مكتب صحة سفلاق المخصص'],
      ['الفترة الزمنية', `من ${startDate} إلى ${endDate}`],
      ['تاريخ استخراج التقرير', new Date().toLocaleString('ar-EG')],
      ['نوع السجلات', getRecordTypeArabicLabel(recordType)],
      ['-----------------------------------'],
      ['ملخص المؤشرات الرئيسية:'],
      ['إجمالي شهادات الميلاد المصدرة', metrics.totalBirthsCount.toString()],
      ['- شهادات مواليد ذكور', metrics.maleBirthsCount.toString()],
      ['- شهادات مواليد إناث', metrics.femaleBirthsCount.toString()],
      ['إجمالي شهادات الوفاة المصدرة', metrics.totalDeathsCount.toString()],
      ['إجمالي البطاقات الصحية المسلمة', metrics.totalHealthCardsCount.toString()],
      ['- بطاقات صحية ذكور', metrics.maleCardsCount.toString()],
      ['- بطاقات صحية إناث', metrics.femaleCardsCount.toString()],
      ['إجمالي الرسوم / التوريد المحصل (جنيه)', `${metrics.totalPaymentsReceived} ج.م`],
      ['عدد إيصالات التوريد 33 ع.ح المحررة', metrics.validReceiptsCount.toString()],
      ['إجمالي استمارات ساقط القيد المسجلة', metrics.totalLateRegsCount.toString()],
      ['- ساقط قيد ميلاد', metrics.lateBirthsCount.toString()],
      ['- ساقط قيد وفاة', metrics.lateDeathsCount.toString()],
      ['-----------------------------------'],
      ['تفاصيل المعاملات المنصرفة:'],
      [
        'م',
        'التاريخ',
        'الوقت',
        'نوع المعاملة',
        'اسم المستفيد (الطفل / المتوفى)',
        'رقم الشهادة',
        'رقم إيصال توريد البطاقة',
        'المبلغ المحصل (ج.م)',
        'اسم الأب',
        'اسم الأم',
        'المبلّغ',
        'الموظف الصارف',
        'ملاحظات',
      ],
    ];

    const dataRows = filteredDispenses.map((r, idx) => [
      (idx + 1).toString(),
      r.date,
      r.time,
      getDispenseTypeDisplay(r).label,
      r.beneficiaryName,
      r.certificateNumber,
      r.healthCardReceiptNumber,
      (r.paymentAmount ?? 0).toString(),
      r.fatherName || '',
      r.motherName || '',
      r.reporterName,
      r.dispensedBy,
      r.notes || '',
    ]);

    let lateRows: string[][] = [];
    if (filteredLateRegs.length > 0) {
      lateRows = [
        ['-----------------------------------'],
        ['تفاصيل استمارات ساقط القيد في هذه الفترة:'],
        [
          'م',
          'رقم الاستمارة',
          'تاريخ التقديم',
          'نوع القيد',
          'اسم صاحب القيد',
          'تاريخ الواقعة',
          'مقدم الطلب',
          'الرقم القومي',
          'الحالة الإجرائية',
          'سبب التأخير',
          'ملاحظات',
        ],
        ...filteredLateRegs.map((l, idx) => [
          (idx + 1).toString(),
          l.formNumber,
          l.submissionDate,
          l.type === 'birth' ? 'ساقط ميلاد' : 'ساقط وفاة',
          l.personName,
          l.eventDate,
          l.applicantName,
          l.applicantNationalId,
          l.status === 'under_review'
            ? 'قيد الفحص والمراجعة'
            : l.status === 'medical_comm'
            ? 'لجنة طبية ثلاثية'
            : l.status === 'civil_status'
            ? 'إفادة السجل المدني'
            : l.status === 'approved'
            ? 'معتمد ومسجل'
            : 'مرفوض',
          l.delayReason,
          l.notes,
        ]),
      ];
    }

    const allCsvRows = [...summaryRows, ...dataRows, ...lateRows];
    exportToCSV(`${reportTitle}.csv`, allCsvRows);
  };

  // Export to PDF using jsPDF
  const handleExportPDF = () => {
    try {
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });

      // Header info
      doc.setFontSize(16);
      doc.text('جمهورية مصر العربية - وزارة الصحة والسكان', 105, 15, { align: 'center' });
      doc.setFontSize(14);
      doc.text('مديرية الشؤون الصحية بسوهاج - مكتب صحة سفلاق', 105, 23, { align: 'center' });
      doc.setFontSize(11);
      doc.text(`تقرير رسمي للفترة من: ${startDate}  إلى: ${endDate}`, 105, 30, { align: 'center' });
      doc.line(15, 33, 195, 33);

      // Summary Table
      const summaryTableData = [
        ['إجمالي شهادات الميلاد المصدرة', `${metrics.totalBirthsCount} شهادة (ذكور: ${metrics.maleBirthsCount}، إناث: ${metrics.femaleBirthsCount})`],
        ['إجمالي شهادات الوفاة المصدرة', `${metrics.totalDeathsCount} شهادة`],
        ['إجمالي البطاقات الصحية المسلمة', `${metrics.totalHealthCardsCount} بطاقة`],
        ['إجمالي المبالغ المحصلة (قسائم 33 ع.ح)', `${metrics.totalPaymentsReceived} ج.م`],
        ['عدد إيصالات التوريد المحررة', `${metrics.validReceiptsCount} إيصال`],
        ['استمارات ساقط القيد المسجلة', `${metrics.totalLateRegsCount} استمارة (ميلاد: ${metrics.lateBirthsCount}، وفاة: ${metrics.lateDeathsCount})`],
      ];

      autoTable(doc, {
        startY: 38,
        head: [['المؤشر الإحصائي', 'القيمة الإجمالية المسجلة']],
        body: summaryTableData,
        theme: 'striped',
        headStyles: { fillColor: [6, 78, 59], textColor: 255, halign: 'center', fontStyle: 'bold' },
        bodyStyles: { halign: 'center' },
        styles: { font: 'helvetica', fontSize: 10 },
      });

      // Itemized Table
      if (filteredDispenses.length > 0) {
        const lastAutoTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
        const currentY = lastAutoTable?.finalY ? lastAutoTable.finalY + 10 : 90;
        doc.setFontSize(12);
        doc.text('بيان تفصيلي بالمعاملات المنصرفة:', 195, currentY, { align: 'right' });

        const dispenseRows = filteredDispenses.slice(0, 30).map((r, i) => [
          (i + 1).toString(),
          r.date,
          r.dispenseType === 'death' ? 'وفاة' : 'ميلاد',
          r.beneficiaryName,
          r.certificateNumber,
          r.healthCardReceiptNumber,
          `${r.paymentAmount || 0} ج.م`,
        ]);

        autoTable(doc, {
          startY: currentY + 4,
          head: [['م', 'التاريخ', 'النوع', 'اسم المستفيد', 'رقم الشهادة', 'رقم الإيصال', 'المبلغ']],
          body: dispenseRows,
          theme: 'grid',
          headStyles: { fillColor: [4, 120, 87], textColor: 255, halign: 'center', fontSize: 9 },
          styles: { fontSize: 8, halign: 'center' },
        });
      }

      // Signatures at footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(10);
      doc.text('كاتب صحة سفلاق: ________________', 180, pageHeight - 15, { align: 'right' });
      doc.text('مفتش صحة المركز: ________________', 60, pageHeight - 15, { align: 'right' });

      doc.save(`تقرير_مكتب_صحة_سفلاق_${startDate}_${endDate}.pdf`);
    } catch (err) {
      console.error('Error generating PDF:', err);
      // If font issue in standard jsPDF occurs, trigger the printable HTML modal which prints directly to PDF flawlessly
      setShowPrintModal(true);
    }
  };

  function getRecordTypeArabicLabel(type: RecordTypeFilter): string {
    switch (type) {
      case 'birth_certificates':
        return 'شهادات وبلاغات الميلاد';
      case 'death_certificates':
        return 'شهادات وبلاغات الوفاة';
      case 'health_cards':
        return 'البطاقات الصحية (ذكور وإناث)';
      case 'omitted_registrations':
        return 'استمارات ساقط القيد';
      default:
        return 'تقرير شامل لكافة المستندات والمعاملات';
    }
  }

  return (
    <div className="space-y-6">
      {/* HEADER BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center border border-emerald-200 shrink-0 shadow-xs">
              <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  نظام التقارير المخصصة والإحصائيات
                </h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                  مكتب صحة سفلاق
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                استخراج تقارير دقيقة حسب الفترة الزمنية المحددة وأنواع السجلات مع تجميع أعداد الشهادات المصدرة، المبالغ المحصلة، واستمارات ساقط القيد
              </p>
            </div>
          </div>

          {/* Export action buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              id="export-csv-button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تصدير Excel (CSV)</span>
            </button>

            <button
              onClick={() => setShowPrintModal(true)}
              id="print-pdf-report-button"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs md:text-sm shadow-xs transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>معاينة وطباعة التقرير (PDF)</span>
            </button>

            <button
              onClick={handleExportPDF}
              id="direct-pdf-download-button"
              className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs md:text-sm transition cursor-pointer border border-slate-300"
              title="تنزيل ملف PDF فوري"
            >
              <Download className="w-4 h-4 text-slate-600" />
              <span>تحميل PDF</span>
            </button>
          </div>
        </div>

        {/* CONTROLS: DATE RANGE & RECORD TYPES */}
        <div className="mt-5 space-y-4">
          {/* Row 1: Date Pickers & Quick Presets */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            {/* Date Pickers */}
            <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[11px] font-black text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span>من تاريخ (بداية الفترة) *</span>
                </label>
                <input
                  type="date"
                  id="report-start-date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs font-bold text-slate-900 font-mono focus:border-emerald-600"
                />
              </div>

              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <label className="block text-[11px] font-black text-slate-600 mb-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-700" />
                  <span>إلى تاريخ (نهاية الفترة) *</span>
                </label>
                <input
                  type="date"
                  id="report-end-date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white rounded-lg border border-slate-300 text-xs font-bold text-slate-900 font-mono focus:border-emerald-600"
                />
              </div>
            </div>

            {/* Quick Date Presets */}
            <div className="lg:col-span-6 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 font-bold ml-1 flex items-center gap-1 text-[11px]">
                <Clock className="w-3.5 h-3.5" />
                <span>فترات سريعة:</span>
              </span>
              <button
                onClick={() => handleSetPreset('today')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                اليوم
              </button>
              <button
                onClick={() => handleSetPreset('yesterday')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                أمس
              </button>
              <button
                onClick={() => handleSetPreset('week')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                آخر 7 أيام
              </button>
              <button
                onClick={() => handleSetPreset('month')}
                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 font-bold text-xs transition cursor-pointer"
              >
                هذا الشهر
              </button>
              <button
                onClick={() => handleSetPreset('last_month')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                الشهر الماضي
              </button>
              <button
                onClick={() => handleSetPreset('year')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                العام الحالي
              </button>
              <button
                onClick={() => handleSetPreset('all')}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-800 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                كافة الفترات
              </button>
            </div>
          </div>

          {/* Row 2: Record Type Selector Chips & Search Input */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            {/* Record Type Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600 font-bold text-xs flex items-center gap-1">
                <Filter className="w-3.5 h-3.5 text-emerald-700" />
                <span>نوع السجل:</span>
              </span>

              <button
                onClick={() => setRecordType('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                  recordType === 'all'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                شامل كافة السجلات
              </button>

              <button
                onClick={() => setRecordType('birth_certificates')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  recordType === 'birth_certificates'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Baby className="w-3.5 h-3.5" />
                <span>شهادات الميلاد</span>
              </button>

              <button
                onClick={() => setRecordType('death_certificates')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  recordType === 'death_certificates'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Skull className="w-3.5 h-3.5" />
                <span>شهادات الوفاة</span>
              </button>

              <button
                onClick={() => setRecordType('health_cards')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  recordType === 'health_cards'
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>البطاقات الصحية</span>
              </button>

              <button
                onClick={() => setRecordType('omitted_registrations')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  recordType === 'omitted_registrations'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <FileQuestion className="w-3.5 h-3.5" />
                <span>ساقط القيد</span>
              </button>
            </div>

            {/* Quick Search in Results */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="بحث باسم المستفيد أو الرقم..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pr-9 pl-3 py-1.5 text-xs rounded-xl border border-slate-200 focus:border-emerald-600 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SUMMARY CARDS - THE KEY AGGREGATED METRICS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {/* Metric 1: Birth Certificates Issued */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-700">
            <span className="text-[11px] font-black text-slate-500">شهادات الميلاد</span>
            <Baby className="w-5 h-5 bg-blue-50 p-1 rounded-lg" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {metrics.totalBirthsCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">شهادة مصدرة رسمية</p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 flex justify-between font-mono">
            <span>ذكور: {metrics.maleBirthsCount}</span>
            <span>إناث: {metrics.femaleBirthsCount}</span>
          </div>
        </div>

        {/* Metric 2: Death Certificates Issued */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-700">
            <span className="text-[11px] font-black text-slate-500">شهادات الوفاة</span>
            <Skull className="w-5 h-5 bg-slate-100 p-1 rounded-lg" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {metrics.totalDeathsCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">حالة وفاة موثقة</p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 flex justify-between font-mono">
            <span>ذكور: {metrics.maleDeathsCount}</span>
            <span>إناث: {metrics.femaleDeathsCount}</span>
          </div>
        </div>

        {/* Metric 3: Health Cards Issued */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-teal-700">
            <span className="text-[11px] font-black text-slate-500">البطاقات الصحية</span>
            <CreditCard className="w-5 h-5 bg-teal-50 p-1 rounded-lg" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {metrics.totalHealthCardsCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">بطاقة مسلّمة للأمهات</p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 flex justify-between font-mono">
            <span>زرقاء: {metrics.maleCardsCount}</span>
            <span>وردية: {metrics.femaleCardsCount}</span>
          </div>
        </div>

        {/* Metric 4: Received Payments */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-700">
            <span className="text-[11px] font-black text-slate-500">المبالغ المحصلة</span>
            <DollarSign className="w-5 h-5 bg-emerald-50 p-1 rounded-lg" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-emerald-800 font-mono">
              {metrics.totalPaymentsReceived.toLocaleString('ar-EG')} <span className="text-xs font-sans font-bold">ج.م</span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">إجمالي رسوم التوريد</p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 font-mono">
            <span>إيصالات 33 ع.ح: {metrics.validReceiptsCount}</span>
          </div>
        </div>

        {/* Metric 5: Omitted Registrations */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-700">
            <span className="text-[11px] font-black text-slate-500">ساقط القيد</span>
            <FileQuestion className="w-5 h-5 bg-amber-50 p-1 rounded-lg" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {metrics.totalLateRegsCount}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">استمارة مقيدة بالفترة</p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 flex justify-between font-mono">
            <span>معتمد: {metrics.lateApprovedCount}</span>
            <span>جارٍ الفحص: {metrics.latePendingCount}</span>
          </div>
        </div>

        {/* Metric 6: Total Documents Dispensed */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-purple-700">
            <span className="text-[11px] font-black text-slate-500">حركة الأوراق</span>
            <TrendingDown className="w-5 h-5 bg-purple-50 p-1 rounded-lg" />
          </div>
          <div className="my-2">
            <div className="text-2xl font-black text-slate-900 font-mono">
              {metrics.totalDocsDispensed}
            </div>
            <p className="text-[11px] text-slate-500 font-medium">مستند مخصوم من المخزن</p>
          </div>
          <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-600 font-mono">
            <span>إجمالي المعاملات: {metrics.totalDispenses}</span>
          </div>
        </div>
      </div>

      {/* DETAILED RESULTS SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-base text-slate-900">
              بيان السجلات التفصيلية للفترة (من {startDate} إلى {endDate})
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
              {filteredDispenses.length + filteredLateRegs.length} سجل
            </span>
          </div>

          <div className="text-xs text-slate-500">
            تصفية العرض: <span className="font-bold text-slate-800">{getRecordTypeArabicLabel(recordType)}</span>
          </div>
        </div>

        {/* DATA TABLE FOR DISPENSE RECORDS */}
        {recordType !== 'omitted_registrations' && (
          <div>
            {filteredDispenses.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                لا توجد سجلات صرف تطابق الفترة أو معايير البحث المحددة.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-right text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-600 font-black bg-slate-50/80">
                      <th className="py-3 px-3">التاريخ</th>
                      <th className="py-3 px-3">نوع المعاملة</th>
                      <th className="py-3 px-3">اسم المستفيد</th>
                      <th className="py-3 px-3 font-mono">رقم الشهادة</th>
                      <th className="py-3 px-3 font-mono">رقم إيصال التوريد</th>
                      <th className="py-3 px-3">المبلغ المحصل</th>
                      <th className="py-3 px-3">اسم الأب / المبلّغ</th>
                      <th className="py-3 px-3">الموظف الصارف</th>
                      <th className="py-3 px-3 text-center">إيصال</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredDispenses.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {r.date} <span className="text-slate-400 text-[10px]">{r.time}</span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          {(() => {
                            const info = getDispenseTypeDisplay(r);
                            return (
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-[11px] font-bold ${info.badgeClass}`}>
                                {info.iconType === 'birth' && <Baby className="w-3.5 h-3.5" />}
                                {info.iconType === 'death' && <Skull className="w-3.5 h-3.5" />}
                                {info.iconType === 'health_card' && <CreditCard className="w-3.5 h-3.5" />}
                                {info.iconType === 'document' && <FileCheck2 className="w-3.5 h-3.5" />}
                                <span>{info.label}</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
                          {r.beneficiaryName}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                          {r.certificateNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                          {r.healthCardReceiptNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {r.paymentAmount !== undefined ? `${r.paymentAmount} ج.م` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div>{r.fatherName || '—'}</div>
                          <div className="text-[10px] text-slate-400">مبلّغ: {r.reporterName}</div>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                          {r.dispensedBy}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={() => onSelectPrintRecord(r)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs cursor-pointer transition"
                            title="طباعة إيصال الصرف"
                          >
                            طباعة
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* DATA TABLE FOR LATE REGISTRATIONS */}
        {(recordType === 'all' || recordType === 'omitted_registrations') && filteredLateRegs.length > 0 && (
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
              <FileQuestion className="w-4 h-4 text-amber-600" />
              <span>استمارات ساقط القيد المسجلة بالفترة:</span>
            </div>

            <div className="overflow-x-auto rounded-xl border border-amber-200">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="border-b border-amber-200 text-amber-900 font-black bg-amber-50/70">
                    <th className="py-2.5 px-3 font-mono">رقم الاستمارة</th>
                    <th className="py-2.5 px-3">تاريخ التقديم</th>
                    <th className="py-2.5 px-3">النوع</th>
                    <th className="py-2.5 px-3">اسم صاحب القيد</th>
                    <th className="py-2.5 px-3">مقدم الطلب وصلته</th>
                    <th className="py-2.5 px-3">الموقف الإجرائي</th>
                    <th className="py-2.5 px-3">سبب التأخير والملاحظات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-amber-100">
                  {filteredLateRegs.map((l) => (
                    <tr key={l.id} className="hover:bg-amber-50/30 transition">
                      <td className="py-2.5 px-3 font-mono font-bold text-amber-900">{l.formNumber}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">{l.submissionDate}</td>
                      <td className="py-2.5 px-3">
                        {l.type === 'birth' ? (
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-800 text-[11px] font-bold">
                            ساقط ميلاد
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 text-[11px] font-bold">
                            ساقط وفاة
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{l.personName}</td>
                      <td className="py-2.5 px-3 text-slate-700">
                        {l.applicantName} ({l.applicantRelation})
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                          {l.status === 'under_review' && 'قيد المراجعة والفحص'}
                          {l.status === 'medical_comm' && 'لجنة طبية لتقدير السن'}
                          {l.status === 'civil_status' && 'إفادة الأحوال المدنية'}
                          {l.status === 'approved' && 'معتمد ومقيد رسمياً'}
                          {l.status === 'rejected' && 'مرفوض'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate" title={l.notes}>
                        {l.delayReason || l.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PRINT-TO-PDF OFFICIAL REPORT MODAL */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95">
            {/* Modal Actions Bar (hidden when printing) */}
            <div className="no-print p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 rounded-t-2xl">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-700" />
                <h3 className="font-black text-slate-900 text-sm md:text-base">
                  معاينة وطباعة التقرير الرسمي لـ (مكتب صحة سفلاق)
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs md:text-sm font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة أو حفظ بتنسيق PDF</span>
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl hover:bg-slate-200 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Report Body */}
            <div
              ref={printAreaRef}
              className="p-8 overflow-y-auto text-slate-900 bg-white font-sans text-xs md:text-sm print:p-0 print:overflow-visible"
              dir="rtl"
            >
              {/* Official Header */}
              <div className="border-b-2 border-slate-900 pb-4 mb-6">
                <div className="flex justify-between items-start">
                  <div className="text-right space-y-1">
                    <p className="font-bold text-xs text-slate-600">جمهورية مصر العربية</p>
                    <p className="font-bold text-xs text-slate-600">وزارة الصحة والسكان</p>
                    <p className="font-bold text-xs text-slate-600">مديرية الشؤون الصحية بسوهاج</p>
                    <p className="font-bold text-sm text-slate-900">الإدارة الصحية بساقلتة</p>
                    <p className="font-black text-base text-emerald-900">مكتب صحة سفلاق</p>
                  </div>

                  <div className="text-center pt-2">
                    <div className="w-16 h-16 rounded-full border-2 border-slate-800 flex items-center justify-center mx-auto mb-1">
                      <Building2 className="w-8 h-8 text-slate-800" />
                    </div>
                    <span className="text-[10px] text-slate-500 font-bold">خاتم شعار الجمهورية</span>
                  </div>

                  <div className="text-left space-y-1 text-xs">
                    <p><span className="text-slate-500">تاريخ التقرير:</span> <span className="font-bold">{new Date().toLocaleDateString('ar-EG')}</span></p>
                    <p><span className="text-slate-500">الفترة من:</span> <span className="font-mono font-bold">{startDate}</span></p>
                    <p><span className="text-slate-500">إلى:</span> <span className="font-mono font-bold">{endDate}</span></p>
                    <p><span className="text-slate-500">كود الوحدة:</span> <span className="font-mono font-bold">26-04-09</span></p>
                  </div>
                </div>

                <div className="text-center mt-4">
                  <h2 className="text-lg md:text-xl font-black underline tracking-wide">
                    تقرير إحصائي دوري بحركة صرف الأرصدة والشهادات والبطاقات وساقط القيد
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    تصنيف السجلات المشمولة: {getRecordTypeArabicLabel(recordType)}
                  </p>
                </div>
              </div>

              {/* Summary Stats Table in Report */}
              <div className="mb-6">
                <h4 className="font-black text-xs text-slate-800 mb-2">أولاً: ملخص حركة المستندات والمبالغ المحصلة بالفترة</h4>
                <table className="w-full border-collapse border border-slate-800 text-xs text-center">
                  <thead>
                    <tr className="bg-slate-100 font-black">
                      <th className="border border-slate-800 py-2 px-2">شهادات الميلاد</th>
                      <th className="border border-slate-800 py-2 px-2">شهادات الوفاة</th>
                      <th className="border border-slate-800 py-2 px-2">بطاقات صحية ذكور</th>
                      <th className="border border-slate-800 py-2 px-2">بطاقات صحية إناث</th>
                      <th className="border border-slate-800 py-2 px-2">إجمالي الرسوم المحصلة</th>
                      <th className="border border-slate-800 py-2 px-2">إيصالات 33 ع.ح</th>
                      <th className="border border-slate-800 py-2 px-2">استمارات ساقط القيد</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="font-bold font-mono text-sm">
                      <td className="border border-slate-800 py-2 px-2">{metrics.totalBirthsCount}</td>
                      <td className="border border-slate-800 py-2 px-2">{metrics.totalDeathsCount}</td>
                      <td className="border border-slate-800 py-2 px-2">{metrics.maleCardsCount}</td>
                      <td className="border border-slate-800 py-2 px-2">{metrics.femaleCardsCount}</td>
                      <td className="border border-slate-800 py-2 px-2 text-emerald-900 font-black">{metrics.totalPaymentsReceived} ج.م</td>
                      <td className="border border-slate-800 py-2 px-2">{metrics.validReceiptsCount}</td>
                      <td className="border border-slate-800 py-2 px-2">{metrics.totalLateRegsCount}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Itemized Table in Report */}
              <div className="mb-8">
                <h4 className="font-black text-xs text-slate-800 mb-2">ثانياً: بيان المستفيدين وأرقام الشهادات والإيصالات الرسمية</h4>
                <table className="w-full border-collapse border border-slate-800 text-xs text-right">
                  <thead>
                    <tr className="bg-slate-100 font-black text-slate-900">
                      <th className="border border-slate-800 py-1.5 px-2 text-center w-8">م</th>
                      <th className="border border-slate-800 py-1.5 px-2">التاريخ</th>
                      <th className="border border-slate-800 py-1.5 px-2">النوع</th>
                      <th className="border border-slate-800 py-1.5 px-2">اسم المستفيد</th>
                      <th className="border border-slate-800 py-1.5 px-2 font-mono">رقم الشهادة</th>
                      <th className="border border-slate-800 py-1.5 px-2 font-mono">إيصال التوريد</th>
                      <th className="border border-slate-800 py-1.5 px-2">الرسوم</th>
                      <th className="border border-slate-800 py-1.5 px-2">اسم الأب</th>
                      <th className="border border-slate-800 py-1.5 px-2">المبلّغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDispenses.slice(0, 50).map((r, i) => (
                      <tr key={r.id}>
                        <td className="border border-slate-800 py-1 px-2 text-center font-mono">{i + 1}</td>
                        <td className="border border-slate-800 py-1 px-2 font-mono">{r.date}</td>
                        <td className="border border-slate-800 py-1 px-2 font-bold">
                          {getDispenseTypeDisplay(r).label}
                        </td>
                        <td className="border border-slate-800 py-1 px-2 font-bold">{r.beneficiaryName}</td>
                        <td className="border border-slate-800 py-1 px-2 font-mono font-bold">{r.certificateNumber}</td>
                        <td className="border border-slate-800 py-1 px-2 font-mono">{r.healthCardReceiptNumber}</td>
                        <td className="border border-slate-800 py-1 px-2 font-mono">{r.paymentAmount || 0} ج.م</td>
                        <td className="border border-slate-800 py-1 px-2">{r.fatherName || '—'}</td>
                        <td className="border border-slate-800 py-1 px-2">{r.reporterName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Auditor Endorsements and Signatures */}
              <div className="pt-6 border-t border-slate-300 grid grid-cols-3 text-center text-xs font-bold gap-4">
                <div className="space-y-6">
                  <p>كاتب صحة سفلاق</p>
                  <p className="font-normal text-slate-600">{db.officeSettings.currentEmployee || 'غير محدد'}</p>
                  <p className="pt-2 border-t border-dashed border-slate-400">التوقيع: .....................</p>
                </div>

                <div className="space-y-6">
                  <p>المراقب الصحي / مراجع العهدة</p>
                  <p className="font-normal text-slate-600">إدارة ساقلتة الصحية</p>
                  <p className="pt-2 border-t border-dashed border-slate-400">التوقيع: .....................</p>
                </div>

                <div className="space-y-6">
                  <p>مفتش صحة سفلاق وساقلتة</p>
                  <p className="font-normal text-slate-600">طبيب الوحدة الصحية</p>
                  <p className="pt-2 border-t border-dashed border-slate-400">يعتمد: .....................</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

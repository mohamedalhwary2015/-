import React, { useState } from 'react';
import { AppDatabase, DispenseRecord } from '../types';
import { updateGovSystemStatus, exportToCSV } from '../storage/db';
import { 
  Globe2, 
  ExternalLink, 
  Copy, 
  Check, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  FileSpreadsheet, 
  Search, 
  Filter, 
  X, 
  Baby, 
  HeartCrack, 
  ShieldCheck, 
  HelpCircle,
  Network,
  RefreshCw,
  FileCheck
} from 'lucide-react';

interface GovernmentSystemModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
}

export const GovernmentSystemModal: React.FC<GovernmentSystemModalProps> = ({
  isOpen,
  onClose,
  db,
  onDatabaseUpdate,
}) => {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'births' | 'deaths' | 'guide'>('births');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'entered'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRefId, setEditingRefId] = useState<string | null>(null);
  const [tempRefNumber, setTempRefNumber] = useState('');

  if (!isOpen) return null;

  const GOV_URL = 'http://10.1.80.50';

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(GOV_URL);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  const handleLaunchSystem = () => {
    window.open(GOV_URL, '_blank', 'noopener,noreferrer');
  };

  const handleToggleStatus = (record: DispenseRecord) => {
    const nextStatus = !record.enteredIntoGovSystem;
    const updatedDb = updateGovSystemStatus(record.id, nextStatus, record.govSystemRefNumber);
    onDatabaseUpdate(updatedDb);
  };

  const handleSaveRefNumber = (recordId: string) => {
    const updatedDb = updateGovSystemStatus(recordId, true, tempRefNumber);
    onDatabaseUpdate(updatedDb);
    setEditingRefId(null);
    setTempRefNumber('');
  };

  // Filter births vs deaths
  const birthRecords = db.dispenseRecords.filter((r) => {
    const isBirth = 
      r.dispenseType === 'birth_certificate' ||
      r.dispenseType === 'birth_notification' ||
      r.dispenseType === 'health_card_male' ||
      r.dispenseType === 'health_card_female' ||
      r.dispenseType === 'birth_male' ||
      r.dispenseType === 'birth_female' ||
      r.itemsDeducted?.some(i => i.stockCategory.startsWith('birth') || i.stockCategory.startsWith('health_card'));
    return isBirth;
  });

  const deathRecords = db.dispenseRecords.filter((r) => {
    const isDeath = 
      r.dispenseType === 'death_certificate' ||
      r.dispenseType === 'death_notification' ||
      r.dispenseType === 'death' ||
      r.itemsDeducted?.some(i => i.stockCategory.startsWith('death'));
    return isDeath;
  });

  const currentRecords = activeSubTab === 'births' ? birthRecords : deathRecords;

  const filteredRecords = currentRecords.filter((r) => {
    // Status filter
    if (statusFilter === 'pending' && r.enteredIntoGovSystem) return false;
    if (statusFilter === 'entered' && !r.enteredIntoGovSystem) return false;

    // Search filter
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      r.beneficiaryName?.toLowerCase().includes(term) ||
      r.beneficiaryNationalId?.includes(term) ||
      r.fatherName?.toLowerCase().includes(term) ||
      r.fatherNationalId?.includes(term) ||
      r.motherName?.toLowerCase().includes(term) ||
      r.certificateNumber?.includes(term) ||
      r.notificationNumber?.includes(term) ||
      r.govSystemRefNumber?.includes(term)
    );
  });

  // KPI counts
  const totalBirths = birthRecords.length;
  const enteredBirths = birthRecords.filter((r) => r.enteredIntoGovSystem).length;
  const pendingBirths = totalBirths - enteredBirths;

  const totalDeaths = deathRecords.length;
  const enteredDeaths = deathRecords.filter((r) => r.enteredIntoGovSystem).length;
  const pendingDeaths = totalDeaths - enteredDeaths;

  // Export reconciliation sheet
  const handleExportReconciliationCSV = () => {
    const isBirth = activeSubTab === 'births';
    const rows: string[][] = [
      [`كشف مطابقة إدخال منظومة الميكنة الرسمية (10.1.80.50) - ${isBirth ? 'المواليد والبطاقات الصحية' : 'الوفيات'}`],
      ['الجهة:', 'مكتب صحة سفلاق - الإدارة الصحية بساقلتة - مديرية الصحة بسوهاج'],
      ['رابط المنظومة الحكومية:', GOV_URL],
      ['تاريخ التصدير:', new Date().toLocaleDateString('ar-EG')],
      ['إجمالي الحالات المقيدة دفترياً:', String(currentRecords.length)],
      ['تم إدخالها على المنظومة:', String(isBirth ? enteredBirths : enteredDeaths)],
      ['قيد الانتظار لم تُدخل بعد:', String(isBirth ? pendingBirths : pendingDeaths)],
      [''],
      [
        'م',
        'التاريخ',
        isBirth ? 'اسم المولود' : 'اسم المتوفى',
        'النوع',
        isBirth ? 'اسم الأب' : 'الرقم القومي للمتوفى',
        isBirth ? 'الرقم القومي للأب' : 'السن عند الوفاة',
        isBirth ? 'اسم الأم' : 'سبب الوفاة',
        isBirth ? 'الرقم القومي للأم' : 'محل الوفاة',
        'رقم الإخطار / البلاغ الورقي',
        'رقم الشهادة / التصريح',
        'حالة الإدخال على المنظومة (10.1.80.50)',
        'تاريخ الإدخال بالمنظومة',
        'رقم القيد بالمنظومة الإلكترونية',
        'الموظف المسجل',
      ],
    ];

    filteredRecords.forEach((r, idx) => {
      rows.push([
        String(idx + 1),
        r.date,
        r.beneficiaryName,
        r.gender === 'male' ? 'ذكر' : r.gender === 'female' ? 'أنثى' : '-',
        isBirth ? (r.fatherName || '-') : (r.beneficiaryNationalId || '-'),
        isBirth ? (r.fatherNationalId || '-') : '-',
        isBirth ? (r.motherName || '-') : (r.notes || '-'),
        isBirth ? (r.motherNationalId || '-') : '-',
        r.notificationNumber || '-',
        r.certificateNumber || '-',
        r.enteredIntoGovSystem ? 'تم الإدخال' : 'قيد الانتظار',
        r.govSystemEntryDate || '-',
        r.govSystemRefNumber || '-',
        r.dispensedBy,
      ]);
    });

    const fileName = `مطابقة_منظومة_الميكنة_${isBirth ? 'مواليد' : 'وفيات'}_${new Date().toISOString().split('T')[0]}.csv`;
    exportToCSV(fileName, rows);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-300 overflow-hidden animate-in fade-in zoom-in-95">
        
        {/* MODAL HEADER */}
        <div className="p-4 md:p-5 bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white flex items-center justify-between border-b border-emerald-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 rounded-xl border border-emerald-400/30 text-emerald-300">
              <Network className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg md:text-xl font-black text-white">
                  بوابة الربط مع منظومة الميكنة الرسمية
                </h2>
                <span className="font-mono text-xs bg-emerald-700/80 text-emerald-100 px-2 py-0.5 rounded-md font-bold dir-ltr">
                  10.1.80.50
                </span>
              </div>
              <p className="text-xs text-emerald-200/80 mt-0.5">
                منظومة ميكنة تسجيل المواليد والوفيات - قطاع الرعاية الأساسية بوزارة الصحة والسكان
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition cursor-pointer"
            title="إغلاق"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* CONNECTION & QUICK LAUNCH HERO BAR */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 md:p-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Direct URL Box */}
            <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-300 shadow-2xs">
              <Globe2 className="w-5 h-5 text-emerald-700 shrink-0" />
              <div>
                <div className="text-[11px] font-bold text-slate-500">رابط الموقع الرسمي على الشبكة الحكومية:</div>
                <div className="font-mono text-sm font-black text-slate-900 dir-ltr select-all">
                  {GOV_URL}
                </div>
              </div>
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition cursor-pointer ml-2 border border-slate-200"
                title="نسخ الرابط"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'تم النسخ' : 'نسخ'}</span>
              </button>
            </div>

            {/* Launch CTA */}
            <div className="flex items-center gap-2.5">
              <button
                id="gov-launch-btn"
                onClick={handleLaunchSystem}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-sm font-black transition cursor-pointer shadow-sm shadow-emerald-700/30"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح منظومة الميكنة (10.1.80.50) الآن</span>
              </button>

              <button
                onClick={handleExportReconciliationCSV}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl text-xs md:text-sm font-bold border border-slate-300 transition cursor-pointer shadow-2xs"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                <span>تصدير كشف المطابقة (Excel)</span>
              </button>
            </div>
          </div>

          {/* Network Notice */}
          <div className="mt-3.5 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 leading-relaxed">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>تنبيه فني لكاتب صحة سفلاق:</strong> هذا الرابط يعمل بنجاح فقط عند فتح التطبيق من أجهزة كمبيوتر مكتب الصحة المتصلة براوتر خط شبكة وزارة الصحة المغلق (VPN حكومي). إذا كنت تتصفح من خط إنترنت منزلي أو شبكة هاتف فلن يفتح الرابط لأنه شبكة خاصة مؤمنة.
            </div>
          </div>
        </div>

        {/* SUBTABS BAR & KPIS */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 pt-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <button
              id="gov-tab-births"
              onClick={() => setActiveSubTab('births')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs md:text-sm font-black transition-all cursor-pointer border-b-2 ${
                activeSubTab === 'births'
                  ? 'border-emerald-700 text-emerald-900 bg-emerald-50/70'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <Baby className="w-4 h-4" />
              <span>مطابقة إدخال المواليد والبطاقات</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                pendingBirths > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
              }`}>
                {pendingBirths} معلق / {totalBirths}
              </span>
            </button>

            <button
              id="gov-tab-deaths"
              onClick={() => setActiveSubTab('deaths')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs md:text-sm font-black transition-all cursor-pointer border-b-2 ${
                activeSubTab === 'deaths'
                  ? 'border-emerald-700 text-emerald-900 bg-emerald-50/70'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <HeartCrack className="w-4 h-4" />
              <span>مطابقة إدخال الوفيات</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                pendingDeaths > 0 ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
              }`}>
                {pendingDeaths} معلق / {totalDeaths}
              </span>
            </button>

            <button
              id="gov-tab-guide"
              onClick={() => setActiveSubTab('guide')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs md:text-sm font-black transition-all cursor-pointer border-b-2 ${
                activeSubTab === 'guide'
                  ? 'border-emerald-700 text-emerald-900 bg-emerald-50/70'
                  : 'border-transparent text-slate-500 hover:text-slate-900'
              }`}
            >
              <HelpCircle className="w-4 h-4" />
              <span>دليل الربط وتشغيل المنظومة</span>
            </button>
          </div>

          {/* Filter Status Selector */}
          {activeSubTab !== 'guide' && (
            <div className="flex items-center gap-2 pb-2 md:pb-0">
              <span className="text-xs font-bold text-slate-600">عرض:</span>
              <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    statusFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                  }`}
                >
                  الكل ({currentRecords.length})
                </button>
                <button
                  onClick={() => setStatusFilter('pending')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    statusFilter === 'pending' ? 'bg-amber-600 text-white shadow-2xs font-bold' : 'text-amber-800'
                  }`}
                >
                  معلق لم يُدخل ({activeSubTab === 'births' ? pendingBirths : pendingDeaths})
                </button>
                <button
                  onClick={() => setStatusFilter('entered')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                    statusFilter === 'entered' ? 'bg-emerald-700 text-white shadow-2xs font-bold' : 'text-emerald-800'
                  }`}
                >
                  تم إدخاله بالمنظومة ({activeSubTab === 'births' ? enteredBirths : enteredDeaths})
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH BAR (for data tabs) */}
        {activeSubTab !== 'guide' && (
          <div className="p-3 bg-slate-50 border-b border-slate-200 px-4 md:px-6">
            <div className="relative">
              <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث باسم الحالة، الرقم القومي، رقم البلاغ، أو رقم القيد بالمنظومة..."
                className="w-full pl-3 pr-9 py-2 bg-white border border-slate-300 rounded-xl text-xs md:text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-hidden"
              />
            </div>
          </div>
        )}

        {/* CONTENT AREA */}
        <div className="overflow-y-auto flex-1 p-4 md:p-6 space-y-4">
          
          {/* TAB 1 & 2: DATA RECONCILIATION TABLE */}
          {activeSubTab !== 'guide' && (
            <div>
              {filteredRecords.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 space-y-2">
                  <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                  <div className="font-bold text-slate-800">لا توجد حالات تطابق هذا الفلتر</div>
                  <p className="text-xs text-slate-500">
                    {statusFilter === 'pending'
                      ? 'رائع! تم إدخال جميع الحالات المسجلة دفترياً على منظومة الميكنة الرسمية بنجاح.'
                      : 'لم يتم العثور على نتائج بحث تطابق الكلمات المدخلة.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-right border-collapse text-xs md:text-sm">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-xs">
                        <th className="p-3 w-10 text-center">م</th>
                        <th className="p-3">تاريخ القيد</th>
                        <th className="p-3">{activeSubTab === 'births' ? 'اسم المولود / المستلم' : 'اسم المتوفى'}</th>
                        <th className="p-3">النوع</th>
                        <th className="p-3">{activeSubTab === 'births' ? 'بيانات الأب والأم' : 'الرقم القومي'}</th>
                        <th className="p-3 text-center">رقم البلاغ / الإخطار</th>
                        <th className="p-3 text-center">رقم الشهادة</th>
                        <th className="p-3 text-center min-w-[170px] bg-slate-200/60 font-black">
                          حالة التسجيل بـ (10.1.80.50)
                        </th>
                        <th className="p-3 min-w-[160px]">رقم القيد الإلكتروني</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 bg-white">
                      {filteredRecords.map((record, index) => {
                        const isEntered = record.enteredIntoGovSystem;
                        const isEditingThis = editingRefId === record.id;

                        return (
                          <tr key={record.id} className="hover:bg-slate-50/80 transition">
                            <td className="p-3 text-center font-bold text-slate-400 text-xs">
                              {index + 1}
                            </td>

                            <td className="p-3 text-slate-700 whitespace-nowrap">
                              <div className="font-bold">{record.date}</div>
                              <div className="text-[10px] text-slate-400">{record.time}</div>
                            </td>

                            <td className="p-3 font-black text-slate-900">
                              <div>{record.beneficiaryName}</div>
                              {record.beneficiaryNationalId && (
                                <div className="text-[11px] font-mono text-slate-500 font-normal">
                                  ق.م: {record.beneficiaryNationalId}
                                </div>
                              )}
                            </td>

                            <td className="p-3">
                              {record.gender === 'male' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
                                  ذكر
                                </span>
                              ) : record.gender === 'female' ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 border border-pink-200">
                                  أنثى
                                </span>
                              ) : (
                                <span className="text-slate-400 text-xs">-</span>
                              )}
                            </td>

                            <td className="p-3 text-xs text-slate-700">
                              {activeSubTab === 'births' ? (
                                <div className="space-y-0.5">
                                  {record.fatherName && (
                                    <div><strong className="text-slate-600">الأب:</strong> {record.fatherName}</div>
                                  )}
                                  {record.motherName && (
                                    <div><strong className="text-slate-600">الأم:</strong> {record.motherName}</div>
                                  )}
                                  {!record.fatherName && !record.motherName && (
                                    <span className="text-slate-400">مسجل بالدفتر الورقي</span>
                                  )}
                                </div>
                              ) : (
                                <span className="font-mono text-xs text-slate-800">
                                  {record.beneficiaryNationalId || 'غير مدون'}
                                </span>
                              )}
                            </td>

                            <td className="p-3 text-center font-mono font-bold text-slate-800">
                              {record.notificationNumber || '-'}
                            </td>

                            <td className="p-3 text-center font-mono font-bold text-emerald-800">
                              {record.certificateNumber || '-'}
                            </td>

                            {/* TOGGLE GOV STATUS BUTTON */}
                            <td className="p-3 text-center bg-slate-50/60">
                              <button
                                onClick={() => handleToggleStatus(record)}
                                className={`w-full py-1.5 px-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                                  isEntered
                                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                                    : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                }`}
                                title="انقر لتغيير حالة الإدخال على منظومة 10.1.80.50"
                              >
                                {isEntered ? (
                                  <>
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                    <span>تم الإدخال بالمنظومة</span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                    <span>معلق (لم يُدخل بعد)</span>
                                  </>
                                )}
                              </button>
                              {isEntered && record.govSystemEntryDate && (
                                <span className="text-[10px] text-slate-400 mt-0.5 block">
                                  تاريخ الإدخال: {record.govSystemEntryDate}
                                </span>
                              )}
                            </td>

                            {/* GOV REF NUMBER */}
                            <td className="p-3">
                              {isEditingThis ? (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={tempRefNumber}
                                    onChange={(e) => setTempRefNumber(e.target.value)}
                                    placeholder="رقم القيد..."
                                    className="w-24 px-1.5 py-1 text-xs border border-emerald-500 rounded-md font-mono"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => handleSaveRefNumber(record.id)}
                                    className="p-1 bg-emerald-700 text-white rounded-md text-xs cursor-pointer"
                                    title="حفظ"
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => setEditingRefId(null)}
                                    className="p-1 bg-slate-200 text-slate-700 rounded-md text-xs cursor-pointer"
                                    title="إلغاء"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between gap-1 group">
                                  <span className="font-mono text-xs font-semibold text-slate-800">
                                    {record.govSystemRefNumber || '-'}
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingRefId(record.id);
                                      setTempRefNumber(record.govSystemRefNumber || '');
                                    }}
                                    className="text-[10px] text-emerald-700 hover:underline cursor-pointer font-bold"
                                  >
                                    {record.govSystemRefNumber ? 'تعديل' : '+ إضافة رقم'}
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: USER GUIDE & TROUBLESHOOTING */}
          {activeSubTab === 'guide' && (
            <div className="space-y-5 text-slate-800">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2 font-black text-emerald-950 text-base">
                  <ShieldCheck className="w-5 h-5 text-emerald-700" />
                  <span>ما هي منظومة الميكنة الرسمية (10.1.80.50)؟</span>
                </div>
                <p className="text-xs md:text-sm text-emerald-900 leading-relaxed">
                  هذا الموقع هو الخادم المركزي لوزارة الصحة والسكان المصرية المخصص لتسجيل واقعتي الميلاد والوفاة رسمياً وربطهما بقاعدة بيانات الرقم القومي بالسجل المدني ومصلحة الأحوال المدنية. يتم الدخول عليه باسم مستخدم وكلمة مرور رسمية مسلمة لكاتب صحة سفلاق.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
                  <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                    <Network className="w-4 h-4 text-emerald-700" />
                    <span>متطلبات الاتصال الناجح</span>
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
                    <li>أن يكون جهاز الكمبيوتر موصولاً بكابل شبكة إلى راوتر الخط الحكومي (WE VPN).</li>
                    <li>أن تكون لمبات اتصال خط الـ VPN والإنترنت بالراوتر مضاءة ومستقرة.</li>
                    <li>عدم تفعيل برامج بروكسي (Proxy) أو شبكات افتراضية خاصة تمنع الدخول للشبكات الداخلية (10.x.x.x).</li>
                    <li>كتابة الرابط ببروتوكول <code className="bg-slate-100 px-1 py-0.5 rounded font-mono font-bold">http://10.1.80.50</code> بدون حرف s.</li>
                  </ul>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-2xs">
                  <h4 className="font-black text-slate-900 text-sm flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-emerald-700" />
                    <span>كيفية عمل التكامل بين هذا البرنامج والمنظومة</span>
                  </h4>
                  <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside leading-relaxed">
                    <li>يقوم كاتب الصحة بقيد الصرف والمستندات والبطاقات الصحية في هذا البرنامج دفترياً.</li>
                    <li>ينقر كاتب الصحة على زر "فتح منظومة الميكنة" لإدخال الحالات مباشرة.</li>
                    <li>عند الانتهاء من إدخال كل حالة، يقوم بالضغط على زر <strong>"تم الإدخال بالمنظومة"</strong> لتمييزها.</li>
                    <li>يوفر هذا البرنامج ميزة تصفية الحالات "المعلقة" لضمان عدم نسيان أي طفل أو متوفى دون تسجيل رسمي.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* MODAL FOOTER */}
        <div className="p-3 md:p-4 bg-slate-100 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
            <span>بوابة الميكنة الحكومية - مكتب صحة سفلاق | مركز ساقلتة - سوهاج</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl font-bold transition cursor-pointer"
            >
              إغلاق النافذة
            </button>
            <button
              onClick={handleLaunchSystem}
              className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-black transition cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <ExternalLink className="w-4 h-4" />
              <span>فتح 10.1.80.50</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

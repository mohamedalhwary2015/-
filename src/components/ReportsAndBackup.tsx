import React, { useState, useRef } from 'react';
import { AppDatabase, DispenseRecord } from '../types';
import { 
  exportDatabaseBackup, 
  importDatabaseBackup, 
  exportToCSV, 
  performFactoryReset 
} from '../storage/db';
import { 
  FileSpreadsheet, 
  Download, 
  Upload, 
  Printer, 
  Calendar, 
  Laptop, 
  ShieldCheck, 
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  HardDrive
} from 'lucide-react';

interface ReportsAndBackupProps {
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
  onSelectPrintRecord: (record: DispenseRecord) => void;
}

export const ReportsAndBackup: React.FC<ReportsAndBackupProps> = ({
  db,
  onDatabaseUpdate,
  onSelectPrintRecord,
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Daily records for selected date
  const dailyDispenses = db.dispenseRecords.filter((r) => r.date === selectedDate);

  // CSV Exports
  const handleExportDispenseCSV = () => {
    const headers = [
      'التاريخ',
      'الوقت',
      'نوع المعاملة',
      'اسم المستفيد',
      'رقم شهادة الميلاد أو الوفاة',
      'رقم إيصال توريد البطاقة الصحية',
      'رقم البلاغ',
      'اسم الأب',
      'الرقم القومي للأب',
      'اسم الأم',
      'العنوان',
      'المبلّغ',
      'الموظف الصارف',
      'ملاحظات',
    ];

    const rows = [
      headers,
      ...db.dispenseRecords.map((r) => [
        r.date,
        r.time,
        r.dispenseType === 'birth_male'
          ? 'مولود ذكر'
          : r.dispenseType === 'birth_female'
          ? 'مولود أنثى'
          : 'وفاة',
        r.beneficiaryName,
        r.certificateNumber,
        r.healthCardReceiptNumber,
        r.notificationNumber || '',
        r.fatherName,
        r.fatherNationalId || '',
        r.motherName,
        r.address,
        r.reporterName,
        r.dispensedBy,
        r.notes || '',
      ]),
    ];

    exportToCSV(`سجل_صرف_مكتب_صحة_سفلاق_${selectedDate}.csv`, rows);
  };

  const handleExportInventoryCSV = () => {
    const headers = [
      'اسم المستند / العهدة',
      'الفئة',
      'الوارد الإجمالي',
      'المنصرف الإجمالي',
      'الهالك والتالف',
      'الرصيد الحالي المتاح',
      'وحدة القياس',
      'آخر تحديث',
    ];

    const rows = [
      headers,
      ...(Object.values(db.stocks) as import('../types').StockItem[]).map((s) => [
        s.name,
        s.category,
        s.totalReceived.toString(),
        s.totalDispensed.toString(),
        s.damagedOrCancelled.toString(),
        s.currentStock.toString(),
        s.unit,
        s.lastUpdated,
      ]),
    ];

    exportToCSV(`كشف_جرد_أرصدة_مكتب_صحة_سفلاق_${selectedDate}.csv`, rows);
  };

  const handleExportLateRegCSV = () => {
    const headers = [
      'رقم الاستمارة',
      'تاريخ التقديم',
      'النوع',
      'اسم صاحب القيد',
      'تاريخ الواقعة',
      'مقدم الطلب',
      'الرقم القومي لمقدم الطلب',
      'الهاتف',
      'سبب التأخير',
      'الملاحظات المدونة',
      'الحالة',
      'الموظف المختص',
    ];

    const rows = [
      headers,
      ...db.lateRegistrations.map((l) => [
        l.formNumber,
        l.submissionDate,
        l.type === 'birth' ? 'ساقط قيد ميلاد' : 'ساقط قيد وفاة',
        l.personName,
        l.eventDate,
        l.applicantName,
        l.applicantNationalId,
        l.applicantPhone,
        l.delayReason,
        l.notes,
        l.status,
        l.staffName,
      ]),
    ];

    exportToCSV(`سجل_استمارات_ساقط_قيد_سفلاق_${selectedDate}.csv`, rows);
  };

  // JSON File Import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        const success = importDatabaseBackup(content);
        if (success) {
          setImportStatus('تمت استعادة النسخة الاحتياطية بنجاح وتحديث كافة السجلات!');
          const fresh = JSON.parse(localStorage.getItem('saflaq_health_office_db_v1') || '{}');
          onDatabaseUpdate(fresh);
        } else {
          setImportStatus('عفواً، الملف غير متوافق أو تالف. يرجى اختيار ملف نسخة احتياطية صالح.');
        }
      }
    };
    reader.readAsText(file);
  };

  const handleReset = async () => {
    if (confirm('تحذير شديد: هل أنت متأكد من إعادة ضبط المصنع والتصفير الشامل لكافة السجلات والأرصدة؟ سيتم تصفير الأرصدة إلى 0 وحذف كافة الحركات.')) {
      try {
        const result = await performFactoryReset({
          resetBy: db.officeSettings?.currentEmployee || 'كاتب صحة سفلاق',
          reason: 'تصفير شامل وإعادة ضبط المصنع من شاشة التقارير والنسخ الاحتياطي',
          preserveOfficeSettings: true,
        });
        onDatabaseUpdate(result.database);
        alert(result.message);
      } catch (err: any) {
        console.error('Factory reset error:', err);
        alert('حدث خطأ أثناء التصفير الشامل: ' + (err?.message || 'خطأ غير معروف'));
      }
    }
  };

  // Download Windows Batch Launcher (.bat)
  const handleDownloadBatchLauncher = () => {
    const batContent = `@echo off
chcp 65001 > nul
title تشغيل برنامج مكتب صحة سفلاق
echo ======================================================
echo    مكتب صحة سفلاق - منظومة الأرصدة وساقط القيد
echo    يعمل 100% بدون اتصال بالإنترنت
echo ======================================================
start "" "${window.location.href}"
exit
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'تشغيل_برنامج_مكتب_صحة_سفلاق.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* SECTION 1: DAILY REGISTER */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-5 h-5 text-emerald-700" />
            <div>
              <h3 className="font-bold text-base text-slate-900">
                دفتر يومية صرف المواليد والوفيات
              </h3>
              <p className="text-xs text-slate-500">
                كشف حركة التسجيل اليومي لمكتب صحة سفلاق
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-slate-700">اختر التاريخ:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold font-mono text-slate-800"
            />
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة اليومية</span>
            </button>
          </div>
        </div>

        {dailyDispenses.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            لا توجد أية معاملات مسجلة في هذا اليوم ({selectedDate}).
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-2.5 px-3">الوقت</th>
                  <th className="py-2.5 px-3">اسم المستفيد</th>
                  <th className="py-2.5 px-3">النوع</th>
                  <th className="py-2.5 px-3">رقم الشهادة</th>
                  <th className="py-2.5 px-3">رقم إيصال البطاقة</th>
                  <th className="py-2.5 px-3">اسم الأب</th>
                  <th className="py-2.5 px-3">المبلّغ</th>
                  <th className="py-2.5 px-3 text-center">إيصال</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {dailyDispenses.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-2.5 px-3 font-mono text-xs text-slate-600">{r.time}</td>
                    <td className="py-2.5 px-3 font-bold text-slate-900">{r.beneficiaryName}</td>
                    <td className="py-2.5 px-3">
                      {r.dispenseType === 'birth_male' && 'مولود ذكر'}
                      {r.dispenseType === 'birth_female' && 'مولود أنثى'}
                      {r.dispenseType === 'death' && 'وفاة'}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-emerald-800">{r.certificateNumber}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-700">{r.healthCardReceiptNumber}</td>
                    <td className="py-2.5 px-3 text-slate-600">{r.fatherName || '—'}</td>
                    <td className="py-2.5 px-3 text-slate-600">{r.reporterName}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => onSelectPrintRecord(r)}
                        className="px-2 py-1 rounded bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 font-bold text-xs"
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

      {/* SECTION 2: EXCEL & CSV EXPORTS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          <div>
            <h3 className="font-bold text-base text-slate-900">
              تصدير السجلات إلى جداول Excel (CSV عربي متوافق)
            </h3>
            <p className="text-xs text-slate-500">
              تصدير كشوفات البيانات للفتح المباشر في Microsoft Excel مع ترميز النصوص العربية
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleExportDispenseCSV}
            className="flex items-center justify-between p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-emerald-900 font-bold text-xs md:text-sm transition cursor-pointer"
          >
            <span>تصدير سجل المنصرف (Excel)</span>
            <Download className="w-4 h-4 text-emerald-700" />
          </button>

          <button
            onClick={handleExportInventoryCSV}
            className="flex items-center justify-between p-3.5 rounded-xl border border-teal-200 bg-teal-50/50 hover:bg-teal-50 text-teal-900 font-bold text-xs md:text-sm transition cursor-pointer"
          >
            <span>تصدير كشف جرد الأرصدة (Excel)</span>
            <Download className="w-4 h-4 text-teal-700" />
          </button>

          <button
            onClick={handleExportLateRegCSV}
            className="flex items-center justify-between p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 hover:bg-blue-50 text-blue-900 font-bold text-xs md:text-sm transition cursor-pointer"
          >
            <span>تصدير استمارات ساقط القيد (Excel)</span>
            <Download className="w-4 h-4 text-blue-700" />
          </button>
        </div>
      </div>

      {/* SECTION 3: BACKUP & RESTORE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
          <HardDrive className="w-5 h-5 text-emerald-700" />
          <div>
            <h3 className="font-bold text-base text-slate-900">
              النسخ الاحتياطي والأمان واستعادة البيانات
            </h3>
            <p className="text-xs text-slate-500">
              حفظ نسخة كاملة من قاعدة بيانات مكتب صحة سفلاق على فلاشة أو قرص خارجي
            </p>
          </div>
        </div>

        {importStatus && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importStatus}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">حفظ نسخة احتياطية (Backup)</h4>
            <p className="text-xs text-slate-500">
              تنزيل ملف JSON يحتوي على كافة الأرصدة، وسجل حركات التوريد، والمنصرف، واستمارات ساقط القيد والملاحظات.
            </p>
            <button
              onClick={exportDatabaseBackup}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>تنزيل ملف النسخة الاحتياطية (.JSON)</span>
            </button>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <h4 className="font-bold text-slate-800 text-sm">استعادة نسخة سابقة (Restore)</h4>
            <p className="text-xs text-slate-500">
              استرجاع بياناتك من ملف نسخة احتياطية سابق تم حفظه على الكمبيوتر.
            </p>
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>اختيار ملف واستعادة البيانات</span>
            </button>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={handleReset}
            className="text-xs text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>إعادة ضبط المصنع (حذف التعديلات والبدء من جديد)</span>
          </button>
        </div>
      </div>

      {/* SECTION 4: OFFLINE DESKTOP EXE & LAUNCHER INFO */}
      <div className="bg-gradient-to-l from-slate-900 to-emerald-950 text-white rounded-2xl p-5 md:p-6 shadow-md space-y-3">
        <div className="flex items-center gap-2">
          <Laptop className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold text-base">
            التشغيل بدون إنترنت والتثبيت المكتبي على الكمبيوتر (Windows Desktop / EXE)
          </h3>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed max-w-3xl">
          التطبيق مجهز للعمل بدون اتصال بالإنترنت تماماً، ويمكن تشغيله وتثبيته على كمبيوتر مكتب صحة سفلاق كبرنامج مستقل يظهر على شريط المهام وسطح المكتب دون الحاجة لمتصفح الإنترنت التقليدي.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadBatchLauncher}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer transition"
          >
            <Download className="w-4 h-4" />
            <span>تنزيل ملف تشغيل سطح المكتب السريع (.bat)</span>
          </button>

          <span className="text-xs text-emerald-200">
            أو استخدم زر "تثبيت البرنامج على الكمبيوتر" الموجود في الشريط العلوي.
          </span>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Trash2,
  CheckCircle2,
  Info,
  Layers,
  Database,
  Search,
  Eye,
  X,
  ArrowDownLeft,
  FileText
} from 'lucide-react';
import { DatabaseSchema, IntegrityReport, StockCategory, CATEGORY_LABELS } from '../types';
import { runFullIntegrityCheck } from '../services/stockService';
import {
  diagnoseDatabase,
  safelyPurgeDuplicateTransactions,
  getSuspectedDemoRecords,
  purgeSingleSuspectedRecord,
  SuspectedRecord
} from '../storage/repairEngine';
import { getPendingQueue } from '../storage/syncManager';

interface DiagnosticsScreenProps {
  db: DatabaseSchema;
  onRefreshDb: () => void;
}

export const DiagnosticsScreen: React.FC<DiagnosticsScreenProps> = ({ db, onRefreshDb }) => {
  const [report, setReport] = useState<IntegrityReport>(() => runFullIntegrityCheck(db));
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [suspectedRecords, setSuspectedRecords] = useState<SuspectedRecord[]>(() => getSuspectedDemoRecords(db));
  const [selectedRecordForReview, setSelectedRecordForReview] = useState<SuspectedRecord | null>(null);
  const [adjustStockOnPurge, setAdjustStockOnPurge] = useState<boolean>(true);

  const pendingQueue = getPendingQueue();

  const handleRunScan = () => {
    const fresh = runFullIntegrityCheck(db);
    setReport(fresh);
    setSuspectedRecords(getSuspectedDemoRecords(db));
    setActionMessage('تم تحديث تقرير النزاهة وتدقيق الأرصدة بنجاح.');
    setTimeout(() => setActionMessage(null), 3000);
  };

  const handlePurgeDuplicates = () => {
    const res = safelyPurgeDuplicateTransactions(db, db.officeSettings?.currentEmployee || 'مدير النظام');
    onRefreshDb();
    const fresh = runFullIntegrityCheck(db);
    setReport(fresh);
    setSuspectedRecords(getSuspectedDemoRecords(db));
    setActionMessage(`تم تنظيف المعاملات المكررة بأمان (تم إزالة ${res.removedSupplies} توريد و ${res.removedDispenses} صرف مكرر) مع حماية الرصيد الفعلي.`);
  };

  const handleConfirmSinglePurge = () => {
    if (!selectedRecordForReview) return;
    const res = purgeSingleSuspectedRecord(
      db,
      selectedRecordForReview.id,
      selectedRecordForReview.type,
      adjustStockOnPurge,
      db.officeSettings?.currentEmployee || 'مدير النظام'
    );
    onRefreshDb();
    const fresh = runFullIntegrityCheck(db);
    setReport(fresh);
    setSuspectedRecords(getSuspectedDemoRecords(db));
    setSelectedRecordForReview(null);
    setActionMessage(res.message);
  };

  const duplicateIssues = report.issues.filter(i => i.code === 'DUPLICATE_TRANSACTION');

  return (
    <div className="space-y-6" id="diagnostics-view">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            report.hasErrors ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            {report.hasErrors ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              تدقيق وفحص نزاهة الأرصدة (Integrity Audit & Diagnostics)
            </h2>
            <p className="text-xs text-slate-500">
              فحص شامل لمطابقة الرصيد الفعلي مع الحسابات الدفترية واكتشاف التكرارات والتناقضات وحماية البيانات
            </p>
          </div>
        </div>

        <button
          id="btn-re-run-scan"
          onClick={handleRunScan}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <RefreshCw className="w-4 h-4" />
          <span>إعادة الفحص الآن</span>
        </button>
      </div>

      {actionMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">حالة المنظومة الإجمالية</span>
          <div className="mt-2 flex items-center gap-2">
            {report.criticalIssues === 0 ? (
              <span className="text-emerald-700 font-bold text-base flex items-center gap-1.5">
                <ShieldCheck className="w-5 h-5" /> لا توجد أخطاء حرجة
              </span>
            ) : (
              <span className="text-rose-700 font-bold text-base flex items-center gap-1.5">
                <AlertTriangle className="w-5 h-5" /> ({report.criticalIssues}) أخطاء حرجة
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">فروق المطابقة النظرية</span>
          <div className="mt-2 text-xl font-bold text-slate-800">
            {report.warningIssues} <span className="text-xs font-normal text-slate-500">أصناف بها فروق جرد</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">سجلات مشتبه بها للمراجعة</span>
          <div className="mt-2 text-xl font-bold text-slate-800">
            {suspectedRecords.length} <span className="text-xs font-normal text-slate-500">سجل يحتاج قراراً</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 block">طابور المزامنة المعلق</span>
          <div className="mt-2 text-xl font-bold text-teal-700">
            {pendingQueue.length} <span className="text-xs font-normal text-slate-500">حركة معلقة</span>
          </div>
        </div>
      </div>

      {/* Category Audit Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-2">
          مقارنة الرصيد الفعلي المحمي مع الحساب النظري الدفتري
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          وفقاً للميثاق الرقابي الصارم (Rule 4): الرصيد الفعلي لا يتم تعديله تلقائياً بأي حال، والفارق يعرض فقط للمراجعة الرسمية والتسوية اليدوية.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                <th className="py-2.5 px-3">الصنف / المستند</th>
                <th className="py-2.5 px-3 text-center bg-teal-50/60 text-teal-900 font-bold">الرصيد الفعلي الحالي (المحمي)</th>
                <th className="py-2.5 px-3 text-center">أول المدة</th>
                <th className="py-2.5 px-3 text-center">الوارد</th>
                <th className="py-2.5 px-3 text-center">المنصرف</th>
                <th className="py-2.5 px-3 text-center">تالف/محضر</th>
                <th className="py-2.5 px-3 text-center text-slate-600">الحساب النظري</th>
                <th className="py-2.5 px-3 text-center">الفارق</th>
                <th className="py-2.5 px-3 text-center">حالة النزاهة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.categoryAudits.map((a) => (
                <tr key={a.category} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-semibold text-slate-900">{CATEGORY_LABELS[a.category]}</td>
                  <td className="py-2.5 px-3 text-center font-black text-teal-900 bg-teal-50/30 text-base">
                    {a.currentStock}
                  </td>
                  <td className="py-2.5 px-3 text-center text-slate-600">{a.openingStock}</td>
                  <td className="py-2.5 px-3 text-center text-emerald-700 font-semibold">+{a.totalReceived}</td>
                  <td className="py-2.5 px-3 text-center text-rose-700 font-semibold">-{a.totalDispensed}</td>
                  <td className="py-2.5 px-3 text-center text-amber-700">{a.damagedOrCancelled}</td>
                  <td className="py-2.5 px-3 text-center font-bold text-slate-700">{a.theoreticalStock}</td>
                  <td className="py-2.5 px-3 text-center font-bold">
                    {a.difference === 0 ? (
                      <span className="text-slate-400">0</span>
                    ) : (
                      <span className={a.difference > 0 ? 'text-blue-700' : 'text-rose-700'}>
                        {a.difference > 0 ? `+${a.difference}` : a.difference}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    {a.isBalanced ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>متطابق</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300">
                        <AlertTriangle className="w-3 h-3" />
                        <span>غير متطابق</span>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspected Records Review Section (Rule 27) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              السجلات المشتبه بها للمراجعة والتدقيق اليدوي (Suspected Demo Records)
            </h3>
            <p className="text-xs text-slate-500">
              قاعدة رقم 27: يمنع حذف أي سجل تجريبي تلقائياً دون مراجعة وقرار يدوي صريح من الموظف المسؤول مع تحديد الأثر على الرصيد.
            </p>
          </div>
        </div>

        {suspectedRecords.length === 0 ? (
          <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 p-4 rounded-xl border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>قاعدة البيانات نظيفة تماماً - لا توجد أي سجلات تجريبية أو مشبوهة.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <th className="py-2.5 px-3">النوع</th>
                  <th className="py-2.5 px-3">التفاصيل / البيان</th>
                  <th className="py-2.5 px-3">الصنف</th>
                  <th className="py-2.5 px-3 text-center">الكمية</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">سبب الاشتباه</th>
                  <th className="py-2.5 px-3 text-center">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suspectedRecords.map((rec) => (
                  <tr key={rec.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-semibold">
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        rec.type === 'supply' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {rec.type === 'supply' ? 'توريد وارد' : 'صرف مواطن'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{rec.title}</td>
                    <td className="py-2.5 px-3 text-slate-700">{rec.categoryLabel}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-slate-800">{rec.quantity}</td>
                    <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{rec.date}</td>
                    <td className="py-2.5 px-3 text-amber-700 text-[11px] font-medium">{rec.suspicionReason}</td>
                    <td className="py-2.5 px-3 text-center">
                      <button
                        onClick={() => setSelectedRecordForReview(rec)}
                        className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>مراجعة وقرار</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Review & Manual Purge Modal */}
      {selectedRecordForReview && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <span>مراجعة السجل المشتبه به واتخاذ قرار يدوي</span>
              </h4>
              <button
                onClick={() => setSelectedRecordForReview(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs sm:text-sm">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">نوع الحركة:</span>
                  <span className="font-bold text-slate-800">
                    {selectedRecordForReview.type === 'supply' ? 'توريد وارد' : 'صرف مواطن'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الصنف:</span>
                  <span className="font-bold text-slate-800">{selectedRecordForReview.categoryLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الكمية:</span>
                  <span className="font-bold text-slate-800">{selectedRecordForReview.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">التاريخ:</span>
                  <span className="font-mono text-slate-700">{selectedRecordForReview.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">البيان:</span>
                  <span className="font-medium text-slate-800">{selectedRecordForReview.title}</span>
                </div>
                <div className="flex justify-between text-amber-800">
                  <span>سبب الاشتباه:</span>
                  <span className="font-bold">{selectedRecordForReview.suspicionReason}</span>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
                <span className="font-bold text-amber-900 block">حدد أثر الحذف على الرصيد الفعلي الحالي:</span>
                <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                  <input
                    type="radio"
                    name="adjustStockChoice"
                    checked={adjustStockOnPurge}
                    onChange={() => setAdjustStockOnPurge(true)}
                    className="text-teal-600 focus:ring-teal-500"
                  />
                  <span>
                    عكس أثر الحركة على الرصيد الفعلي (
                    {selectedRecordForReview.type === 'supply'
                      ? `خصم ${selectedRecordForReview.quantity} من الرصيد الفعلي`
                      : `استعادة ${selectedRecordForReview.quantity} إلى الرصيد الفعلي`}
                    )
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-800">
                  <input
                    type="radio"
                    name="adjustStockChoice"
                    checked={!adjustStockOnPurge}
                    onChange={() => setAdjustStockOnPurge(false)}
                    className="text-teal-600 focus:ring-teal-500"
                  />
                  <span>حذف السجل فقط مع الإبقاء على الرصيد الفعلي الحالي دون تعديل</span>
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setSelectedRecordForReview(null)}
                className="px-4 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmSinglePurge}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs"
              >
                تأكيد الحذف اليدوي وتوثيقه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Safe Authorized Actions */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-2">
          إجراءات الصيانة والتنظيف الآمنة (Safe Maintenance)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          يسمح النظام بتنظيف المعاملات المكررة بأمان (Keeping verified transaction) دون المساس بالأرصدة الفعلية للمكتب.
        </p>

        <div className="flex flex-wrap gap-3">
          {duplicateIssues.length > 0 ? (
            <button
              onClick={handlePurgeDuplicates}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all"
            >
              <Trash2 className="w-4 h-4" />
              <span>تنظيف المعاملات المكررة ({duplicateIssues.length})</span>
            </button>
          ) : (
            <div className="text-xs text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200">
              <CheckCircle2 className="w-4 h-4" />
              <span>لا توجد معاملات مكررة تحتاج إلى تنظيف</span>
            </div>
          )}
        </div>
      </div>

      {/* Detailed Issues List */}
      {report.issues.length > 0 && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
          <h3 className="text-base font-bold text-slate-900 mb-4">
            قائمة التنبيهات المكتشفة بالتفصيل ({report.issues.length})
          </h3>
          <div className="space-y-3">
            {report.issues.map((issue) => (
              <div
                key={issue.id}
                className={`p-4 rounded-xl border text-xs sm:text-sm ${
                  issue.severity === 'critical'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{issue.title}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/70 border">
                      {issue.code}
                    </span>
                  </div>
                  <span className="text-[10px] opacity-70">
                    {new Date(issue.detectedAt).toLocaleTimeString('ar-EG')}
                  </span>
                </div>
                <p className="mt-1.5 opacity-90 leading-relaxed">
                  {issue.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

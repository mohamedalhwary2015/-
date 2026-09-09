import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AppDatabase, StockCategory } from '../types';
import { getDatabase } from '../storage/db';
import { 
  compareOfflineAndOnlineDatabases, 
  executeProductionRepair, 
  ProductionRepairReport, 
  ItemAuditRow, 
  isKnownDemoOrSeedTransaction 
} from '../storage/repairEngine';
import { getStoredSnapshotsFromIDB } from '../storage/syncManager';
import { getApiAuthHeaders } from '../storage/apiAuth';
import {
  Wrench,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Download,
  Copy,
  RefreshCw,
  Layers,
  Database,
  Upload,
  ArrowRight,
  Sparkles,
  Info,
  Check,
  X
} from 'lucide-react';

interface ProductionDataRepairModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLocalDb?: AppDatabase;
  onDatabaseRepaired?: (newDb: AppDatabase) => void;
  onRepairApplied?: (newDb: AppDatabase) => void;
}

export const ProductionDataRepairModal: React.FC<ProductionDataRepairModalProps> = ({
  isOpen,
  onClose,
  currentLocalDb,
  onDatabaseRepaired,
  onRepairApplied,
}) => {
  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'overview' | 'supplies' | 'dispenses' | 'balances' | 'report' | 'execute'>('overview');

  // Offline source selection
  const [offlineSourceType, setOfflineSourceType] = useState<'current_local' | 'idb_snapshot' | 'uploaded_file'>('current_local');
  const [offlineDb, setOfflineDb] = useState<AppDatabase>(() => currentLocalDb || getDatabase());
  const [onlineDb, setOnlineDb] = useState<AppDatabase | null>(null);
  const [isLoadingOnline, setIsLoadingOnline] = useState<boolean>(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  // Available IDB snapshots
  const [idbSnapshots, setIdbSnapshots] = useState<Array<{ id: string | number; timestamp: string; trigger: string; totalRecords?: number; recordsCount?: number; data: AppDatabase }>>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | number | null>(null);

  // Excluded ID selection for repair (defaulting to confirmed bogus/demo items)
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionResult, setExecutionResult] = useState<{ success: boolean; message: string; removedCount: number } | null>(null);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load online database and IDB snapshots on open
  useEffect(() => {
    if (!isOpen) return;

    const effectiveLocal = currentLocalDb || getDatabase();
    setOfflineDb(effectiveLocal);

    // Fetch IDB snapshots
    getStoredSnapshotsFromIDB().then((snaps) => {
      setIdbSnapshots(snaps || []);
    }).catch(() => {});

    // Fetch Online database
    setIsLoadingOnline(true);
    setOnlineError(null);
    fetch('/api/sync?t=' + Date.now(), {
      headers: getApiAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('فشل استرداد بيانات السحابة Online');
        return res.json();
      })
      .then((data) => {
        if (data.success && data.database) {
          setOnlineDb(data.database);
        } else {
          setOnlineDb(effectiveLocal);
        }
      })
      .catch((err) => {
        console.warn('Could not fetch online database:', err);
        setOnlineError('تعذر الاتصال المباشر بقاعدة البيانات المركزية، سيتم اعتماد النسخة المحلية كمرجع.');
        setOnlineDb(effectiveLocal);
      })
      .finally(() => {
        setIsLoadingOnline(false);
      });
  }, [isOpen, currentLocalDb]);

  // Generate Comparison Report whenever offlineDb or onlineDb changes
  const auditReport: ProductionRepairReport | null = useMemo(() => {
    if (!offlineDb || !onlineDb) return null;
    return compareOfflineAndOnlineDatabases(offlineDb, onlineDb);
  }, [offlineDb, onlineDb]);

  // Initialize default excluded IDs (only confirmed bogus update generated items)
  useEffect(() => {
    if (!auditReport) return;
    const initialExcluded = new Set<string>();
    auditReport.supplyRows.forEach((s) => {
      if (s.classification === 'bogus_update_generated') {
        initialExcluded.add(s.id);
        if (s.transactionId) initialExcluded.add(s.transactionId);
      }
    });
    auditReport.dispenseRows.forEach((d) => {
      if (d.classification === 'bogus_update_generated') {
        initialExcluded.add(d.id);
        if (d.transactionId) initialExcluded.add(d.transactionId);
      }
    });
    setExcludedIds(initialExcluded);
  }, [auditReport]);

  if (!isOpen) return null;

  // Toggle item exclusion
  const handleToggleExclude = (id: string, txId?: string) => {
    const updated = new Set(excludedIds);
    if (updated.has(id) || (txId && updated.has(txId))) {
      updated.delete(id);
      if (txId) updated.delete(txId);
    } else {
      updated.add(id);
      if (txId) updated.add(txId);
    }
    setExcludedIds(updated);
  };

  // Select Snapshot from IDB
  const handleSelectSnapshot = (snapId: string | number) => {
    const snap = idbSnapshots.find((s) => s.id === snapId);
    if (snap && snap.data) {
      setSelectedSnapshotId(snapId);
      setOfflineDb(snap.data);
      setOfflineSourceType('idb_snapshot');
    }
  };

  // Upload Offline Backup File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text) as AppDatabase;
        if (parsed && parsed.stocks) {
          setOfflineDb(parsed);
          setOfflineSourceType('uploaded_file');
        } else {
          alert('الملف غير صالح كقاعدة بيانات لمكتب الصحة.');
        }
      } catch {
        alert('حدث خطأ أثناء قراءة ملف النسخة الاحتياطية.');
      }
    };
    reader.readAsText(file);
  };

  // Copy Markdown Report
  const handleCopyReport = () => {
    if (!auditReport) return;
    navigator.clipboard.writeText(auditReport.markdownReport);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 3000);
  };

  // Download Markdown Report
  const handleDownloadReport = () => {
    if (!auditReport) return;
    const blob = new Blob([auditReport.markdownReport], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PRODUCTION_DATA_REPAIR_REPORT_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Execute Repair
  const handleExecuteRepair = async () => {
    if (!auditReport || !onlineDb) return;
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const res = await executeProductionRepair(offlineDb, onlineDb, auditReport, excludedIds);
      setExecutionResult(res);
      if (res.success) {
        if (onDatabaseRepaired) onDatabaseRepaired(res.cleanedDatabase);
        if (onRepairApplied) onRepairApplied(res.cleanedDatabase);
      }
    } catch (err: any) {
      setExecutionResult({
        success: false,
        message: err.message || 'حدث خطأ أثناء تنفيذ عملية الإصلاح',
        removedCount: 0,
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden my-auto">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                مركز استعادة وتصحيح بيانات الإنتاج
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-medium">
                  المرجع الأساسي: Offline
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مطابقة البيانات الفعلية، إزالة التوريدات والحركات الوهمية الناتجة عن التحديث، وإعادة بناء الأرصدة رياضياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            المراحل والمصدر المرجعي
          </button>
          <button
            onClick={() => setActiveTab('supplies')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'supplies'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            تدقيق التوريدات
            {auditReport && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                {auditReport.supplyRows.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('dispenses')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'dispenses'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            تدقيق حركات الصرف
            {auditReport && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">
                {auditReport.dispenseRows.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('balances')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'balances'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            إعادة بناء الأرصدة رياضياً
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'report'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            تقرير الإصلاح الشامل
          </button>
          <button
            onClick={() => setActiveTab('execute')}
            className={`py-3 px-4 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
              activeTab === 'execute'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            تنفيذ الاعتماد والتطهير
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* TAB 1: OVERVIEW & SOURCE SELECTION */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Safety notice */}
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
                <ShieldAlert className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    ضمانة عدم التدمير والحماية التامة لبيانات الإنتاج
                  </h3>
                  <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                    النظام لا يقوم بأي مسح شامل (DROP/TRUNCATE) ولا يقوم بتصفير الحركات الحقيقية. يتم فقط فرز التوريدات والحركات الوهمية التي تم حقنها بواسطة التحديث، مع تثبيت نسخة احتياطية فورية قبل أي خطوة.
                  </p>
                </div>
              </div>

              {/* Source Selection Card */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-4">
                <h3 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-emerald-600" />
                  المرحلة 3: تحديد النسخة المرجعية الأساسية (Offline Source of Truth)
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Option 1: Current Local Storage */}
                  <div
                    onClick={() => {
                      setOfflineDb(currentLocalDb);
                      setOfflineSourceType('current_local');
                    }}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      offlineSourceType === 'current_local'
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">التخزين المحلي الحالي</span>
                      {offlineSourceType === 'current_local' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      بيانات الجهاز الحالية في متصفحك (LocalStorage)
                    </p>
                  </div>

                  {/* Option 2: IndexedDB Snapshot */}
                  <div
                    onClick={() => setOfflineSourceType('idb_snapshot')}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      offlineSourceType === 'idb_snapshot'
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-white">لقطات IndexedDB المحفوظة</span>
                      {offlineSourceType === 'idb_snapshot' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      لقطات دورية سابقة محفوظة بأمان في التخزين الدائم للجهاز ({idbSnapshots.length} لقطة)
                    </p>
                  </div>

                  {/* Option 3: Upload Offline File */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      offlineSourceType === 'uploaded_file'
                        ? 'border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                    }`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                      accept=".json"
                      className="hidden"
                    />
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        استيراد ملف Offline JSON
                      </span>
                      {offlineSourceType === 'uploaded_file' && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      رفع ملف نسخة احتياطية حقيقي تم تصديره مسبقاً من وضع Offline
                    </p>
                  </div>
                </div>

                {/* If Snapshot selected, show snapshot picker */}
                {offlineSourceType === 'idb_snapshot' && idbSnapshots.length > 0 && (
                  <div className="mt-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 block">
                      اختر لقطة من الذاكرة الدائمة:
                    </label>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {idbSnapshots.map((snap) => (
                        <div
                          key={snap.id}
                          onClick={() => handleSelectSnapshot(snap.id)}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs cursor-pointer ${
                            selectedSnapshotId === snap.id
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200 font-bold'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span>{new Date(snap.timestamp).toLocaleString('ar-EG')}</span>
                            <span className="px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px]">
                              {snap.trigger}
                            </span>
                          </div>
                          <span>{snap.recordsCount} حركة</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status & Summary Cards */}
              {auditReport && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs text-slate-500 block mb-1">حركات فعلية صحيحة</span>
                    <span className="text-2xl font-black text-emerald-600">{auditReport.auditSummary.validCount}</span>
                    <span className="text-[10px] text-slate-400 block mt-1">موجودة في الجهتين ومعتمدة</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs text-slate-500 block mb-1">حركات للمزامنة للسحابة</span>
                    <span className="text-2xl font-black text-blue-600">{auditReport.auditSummary.missingOnlineCount}</span>
                    <span className="text-[10px] text-slate-400 block mt-1">مدخلة محلياً ولم ترفع بعد</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs text-slate-500 block mb-1">حركات وهمية ناتجة عن التحديث</span>
                    <span className="text-2xl font-black text-rose-600">{auditReport.auditSummary.bogusGeneratedCount}</span>
                    <span className="text-[10px] text-slate-400 block mt-1">محددة للإزالة التطهيرية</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                    <span className="text-xs text-slate-500 block mb-1">حركات غير مؤكدة (محفوظة)</span>
                    <span className="text-2xl font-black text-amber-600">{auditReport.auditSummary.unconfirmedCount}</span>
                    <span className="text-[10px] text-slate-400 block mt-1">يُمنع حذفها تماماً</span>
                  </div>
                </div>
              )}

              {/* Protocol Steps Checklist */}
              <div className="p-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  مراحل خطة العمل المعتمدة (المراحل 1 - 12):
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المرحلة 1: إيقاف أي Seed أو إضافة تلقائية للبيانات</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المرحلة 2: توثيق النسخ الاحتياطية للسحابة والتخزين المحلي</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المرحلة 3-7: قراءة ومقارنة الحركات واكتشاف الوهمية منها</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المرحلة 8: إنشاء تقرير PRODUCTION_DATA_REPAIR_REPORT</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المرحلة 9-11: إزالة الوهمية وإعادة بناء الأرصدة الحسابية ومزامنتها</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>المرحلة 12: تفعيل حواجز الأمان لمنع تكرار المشكلة نهائياً</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SUPPLIES AUDIT */}
          {activeTab === 'supplies' && auditReport && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">تدقيق التوريدات (Supply Transactions)</h3>
                  <p className="text-xs text-slate-500">
                    يمكنك استعراض كل حركة توريد، والتحكم في إبقائها أو استبعادها إن ثبت أنها وهمية.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                  المجموع: {auditReport.supplyRows.length} توريد
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">الإجراء</th>
                      <th className="p-3">رقم التوريد / المستند</th>
                      <th className="p-3">الصنف</th>
                      <th className="p-3">الكمية</th>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3">المصدر</th>
                      <th className="p-3">البيان وسبب التدقيق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {auditReport.supplyRows.map((s) => {
                      const isExcluded = excludedIds.has(s.id) || (s.transactionId && excludedIds.has(s.transactionId));
                      const isBogus = s.classification === 'bogus_update_generated';
                      return (
                        <tr
                          key={s.id}
                          className={`${
                            isExcluded
                              ? 'bg-rose-50/60 dark:bg-rose-950/20 text-slate-400 line-through'
                              : isBogus
                              ? 'bg-amber-50/40 dark:bg-amber-950/20'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-3">
                            <button
                              onClick={() => handleToggleExclude(s.id, s.transactionId)}
                              className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                                isExcluded
                                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              }`}
                            >
                              {isExcluded ? 'مستبعد للإزالة' : 'محتفظ به'}
                            </button>
                          </td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{s.documentOrCertNumber}</td>
                          <td className="p-3">{s.categoryName}</td>
                          <td className="p-3 font-bold">{s.quantity}</td>
                          <td className="p-3 text-slate-500">{s.date}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                s.classification === 'valid_both' || s.classification === 'valid_offline_only'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : s.classification === 'bogus_update_generated'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                              }`}
                            >
                              {s.classification === 'valid_both' && 'فعلية متطابقة'}
                              {s.classification === 'valid_offline_only' && 'فعلية (Offline)'}
                              {s.classification === 'bogus_update_generated' && 'وهمية (تحديث/تجريبي)'}
                              {s.classification === 'online_only_suspect' && 'مشتبه بها (محتفظ بها)'}
                              {s.classification === 'duplicate' && 'مكررة'}
                              {s.classification === 'unconfirmed' && 'غير مؤكدة'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[10px] text-slate-400">{s.source}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={s.reason}>
                            {s.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: DISPENSES AUDIT */}
          {activeTab === 'dispenses' && auditReport && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">تدقيق حركات الصرف (Dispense Records)</h3>
                  <p className="text-xs text-slate-500">
                    مقارنة حركات الصرف والاستمارات المسجلة والتأكد من عدم وجود أي حركة غير حقيقية.
                  </p>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 font-semibold">
                  المجموع: {auditReport.dispenseRows.length} صرف
                </span>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">الإجراء</th>
                      <th className="p-3">رقم الشهادة / الإخطار</th>
                      <th className="p-3">الصنف الدفتري</th>
                      <th className="p-3">الكمية</th>
                      <th className="p-3">التاريخ</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3">المصدر</th>
                      <th className="p-3">البيان</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {auditReport.dispenseRows.map((d) => {
                      const isExcluded = excludedIds.has(d.id) || (d.transactionId && excludedIds.has(d.transactionId));
                      return (
                        <tr
                          key={d.id}
                          className={`${
                            isExcluded
                              ? 'bg-rose-50/60 dark:bg-rose-950/20 text-slate-400 line-through'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-3">
                            <button
                              onClick={() => handleToggleExclude(d.id, d.transactionId)}
                              className={`px-2 py-1 rounded text-[11px] font-bold transition-all ${
                                isExcluded
                                  ? 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                              }`}
                            >
                              {isExcluded ? 'مستبعد للإزالة' : 'محتفظ به'}
                            </button>
                          </td>
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{d.documentOrCertNumber}</td>
                          <td className="p-3">{d.categoryName}</td>
                          <td className="p-3 font-bold">{d.quantity}</td>
                          <td className="p-3 text-slate-500">{d.date}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                d.classification === 'valid_both' || d.classification === 'valid_offline_only'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : d.classification === 'bogus_update_generated'
                                  ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'
                                  : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                              }`}
                            >
                              {d.classification === 'valid_both' && 'فعلية متطابقة'}
                              {d.classification === 'valid_offline_only' && 'فعلية (Offline)'}
                              {d.classification === 'bogus_update_generated' && 'وهمية (تحديث/تجريبي)'}
                              {d.classification === 'online_only_suspect' && 'مشتبه بها (محتفظ بها)'}
                              {d.classification === 'duplicate' && 'مكررة'}
                              {d.classification === 'unconfirmed' && 'غير مؤكدة'}
                            </span>
                          </td>
                          <td className="p-3 font-mono text-[10px] text-slate-400">{d.source}</td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 max-w-xs truncate" title={d.reason}>
                            {d.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: BALANCES RECONSTRUCTION */}
          {activeTab === 'balances' && auditReport && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60">
                <h4 className="text-xs font-bold text-blue-900 dark:text-blue-200 mb-1">
                  المعادلة الرياضية الإلزامية لإعادة بناء الأرصدة (المرحلة 6 و 10):
                </h4>
                <p className="text-xs font-mono text-blue-800 dark:text-blue-300">
                  الرصيد الفعلي المعتمد = الرصيد الافتتاحي + التوريدات الفعلية المعتمدة - المنصرف الفعلي - التالف
                </p>
              </div>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">الصنف الدفتري</th>
                      <th className="p-3">الرصيد الافتتاحي</th>
                      <th className="p-3">الوارد الفعلي</th>
                      <th className="p-3">المنصرف الفعلي</th>
                      <th className="p-3">التالف</th>
                      <th className="p-3">الرصيد المخزن في السحابة</th>
                      <th className="p-3 font-black text-emerald-700 dark:text-emerald-400">الرصيد الفعلي المعتمد</th>
                      <th className="p-3">النتيجة والتباين</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {auditReport.stockComparisons.map((sc) => (
                      <tr key={sc.category} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{sc.categoryName}</td>
                        <td className="p-3 font-mono">{sc.openingStock}</td>
                        <td className="p-3 font-mono text-emerald-600 font-bold">+{sc.totalReceivedReal}</td>
                        <td className="p-3 font-mono text-rose-600 font-bold">-{sc.totalDispensedReal}</td>
                        <td className="p-3 font-mono text-amber-600 font-bold">-{sc.damagedOrCancelled}</td>
                        <td className="p-3 font-mono text-slate-500">{sc.onlineStoredStock}</td>
                        <td className="p-3 font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                          {sc.calculatedActualStock}
                        </td>
                        <td className="p-3">
                          {sc.hasDiscrepancy ? (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                              فارق {sc.discrepancy > 0 ? `+${sc.discrepancy}` : sc.discrepancy} (تم التصحيح رياضياً)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                              مطابق تماماً
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 5: OFFICIAL PRODUCTION_DATA_REPAIR_REPORT */}
          {activeTab === 'report' && auditReport && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                    وثيقة تقرير الإصلاح (PRODUCTION_DATA_REPAIR_REPORT)
                  </h3>
                  <p className="text-xs text-slate-500">
                    التقرير الرسمي المطلوب قبل تنفيذ أي عملية مسح أو تعديل نهائي
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopyReport}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
                  >
                    {copiedReport ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedReport ? 'تم النسخ!' : 'نسخ التقرير'}
                  </button>
                  <button
                    onClick={handleDownloadReport}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    تحميل كملف Markdown
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-200 font-mono text-xs overflow-x-auto max-h-96 whitespace-pre-wrap leading-relaxed select-all">
                {auditReport.markdownReport}
              </div>
            </div>
          )}

          {/* TAB 6: EXECUTE REPAIR */}
          {activeTab === 'execute' && (
            <div className="space-y-6 max-w-2xl mx-auto py-4">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center mx-auto mb-2">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white">
                  تأكيد اعتماد واستعادة بيانات الإنتاج
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  سيقوم النظام بأخذ نسخة احتياطية فورية تلقائية، إزالة الحركات والتوريدات الوهمية المستبعدة فقط، وتثبيت الأرصدة الرياضية الحقيقية ومزامنتها مع السحابة المركزية.
                </p>
              </div>

              {/* Summary Stats */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">حركات وهمية مستبعدة سيتم تنظيفها:</span>
                  <span className="font-black text-rose-600">{excludedIds.size} حركة</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">حركات فعلية صحيحة ستبقى محفوظة بنسبة 100%:</span>
                  <span className="font-black text-emerald-600">
                    {auditReport ? auditReport.auditSummary.validCount + auditReport.auditSummary.missingOnlineCount : 0} حركة
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs border-t border-slate-200 dark:border-slate-700 pt-2">
                  <span className="text-slate-500">طريقة احتساب الأرصدة:</span>
                  <span className="font-bold text-slate-700 dark:text-slate-300">رياضية مطابقة للواقع الدفتري</span>
                </div>
              </div>

              {executionResult && (
                <div
                  className={`p-4 rounded-xl text-xs font-semibold flex items-center gap-3 ${
                    executionResult.success
                      ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200 border border-rose-200 dark:border-rose-800'
                  }`}
                >
                  {executionResult.success ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
                  <span>{executionResult.message}</span>
                </div>
              )}

              <button
                disabled={isExecuting}
                onClick={handleExecuteRepair}
                className="w-full py-3.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    جارٍ أخذ النسخة الاحتياطية وتطبيق التصحيح المعتمد...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    اعتماد وتنفيذ الاستعادة والتصحيح النهائي
                  </>
                )}
              </button>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            منظومة مكتب صحة سفلاق | بروتوكول حماية بيانات الإنتاج المعتمدة
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};

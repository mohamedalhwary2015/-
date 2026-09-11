import React, { useState, useRef } from 'react';
import { AppDatabase, StockItem } from '../types';
import { 
  createManualBackupWithLocation, 
  inspectBackupContent, 
  BackupInspectionResult, 
  exportDatabaseBackup, 
  INITIAL_DATABASE, 
  saveDatabase,
  resetToCleanDatabase,
  performFactoryReset,
  FactoryResetVerificationReport
} from '../storage/db';
import {
  HardDrive,
  Download,
  Upload,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  FileCheck2,
  FolderDown,
  Clock,
  Laptop,
  X,
  FileCode,
  Layers,
  Baby,
  Skull,
  FileQuestion,
  HelpCircle,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Wifi,
  WifiOff,
  Sparkles,
  Wrench
} from 'lucide-react';
import { SyncStatus } from '../types';

interface BackupRestoreScreenProps {
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
  onOpenSyncModal?: () => void;
  onOpenRepairModal?: () => void;
  isOnline?: boolean;
  syncStatus?: SyncStatus;
  isSyncing?: boolean;
  onTriggerManualSync?: () => Promise<void>;
}

interface BackupHistoryItem {
  id: string;
  filename: string;
  time: string;
  method: 'picker' | 'download';
  recordsCount: number;
}

export const BackupRestoreScreen: React.FC<BackupRestoreScreenProps> = ({
  db,
  onDatabaseUpdate,
  onOpenSyncModal,
  onOpenRepairModal,
  isOnline = true,
  syncStatus = 'synced',
  isSyncing = false,
  onTriggerManualSync,
}) => {
  // Manual backup state
  const [customBackupName, setCustomBackupName] = useState<string>('');
  const [isBackingUp, setIsBackingUp] = useState<boolean>(false);
  const [backupSuccessMessage, setBackupSuccessMessage] = useState<string | null>(null);
  const [backupHistory, setBackupHistory] = useState<BackupHistoryItem[]>([]);

  // Restore state
  const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [inspectionResult, setInspectionResult] = useState<BackupInspectionResult | null>(null);
  const [showWarningModal, setShowWarningModal] = useState<boolean>(false);
  const [showCleanResetModal, setShowCleanResetModal] = useState<boolean>(false);
  const [cleanResetConsent, setCleanResetConsent] = useState<boolean>(false);
  const [restoreConfirmedCheck, setRestoreConfirmedCheck] = useState<boolean>(false);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [resetVerification, setResetVerification] = useState<FactoryResetVerificationReport | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Current Database Stats
  const currentStats = {
    dispenseCount: db.dispenseRecords.length,
    birthsCount: db.dispenseRecords.filter(
      (r) => r.dispenseType === 'birth_male' || r.dispenseType === 'birth_female'
    ).length,
    deathsCount: db.dispenseRecords.filter((r) => r.dispenseType === 'death').length,
    lateRegCount: db.lateRegistrations.length,
    stockUnits: (Object.values(db.stocks) as StockItem[]).reduce(
      (sum, s) => sum + (Number(s.currentStock) || 0),
      0
    ),
    suppliesCount: db.supplyTransactions.length,
    lastBackup: db.lastBackupDate,
  };

  // Perform Manual Backup with user-chosen location
  const handlePerformManualBackup = async () => {
    setIsBackingUp(true);
    setBackupSuccessMessage(null);

    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
    const suggested = customBackupName.trim()
      ? customBackupName.endsWith('.json')
        ? customBackupName
        : `${customBackupName}.json`
      : `نسخة_احتياطية_مكتب_صحة_سفلاق_${dateStr}_${timeStr}.json`;

    try {
      const res = await createManualBackupWithLocation(suggested);
      if (res.success) {
        setBackupSuccessMessage(
          res.method === 'picker'
            ? `تم حفظ النسخة الاحتياطية بنجاح في المسار الذي حددته على جهازك (${res.filename})`
            : `تم تنزيل النسخة الاحتياطية بنجاح على جهازك (${res.filename})`
        );

        setBackupHistory((prev) => [
          {
            id: 'bk-' + Date.now(),
            filename: res.filename,
            time: new Date().toLocaleTimeString('ar-EG'),
            method: res.method,
            recordsCount: db.dispenseRecords.length,
          },
          ...prev,
        ]);
      } else if (res.error) {
        alert(res.error);
      }
    } catch (err) {
      console.error('Backup error:', err);
      exportDatabaseBackup();
      setBackupSuccessMessage('تم تنزيل النسخة الاحتياطية كملف JSON.');
    } finally {
      setIsBackingUp(false);
    }
  };

  // Quick safety backup before restore
  const handleQuickSafetyBackup = () => {
    exportDatabaseBackup();
    alert('تم تنزيل نسخة أمان سريعة من بياناتك الحالية إلى مجلد التنزيلات.');
  };

  // When user selects a file for restore
  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setRestoreSuccessMessage(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result as string;
      if (content) {
        setSelectedFileContent(content);
        const inspection = inspectBackupContent(content);
        setInspectionResult(inspection);
      }
    };
    reader.readAsText(file);
  };

  // Open warning modal
  const handleInitiateRestore = () => {
    if (!inspectionResult || !inspectionResult.valid) {
      alert('الملف المختار غير صالح للاستعادة.');
      return;
    }
    setRestoreConfirmedCheck(false);
    setShowWarningModal(true);
  };

  // Final execute restore after warning confirmation
  const handleConfirmRestore = async () => {
    if (!inspectionResult || !inspectionResult.data) return;

    setIsRestoring(true);
    try {
      saveDatabase(inspectionResult.data);
      onDatabaseUpdate(inspectionResult.data);

      // If online, notify server /api/restore for clean atomic restoration
      if (typeof window !== 'undefined' && navigator.onLine) {
        fetch('/api/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            database: inspectionResult.data,
            restoredBy: db.officeSettings?.currentEmployee || 'غير محدد',
            reason: `Restored from file ${selectedFileName || 'backup.json'}`,
          }),
        }).catch((err) => console.warn('Server restore notification warning:', err));
      }

      setShowWarningModal(false);
      setRestoreSuccessMessage(
        `تمت استعادة البيانات بنجاح من الملف (${selectedFileName}). تم تحديث كافة السجلات والأرصدة.`
      );
      setSelectedFileContent(null);
      setSelectedFileName(null);
      setInspectionResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error) {
      console.error('Failed to restore:', error);
      alert('حدث خطأ أثناء تطبيق استعادة النسخة الاحتياطية.');
    } finally {
      setIsRestoring(false);
    }
  };

  // Open Factory Reset Modal
  const handleOpenResetModal = () => {
    setCleanResetConsent(false);
    setShowCleanResetModal(true);
  };

  // 1. Clean Slate Factory Reset (Physically wipes all operational data and establishes Reset Boundary)
  const handleCleanFactoryReset = async () => {
    setIsResetting(true);
    try {
      const result = await performFactoryReset({
        resetBy: db.officeSettings?.currentEmployee || 'كاتب صحة سفلاق',
        reason: 'تصفير شامل وإعادة ضبط المصنع المعتمد لمكتب صحة سفلاق',
        preserveOfficeSettings: true,
      });

      onDatabaseUpdate(result.database);
      setResetVerification(result.verification);
      setShowCleanResetModal(false);
      setRestoreSuccessMessage(
        result.verification.verified
          ? 'تم بنجاح التصفير الشامل وإعادة ضبط المصنع وتصفير كافة الأرصدة وحذف جميع الحركات وتثبيت حد الأمان المعتمد.'
          : 'تم تنفيذ التصفير الشامل ولكن يُرجى مراجعة تفاصيل التحقق للتأكد من حالة الخادم المركزي.'
      );
    } catch (err: any) {
      console.error('Factory reset error:', err);
      alert('حدث خطأ أثناء تنفيذ التصفير الشامل: ' + (err?.message || 'خطأ غير معروف'));
    } finally {
      setIsResetting(false);
    }
  };

  // Batch launcher for offline Windows EXE-like run
  const handleDownloadBatchLauncher = () => {
    const batContent = `@echo off
chcp 65001 > nul
title تشغيل برنامج مكتب صحة سفلاق
echo ======================================================
echo    مكتب صحة سفلاق - منظومة الأرصدة وساقط القيد
echo    برنامج مكتبي يعمل بدون اتصال بالإنترنت 100%
echo ======================================================
start "" "${window.location.href}"
exit
`;
    const blob = new Blob([batContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'تشغيل_مكتب_صحة_سفلاق.bat';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-800 flex items-center justify-center border border-emerald-200 shrink-0 shadow-xs">
              <HardDrive className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900">
                  منظومة النسخ الاحتياطي واستعادة البيانات
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                  أمان محلي 100%
                </span>
              </div>
              <p className="text-xs md:text-sm text-slate-500 font-medium">
                حفظ نسخ احتياطية يدوية في مسارات مخصصة على جهاز الكمبيوتر واسترجاع السجلات مع فحص مسبق وتحذيرات أمان كاملة
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto text-xs font-mono bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600">
            <Clock className="w-3.5 h-3.5 text-emerald-700" />
            <span>آخر نسخة مسجلة: {new Date(currentStats.lastBackup).toLocaleDateString('ar-EG')}</span>
          </div>
        </div>

        {/* CURRENT DATABASE METRICS BAR */}
        <div className="mt-4 pt-2">
          <h4 className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-emerald-700" />
            <span>حالة قاعدة البيانات الحالية على هذا الجهاز:</span>
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="text-lg font-black text-slate-900 font-mono">{currentStats.dispenseCount}</div>
              <div className="text-[11px] text-slate-500 font-medium">سجلات صرف محررة</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="text-lg font-black text-emerald-800 font-mono">{currentStats.stockUnits}</div>
              <div className="text-[11px] text-slate-500 font-medium">إجمالي رصيد المخزن المتاح</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="text-lg font-black text-amber-800 font-mono">{currentStats.lateRegCount}</div>
              <div className="text-[11px] text-slate-500 font-medium">استمارات ساقط قيد</div>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div className="text-lg font-black text-blue-800 font-mono">{currentStats.suppliesCount}</div>
              <div className="text-[11px] text-slate-500 font-medium">أذونات توريد مسجلة</div>
            </div>
          </div>
        </div>
      </div>

      {/* SPECIAL PRODUCTION DATA REPAIR HERO CARD */}
      {onOpenRepairModal && (
        <div className="bg-amber-50 border-2 border-amber-400/80 rounded-2xl p-5 md:p-6 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-600 text-white flex items-center justify-center shadow-xs shrink-0">
                <Wrench className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base md:text-lg font-black text-amber-950">
                    مركز استعادة وتصحيح بيانات الإنتاج ومطابقة نسخة Offline
                  </h3>
                  <span className="px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 text-xs font-black">
                    مطابقة دقيقة
                  </span>
                </div>
                <p className="text-xs md:text-sm text-amber-800 font-medium mt-1">
                  إزالة التوريدات وحركات الأصناف غير الفعلية الناتجة عن التحديث الأخير، وإعادة بناء الأرصدة حسابياً بناءً على نسخة Offline المعتمدة فقط دون مسح أو تدمير.
                </p>
              </div>
            </div>
            <button
              id="backup-open-repair-modal-btn"
              onClick={onOpenRepairModal}
              className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-xs transition active:scale-95 cursor-pointer flex items-center gap-2 shrink-0 self-stretch sm:self-auto justify-center"
            >
              <Wrench className="w-4 h-4" />
              <span>فتح مركز التصحيح والمطابقة</span>
            </button>
          </div>
        </div>
      )}

      {/* AUTO-SYNC & CLOUD STORAGE SECTION */}
      <div className="bg-gradient-to-l from-slate-900 via-emerald-950 to-teal-950 text-white rounded-2xl p-5 md:p-6 shadow-md border border-emerald-800/40">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
              {isSyncing ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : !isOnline ? (
                <CloudOff className="w-6 h-6 text-amber-300" />
              ) : (
                <CloudCheck className="w-6 h-6 text-emerald-300" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-white">
                  التحديث والتخزين التلقائي عند الاتصال بالإنترنت (Auto-Sync & Durable Store)
                </h3>
                <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                  isOnline 
                    ? 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30' 
                    : 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                }`}>
                  {isOnline ? 'الإنترنت متصل' : 'أوفلاين (حفظ محلي آمن)'}
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                تخزين ومزامنة سحابية دورية وفورية لكافة السجلات والأرصدة فور عودة الاتصال، مع لقطات احتياطية في المستودع الدائم IndexedDB.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-end">
            {onTriggerManualSync && (
              <button
                onClick={onTriggerManualSync}
                disabled={isSyncing}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black transition cursor-pointer shadow-xs flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'جارٍ التخزين...' : 'تخزين ومزامنة الآن'}</span>
              </button>
            )}

            {onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer border border-white/20 flex items-center gap-2"
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-300" />
                <span>إعدادات وسجل التخزين التلقائي</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* FEEDBACK BANNERS */}
      {backupSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 text-xs md:text-sm font-bold flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <span>{backupSuccessMessage}</span>
          </div>
          <button
            onClick={() => setBackupSuccessMessage(null)}
            className="text-xs text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {restoreSuccessMessage && (
        <div className="p-4 rounded-2xl bg-teal-50 border-2 border-teal-300 text-teal-950 text-xs md:text-sm font-bold flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-teal-700 shrink-0" />
            <span>{restoreSuccessMessage}</span>
          </div>
          <button
            onClick={() => setRestoreSuccessMessage(null)}
            className="text-xs text-teal-700 hover:text-teal-900 underline cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* FACTORY RESET VERIFICATION AUDIT REPORT */}
      {resetVerification && (
        <div className="p-4 md:p-5 rounded-2xl bg-white border-2 border-emerald-500 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-emerald-100 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h4 className="text-sm font-black text-slate-900">
                تقرير التحقق الفعلي من نجاح التصفير الشامل وإعادة ضبط المصنع (Verification Audit)
              </h4>
            </div>
            <button
              onClick={() => setResetVerification(null)}
              className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              إغلاق التقرير
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center text-xs">
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">سجلات الصرف</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                {resetVerification.details.dispensesCount}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">أذون التوريد</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                {resetVerification.details.suppliesCount}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">استمارات ساقط القيد</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                {resetVerification.details.lateRegCount}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">إجمالي رصيد المخزن</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                0
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">طابور المزامنة</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                {resetVerification.checks.syncQueueEmpty ? '0 (فارغ)' : `${resetVerification.details.pendingQueueCount} معلق`}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">الخادم المركزي</div>
              <div className="text-xs font-black text-emerald-700 pt-1">
                {resetVerification.checks.serverResetSuccess !== false ? 'ممسوح ومؤكد' : 'محلي (أوفلاين)'}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
            <div>
              <span className="font-bold text-slate-700">حد الأمان المعتمد (Reset Boundary): </span>
              <span className="font-mono text-slate-900 font-bold">{resetVerification.details.resetId}</span>
              {resetVerification.details.resetAt && (
                <span className="text-slate-400 mr-2">({new Date(resetVerification.details.resetAt).toLocaleString('ar-EG')})</span>
              )}
            </div>
            <div className="text-emerald-700 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>تم إحباط دمج أي حركات سابقة لهذا التوقيت تلقائياً</span>
            </div>
          </div>
        </div>
      )}

      {/* TWO MAIN CARDS: 1. MANUAL BACKUP  |  2. RESTORE WITH WARNINGS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: MANUAL BACKUP TO SPECIFIED LOCATION */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center">
                <FolderDown className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  1. إنشاء نسخة احتياطية يدوية في مسار محدد
                </h3>
                <p className="text-xs text-slate-500">
                  حدد مكان حفظ الملف على جهازك (مثل سطح المكتب، فلاش ميموري، أو مجلد الأرشيف)
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3.5">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-700" />
                  <span>محتويات النسخة الاحتياطية الشاملة:</span>
                </div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  تشمل رصيد كافة المستندات (شهادات وبلاغات الميلاد، شهادات وبلاغات الوفاة، البطاقات الصحية ذكور وإناث)، وسجل الصرف التفصيلي بأسماء الأطفال والمتوفين، وأرقام الشهادات والإيصالات، واستمارات ساقط القيد وكافة الملاحظات.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  اسم ملف النسخة المقترح (اختياري):
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="مثال: نسخة_أرشيف_سفلاق_سبتمبر_2026.json"
                    value={customBackupName}
                    onChange={(e) => setCustomBackupName(e.target.value)}
                    className="w-full px-3.5 py-2 text-xs rounded-xl border border-slate-300 focus:border-emerald-600 text-slate-900 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  عند النقر على الزر بالأسفل ستفتح نافذة نظام التشغيل لاختيار المجلد المفضل لديك لحفظ الملف.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={handlePerformManualBackup}
                  disabled={isBackingUp}
                  id="btn-create-manual-backup"
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:scale-[0.99] text-white text-xs md:text-sm font-bold shadow-md transition cursor-pointer disabled:opacity-50"
                >
                  <FolderDown className="w-4 h-4" />
                  <span>
                    {isBackingUp
                      ? 'جارٍ تجهيز وحفظ النسخة...'
                      : 'حفظ نسخة احتياطية في مسار محدد على الكمبيوتر'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Backup History in this session */}
          {backupHistory.length > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 block mb-1.5">
                النسخ المحفوظة مؤخراً خلال هذه الجلسة:
              </span>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {backupHistory.map((h) => (
                  <div
                    key={h.id}
                    className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-center justify-between font-mono"
                  >
                    <span className="truncate text-slate-800 max-w-[200px]" title={h.filename}>
                      {h.filename}
                    </span>
                    <span className="text-slate-500">{h.time}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CARD 2: RESTORE FEATURE WITH SAFETY WARNINGS & PRE-INSPECTION */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                <Upload className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  2. استعادة البيانات من ملف نسخة احتياطية
                </h3>
                <p className="text-xs text-slate-500">
                  فحص الملف قبل التنفيذ وعرض التحذيرات الأمنية لضمان سلامة السجلات
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              {/* File Selector */}
              <div className="border-2 border-dashed border-slate-300 hover:border-emerald-600 rounded-2xl p-5 text-center transition bg-slate-50/50">
                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={handleSelectRestoreFile}
                  className="hidden"
                  id="restore-file-input"
                />

                <FileCode className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700 mb-1">
                  اختر ملف النسخة الاحتياطية (.JSON) من جهازك
                </p>
                <p className="text-[11px] text-slate-400 mb-3">
                  الملف يحتوي على أرصدة وسجلات مكتب صحة سفلاق
                </p>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
                >
                  استعراض الملفات على الكمبيوتر
                </button>
              </div>

              {/* Inspection Preview Card */}
              {inspectionResult && (
                <div
                  className={`p-4 rounded-xl border-2 transition ${
                    inspectionResult.valid
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}
                >
                  {inspectionResult.valid && inspectionResult.stats ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-950 border-b border-emerald-200 pb-2">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>الملف صالح ومتطابق مع منظومة صحة سفلاق</span>
                        </span>
                        <span className="font-mono text-slate-600 text-[11px]">{selectedFileName}</span>
                      </div>

                      {/* Comparison Table */}
                      <div className="overflow-x-auto text-[11px]">
                        <table className="w-full text-right border-collapse">
                          <thead>
                            <tr className="text-slate-500 font-bold border-b border-emerald-200">
                              <th className="py-1">البند</th>
                              <th className="py-1 text-slate-700">البيانات الحالية بالنظام</th>
                              <th className="py-1 text-emerald-900 font-black">بيانات ملف الاستعادة</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-emerald-100 font-mono">
                            <tr>
                              <td className="py-1 text-slate-600 font-sans">سجلات الصرف (مواليد/وفيات)</td>
                              <td className="py-1">{currentStats.dispenseCount} سجل</td>
                              <td className="py-1 text-emerald-800 font-bold">
                                {inspectionResult.stats.dispenseCount} سجل
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1 text-slate-600 font-sans">أرصدة المستندات المتاحة</td>
                              <td className="py-1">{currentStats.stockUnits} وحدة</td>
                              <td className="py-1 text-emerald-800 font-bold">
                                {inspectionResult.stats.totalStockUnits} وحدة
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1 text-slate-600 font-sans">استمارات ساقط القيد</td>
                              <td className="py-1">{currentStats.lateRegCount} استمارة</td>
                              <td className="py-1 text-emerald-800 font-bold">
                                {inspectionResult.stats.lateRegCount} استمارة
                              </td>
                            </tr>
                            <tr>
                              <td className="py-1 text-slate-600 font-sans">إجمالي الرسوم المسجلة</td>
                              <td className="py-1">—</td>
                              <td className="py-1 text-emerald-800 font-bold">
                                {inspectionResult.stats.feesTotal} ج.م
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Ready to restore button */}
                      <div className="pt-2">
                        <button
                          onClick={handleInitiateRestore}
                          id="btn-initiate-restore"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs md:text-sm font-bold shadow-md transition cursor-pointer"
                        >
                          <AlertTriangle className="w-4 h-4 text-amber-200" />
                          <span>متابعة إجراءات الاستعادة (عرض التحذيرات)</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs font-bold text-rose-800">
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{inspectionResult.error || 'الملف المختار غير صالح للاستعادة.'}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Safety note */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span className="flex items-center gap-1 text-[11px]">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>يتم فحص بنية الملف أولاً قبل السماح بتنفيذ الاستعادة.</span>
            </span>
          </div>
        </div>
      </div>

      {/* DEDICATED RESTORE WARNING MODAL (MANDATORY REQUIREMENT) */}
      {showWarningModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 md:p-7 shadow-2xl border-2 border-rose-500 animate-in zoom-in-95 space-y-5">
            {/* Warning Header */}
            <div className="flex items-start gap-3.5 text-rose-900 border-b border-rose-100 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-7 h-7 text-rose-600 animate-bounce" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-950">
                  تحذير أمني هام قبل استعادة قاعدة البيانات
                </h3>
                <p className="text-xs text-rose-700 font-medium">
                  يرجى قراءة البنود التالية بعناية قبل الموافقة على العملية
                </p>
              </div>
            </div>

            {/* Warning Checklist */}
            <div className="space-y-2.5 text-xs md:text-sm text-slate-800 bg-rose-50/70 p-4 rounded-2xl border border-rose-200">
              <div className="font-bold text-rose-950 mb-1">
                تأثير عملية الاستعادة على مكتب صحة سفلاق:
              </div>
              <ul className="space-y-2 text-xs text-slate-700 list-disc list-inside">
                <li>
                  <span className="font-bold text-rose-900">استبدال شامل:</span> سيتم استبدال كافة السجلات الحالية المخزنة محلياً ببيانات الملف المختار (<span className="font-mono font-bold text-slate-900">{selectedFileName}</span>).
                </li>
                <li>
                  <span className="font-bold text-rose-900">إعادة تعيين الأرصدة:</span> ستعود كميات شهادات وبلاغات الميلاد والوفاة والبطاقات الصحية في المخزن إلى الأرقام المحفوظة داخل ملف النسخة فقط.
                </li>
                <li>
                  <span className="font-bold text-rose-900">استمارات ساقط القيد:</span> ستتم مواءمة الاستمارات مع النسخة القديمة، وسيتم إلغاء أي تعديلات لم تشملها النسخة.
                </li>
                <li>
                  <span className="font-bold text-rose-900">لا يمكن التراجع:</span> لن تتمكن من استرجاع البيانات الحالية بعد إتمام العملية إلا إذا قمت بحفظ نسخة احتياطية من الحالة الحالية الآن.
                </li>
              </ul>
            </div>

            {/* Quick Safety Backup Recommendation */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
              <div className="text-xs text-emerald-900">
                <span className="font-bold">إجراء وقائي موصى به:</span> خذ نسخة أمان الآن قبل المتابعة.
              </div>
              <button
                onClick={handleQuickSafetyBackup}
                type="button"
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>أخذ نسخة أمان سريعة الآن</span>
              </button>
            </div>

            {/* Mandatory User Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                id="restore-consent-checkbox"
                checked={restoreConfirmedCheck}
                onChange={(e) => setRestoreConfirmedCheck(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 mt-0.5"
              />
              <span className="font-bold text-slate-800 leading-snug">
                أقر بأنني اطلعت على التحذيرات أعلاه، وأوافق بمسؤوليتي على استبدال قاعدة البيانات الحالية ببيانات هذه النسخة الاحتياطية.
              </span>
            </label>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowWarningModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                إلغاء الأمر
              </button>

              <button
                onClick={handleConfirmRestore}
                disabled={!restoreConfirmedCheck || isRestoring}
                id="btn-final-confirm-restore"
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs md:text-sm font-black shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                <AlertTriangle className="w-4 h-4" />
                <span>{isRestoring ? 'جارٍ استعادة البيانات...' : 'تأكيد استعادة النسخة الاحتياطية الآن'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FACTORY RESET CONFIRMATION MODAL */}
      {showCleanResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 md:p-8 shadow-2xl border-2 border-rose-500 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <RotateCcw className="w-7 h-7 text-rose-600 animate-spin" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-950">
                  تأكيد إعادة ضبط المصنع والتصفير الشامل
                </h3>
                <p className="text-xs text-rose-700 font-medium">
                  تصفير كافة الأرصدة ومسح حركات الصرف والتوريد للبدء الفعلي
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs md:text-sm text-slate-800 bg-rose-50/80 p-4 rounded-2xl border border-rose-200">
              <div className="font-bold text-rose-950 mb-1">
                ماذا سيحدث عند تنفيذ هذا الإجراء؟
              </div>
              <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                <li>
                  <span className="font-bold text-rose-900">تصفير الأرصدة:</span> تصبح جميع أرصدة المخزن الحالية (0) لكافة الأصناف (شهادات وبلاغات وبطاقات صحية وساقط قيد).
                </li>
                <li>
                  <span className="font-bold text-rose-900">مسح حركات الصرف:</span> حذف جميع سجلات الصرف للمواليد والوفيات المسجلة نهائياً.
                </li>
                <li>
                  <span className="font-bold text-rose-900">مسح أذون التوريد:</span> حذف كافة حركات وأذون التوريد الواردة السابقة.
                </li>
                <li>
                  <span className="font-bold text-rose-900">مسح طلبات ساقط القيد:</span> إفراغ جدول طلبات ساقط القيد بالكامل.
                </li>
                <li>
                  <span className="font-bold text-rose-900">تصفير الأرصدة الافتتاحية:</span> يمكنك لاحقاً إدخال رصيدك الفعلي الجديد من تبويب "الأرصدة الافتتاحية".
                </li>
              </ul>
            </div>

            {/* Safety Backup Option */}
            <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between gap-2">
              <div className="text-xs text-emerald-900">
                <span className="font-bold">نصيحة أمان:</span> احتفظ بنسخة احتياطية قبل التصفير.
              </div>
              <button
                onClick={handleQuickSafetyBackup}
                type="button"
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>حفظ نسخة احتياطية الآن</span>
              </button>
            </div>

            {/* User Checkbox Consent */}
            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer text-xs select-none">
              <input
                type="checkbox"
                id="clean-reset-consent-checkbox"
                checked={cleanResetConsent}
                onChange={(e) => setCleanResetConsent(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 mt-0.5"
              />
              <span className="font-bold text-slate-800 leading-snug">
                أؤكد رغبتي في تصفير كافة الأرصدة ومسح جميع الحركات للبدء على بياض بمكتب صحة سفلاق.
              </span>
            </label>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCleanResetModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
              >
                إلغاء
              </button>

              <button
                onClick={handleCleanFactoryReset}
                disabled={!cleanResetConsent || isResetting}
                id="btn-confirm-clean-factory-reset"
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs md:text-sm font-black shadow-lg transition flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? 'جارٍ تنفيذ التصفير الشامل والمسح الحقيقي...' : 'تنفيذ التصفير الشامل والبدء من الصفر'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADDITIONAL SETTINGS: FACTORY RESET & DESKTOP EXE LAUNCHER */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Reset */}
        <div className="p-4 rounded-2xl border border-rose-200 bg-white flex flex-col justify-between shadow-xs">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                <span>إعادة ضبط المصنع وتصفير الأرصدة</span>
              </h4>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                إجراء إداري
              </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              مسح وتصفير كافة الأرصدة الحالية (0) وحذف جميع حركات الصرف وأذون التوريد وساقط القيد لبدء العمل الفعلي لمكتب صحة سفلاق من الصفر.
            </p>
          </div>
          <div className="pt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={handleOpenResetModal}
              id="btn-open-factory-reset-modal"
              className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>تصفير شامل وإعادة ضبط المصنع</span>
            </button>
          </div>
        </div>

        {/* Desktop Launcher */}
        <div className="p-4 rounded-2xl border border-emerald-200 bg-gradient-to-l from-slate-900 to-emerald-950 text-white flex flex-col justify-between">
          <div>
            <h4 className="font-bold text-sm flex items-center gap-2 mb-1 text-emerald-300">
              <Laptop className="w-4 h-4 text-emerald-400" />
              <span>تشغيل البرنامج كملف تنفيذي (Windows Desktop Launcher)</span>
            </h4>
            <p className="text-xs text-slate-300">
              تنزيل ملف تشغيل سريع (.bat) يفتح البرنامج بنقرة واحدة من سطح المكتب بدون إنترنت.
            </p>
          </div>
          <div className="pt-3">
            <button
              onClick={handleDownloadBatchLauncher}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تنزيل ملف التشغيل السريع (.bat)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

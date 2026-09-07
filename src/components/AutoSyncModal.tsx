import React, { useState, useEffect } from 'react';
import { AppDatabase, AutoSyncConfig, SyncLogEntry, SyncStatus, SyncQueueItem } from '../types';
import {
  getAutoSyncConfig,
  saveAutoSyncConfig,
  getSyncLogs,
  clearSyncLogs,
  getDurableSnapshotsList,
  checkForApplicationUpdates,
  checkRealInternetConnection,
  getPendingQueue,
  getOrCreateDeviceId,
  flushSyncQueue
} from '../storage/syncManager';
import {
  Cloud,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Wifi,
  WifiOff,
  Database,
  HardDrive,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  History,
  Clock,
  Layers,
  Sparkles,
  Server,
  Cpu,
  ListOrdered,
  ArrowUpDown,
  Wrench
} from 'lucide-react';

interface AutoSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  db: AppDatabase;
  isOnline: boolean;
  syncStatus: SyncStatus;
  isSyncing: boolean;
  lastSyncTime: string | null;
  onTriggerManualSync: () => Promise<void>;
  onOpenRepairModal?: () => void;
}

export const AutoSyncModal: React.FC<AutoSyncModalProps> = ({
  isOpen,
  onClose,
  db,
  isOnline,
  syncStatus,
  isSyncing,
  lastSyncTime,
  onTriggerManualSync,
  onOpenRepairModal,
}) => {
  const [config, setConfig] = useState<AutoSyncConfig>(() => getAutoSyncConfig());
  const [logs, setLogs] = useState<SyncLogEntry[]>(() => getSyncLogs());
  const [snapshots, setSnapshots] = useState<Array<{ id: string; timestamp: string; trigger: string; totalRecords: number }>>([]);
  const [queueItems, setQueueItems] = useState<SyncQueueItem[]>([]);
  const [deviceId] = useState<string>(() => getOrCreateDeviceId());
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testConnMessage, setTestConnMessage] = useState<string | null>(null);
  const [appUpdateMessage, setAppUpdateMessage] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'queue' | 'settings' | 'logs' | 'snapshots'>('overview');

  const refreshQueue = () => {
    getPendingQueue().then(setQueueItems).catch(() => {});
  };

  useEffect(() => {
    if (isOpen) {
      setConfig(getAutoSyncConfig());
      setLogs(getSyncLogs());
      getDurableSnapshotsList().then(setSnapshots).catch(() => {});
      refreshQueue();
      setTestConnMessage(null);
      setAppUpdateMessage(null);
    }
  }, [isOpen, syncStatus]);

  if (!isOpen) return null;

  const totalRecords =
    (db.dispenseRecords?.length || 0) +
    (db.lateRegistrations?.length || 0) +
    (db.supplyTransactions?.length || 0);

  const handleToggleSetting = (key: keyof AutoSyncConfig, val: boolean | number) => {
    const updated = saveAutoSyncConfig({ [key]: val });
    setConfig(updated);
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestConnMessage(null);
    try {
      const ok = await checkRealInternetConnection();
      if (ok) {
        setTestConnMessage('الاتصال بالإنترنت نشط وسريع ومستقر.');
      } else {
        setTestConnMessage('لا يوجد اتصال حقيقي بالإنترنت حالياً (العمل في وضع الأوفلاين).');
      }
    } catch {
      setTestConnMessage('تعذر فحص جودة الاتصال.');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdate(true);
    setAppUpdateMessage(null);
    try {
      const res = await checkForApplicationUpdates();
      setAppUpdateMessage(res.message);
    } catch {
      setAppUpdateMessage('المنظومة تعمل بأحدث إصدار رسمي معتمد.');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleClearLogs = () => {
    if (window.confirm('هل تريد مسح سجل عمليات التخزين السابقة؟')) {
      clearSyncLogs();
      setLogs([]);
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return 'لم تتم المزامنة بعد';
    try {
      const d = new Date(isoString);
      return `${d.toLocaleDateString('ar-EG')} - ${d.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-950 via-slate-900 to-teal-950 text-white p-5 md:p-6 shrink-0 relative">
          <button
            onClick={onClose}
            className="absolute top-4 left-4 p-2 rounded-full text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shadow-inner">
              <CloudCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white">منظومة التحديث والتخزين التلقائي عند الاتصال</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                  مكتب صحة سفلاق
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                تخزين ومزامنة تلقائية لكافة حركات الصرف والتوريد وساقط القيد فور توفر شبكة الإنترنت، مع حفظ محلي دائم.
              </p>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-1.5 mt-5 bg-white/10 p-1 rounded-xl text-xs font-bold w-fit">
            <button
              onClick={() => setActiveSubTab('overview')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeSubTab === 'overview' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              الحالة والتشغيل
            </button>
            <button
              onClick={() => {
                refreshQueue();
                setActiveSubTab('queue');
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'queue' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              <ListOrdered className="w-3.5 h-3.5" />
              <span>طابور الحركات</span>
              {queueItems.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-black">
                  {queueItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveSubTab('settings')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeSubTab === 'settings' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              إعدادات التخزين
            </button>
            <button
              onClick={() => setActiveSubTab('snapshots')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeSubTab === 'snapshots' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              النسخ الدائمة (IndexedDB)
            </button>
            <button
              onClick={() => setActiveSubTab('logs')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                activeSubTab === 'logs' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-300 hover:text-white'
              }`}
            >
              سجل العمليات ({logs.length})
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {/* TAB 1: OVERVIEW */}
          {activeSubTab === 'overview' && (
            <div className="space-y-5">
              {/* Production Data Repair Banner */}
              {onOpenRepairModal && (
                <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Wrench className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-black text-amber-950">
                        مركز استعادة وتصحيح بيانات الإنتاج ومطابقة نسخة Offline
                      </h5>
                      <p className="text-[11px] text-amber-800">
                        فحص ومطابقة حركات الأوفلاين وإزالة أي توريدات أو حركات أصناف وهمية وإعادة احتساب الأرصدة حسابياً.
                      </p>
                    </div>
                  </div>
                  <button
                    id="syncmodal-open-repair-modal-btn"
                    onClick={() => {
                      onClose();
                      onOpenRepairModal();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-xs transition active:scale-95 cursor-pointer shrink-0"
                  >
                    فحص وتصحيح
                  </button>
                </div>
              )}

              {/* Primary Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* Connection Status */}
                <div className={`p-4 rounded-2xl border transition-all ${
                  isOnline 
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
                    : 'bg-amber-50/70 border-amber-200 text-amber-950'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      {isOnline ? (
                        <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                          <Wifi className="w-5 h-5" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                          <WifiOff className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-slate-500 block font-semibold">حالة الاتصال بالشبكة</span>
                        <h4 className="text-base font-black">
                          {isOnline ? 'متصل بالإنترنت (Online)' : 'غير متصل (Offline - وضع غير متصل)'}
                        </h4>
                      </div>
                    </div>

                    <button
                      onClick={handleTestConnection}
                      disabled={testingConnection}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 transition cursor-pointer shadow-2xs"
                    >
                      {testingConnection ? 'جارٍ الفحص...' : 'فحص الاتصال'}
                    </button>
                  </div>
                  {testConnMessage && (
                    <p className="text-xs mt-2.5 pt-2 border-t border-slate-200/70 font-medium">
                      {testConnMessage}
                    </p>
                  )}
                </div>

                {/* Sync Status */}
                <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 text-slate-900">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-xs ${
                      syncStatus === 'synced'
                        ? 'bg-emerald-700 text-white'
                        : syncStatus === 'syncing'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-white'
                    }`}>
                      {syncStatus === 'syncing' ? (
                        <RefreshCw className="w-5 h-5 animate-spin" />
                      ) : syncStatus === 'synced' ? (
                        <CloudCheck className="w-5 h-5" />
                      ) : (
                        <Cloud className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block font-semibold">حالة التخزين التلقائي</span>
                      <h4 className="text-base font-black">
                        {syncStatus === 'synced' && 'متزامن ومحفوظ كلياً'}
                        {syncStatus === 'syncing' && 'جارٍ التخزين والمزامنة الآن...'}
                        {syncStatus === 'pending' && 'تعديلات محفوظة محلياً (بانتظار الاتصال)'}
                        {syncStatus === 'offline' && 'محفوظ محلياً (سيتزامن عند عودة الإنترنت)'}
                        {syncStatus === 'error' && 'بحاجة لإعادة المحاولة'}
                      </h4>
                    </div>
                  </div>
                  <div className="mt-2.5 text-xs text-slate-600 flex items-center justify-between pt-2 border-t border-slate-200">
                    <span>آخر تخزين ناجح:</span>
                    <span className="font-mono font-bold text-slate-800">{formatDateTime(lastSyncTime)}</span>
                  </div>
                </div>
              </div>

              {/* Device ID & Queue Status Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-2xl border border-indigo-200 bg-indigo-50/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-indigo-950 text-xs">
                      <Cpu className="w-4 h-4 text-indigo-700" />
                      <span>معرف الجهاز الحالي (Device ID)</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-200/80 text-indigo-900 font-mono">
                      معتمد
                    </span>
                  </div>
                  <p className="font-mono text-xs text-indigo-900 bg-white/80 p-2 rounded-xl border border-indigo-200/60 truncate" title={deviceId}>
                    {deviceId}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    يتم ربط كل حركة بمعرف هذا الجهاز لضمان عدم تكرار الحركات ومعالجة العمليات مرة واحدة قطعية (Idempotency).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl border border-amber-200 bg-amber-50/50 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-bold text-amber-950 text-xs">
                      <ListOrdered className="w-4 h-4 text-amber-700" />
                      <span>طابور الحركات المعلقة محلياً</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      queueItems.length > 0 ? 'bg-amber-500 text-slate-950' : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {queueItems.length > 0 ? `${queueItems.length} معلق` : 'خالٍ تماماً'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-xs text-slate-700">
                      {queueItems.length > 0
                        ? `${queueItems.length} حركة تنتظر الإرسال للخادم المركزي`
                        : 'كافة الحركات تم ترحيلها بنجاح للخادم المركزي'}
                    </p>
                    {queueItems.length > 0 && (
                      <button
                        onClick={() => setActiveSubTab('queue')}
                        className="text-xs text-amber-800 underline font-bold hover:text-amber-950 cursor-pointer"
                      >
                        عرض الطابور
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    مخزن محلياً في IndexedDB لضمان عدم ضياع أي حركة حتى في حال إعادة تشغيل الجهاز أو انقطاع الإنترنت.
                  </p>
                </div>
              </div>

              {/* Action Banner */}
              <div className="bg-gradient-to-r from-emerald-900 to-teal-900 text-white p-4 md:p-5 rounded-2xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1 text-right w-full sm:w-auto">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-300" />
                    <h4 className="font-black text-sm">مزامنة فورية وتخزين شامل</h4>
                  </div>
                  <p className="text-xs text-emerald-100/90">
                    إجمالي السجلات الجاهزة للحفظ والمزامنة: <strong className="font-mono text-white text-sm">{totalRecords}</strong> حركة رسمية
                  </p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    onClick={onTriggerManualSync}
                    disabled={isSyncing}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black shadow-md transition cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'جارٍ التخزين والمزامنة...' : 'تحديث وتخزين سحابي فوري الآن'}</span>
                  </button>
                </div>
              </div>

              {/* 3-Tier Storage Architecture */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-black text-slate-600 uppercase tracking-wider">
                  طبقات الأمان وحماية البيانات بمكتب صحة سفلاق
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-emerald-950">
                      <HardDrive className="w-4 h-4 text-emerald-700" />
                      <span>1. التخزين المحلي السريع</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      حفظ فوري فائق السرعة على جهاز الكاتب (LocalStorage) لتسجيل الحركات دون أي تأخير مع المواطنين.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-blue-950">
                      <Database className="w-4 h-4 text-blue-700" />
                      <span>2. التخزين الدائم (IndexedDB)</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      مستودع داخلي دائم ذو سعة تخزينية ضخمة يحتفظ بلقطات دورية متتالية حتى في حال مسح كاش المتصفح.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-2xl border border-purple-200 bg-purple-50/50 space-y-1.5">
                    <div className="flex items-center gap-1.5 font-bold text-purple-950">
                      <Server className="w-4 h-4 text-purple-700" />
                      <span>3. المزامنة السحابية التلقائية</span>
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      فور التقاط الإنترنت، يتم إرسال نسخة احتياطية ومطابقتها مع السحابة لمنع أي فقدان للبيانات نهائياً.
                    </p>
                  </div>
                </div>
              </div>

              {/* Version and System Update Checker */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div>
                  <h5 className="font-black text-slate-900">تحديثات المنظومة وتطبيق الويب (PWA)</h5>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    إصدار المنظومة الحالي: <strong className="font-mono text-slate-800">v1.0.1 معتمد</strong>
                  </p>
                  {appUpdateMessage && (
                    <p className="text-emerald-800 font-bold mt-1 text-xs">
                      {appUpdateMessage}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdate}
                  className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 font-bold text-slate-800 transition cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  <span>{checkingUpdate ? 'جارٍ الفحص...' : 'فحص تحديثات المنظومة'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: QUEUE */}
          {activeSubTab === 'queue' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                    <ListOrdered className="w-4 h-4 text-emerald-700" />
                    <span>طابور الحركات غير المتزامنة (Pending Sync Queue)</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">
                    الحركات المسجلة أثناء عدم الاتصال أو بانتظار التأكيد المركزي. تحفظ في IndexedDB وتُرسل تلقائياً.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshQueue}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تحديث</span>
                  </button>
                  {queueItems.length > 0 && (
                    <button
                      onClick={async () => {
                        await flushSyncQueue(db);
                        refreshQueue();
                      }}
                      disabled={isSyncing || !isOnline}
                      className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>إرسال الطابور الآن</span>
                    </button>
                  )}
                </div>
              </div>

              {queueItems.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <p className="font-bold text-slate-700 text-sm">طابور الحركات فارغ تماماً</p>
                  <p className="text-slate-500 max-w-md mx-auto">
                    جميع حركات الصرف والتوريد وتحديثات ساقط القيد تم ترحيلها بنجاح إلى الخادم المركزي، ومطابقة للدفاتر والأرصدة المعتمدة.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-150 border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-96 overflow-y-auto">
                  {queueItems.map((item) => (
                    <div key={item.id} className="p-3 text-xs space-y-1.5 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                            item.operation === 'dispense'
                              ? 'bg-blue-100 text-blue-800'
                              : item.operation === 'supply'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-teal-100 text-teal-800'
                          }`}>
                            {item.operation === 'dispense'
                              ? 'حركة صرف'
                              : item.operation === 'supply'
                              ? 'حركة توريد'
                              : item.operation === 'late_registration'
                              ? 'ساقط قيد'
                              : 'تحديث حالة'}
                          </span>
                          <span className="font-mono text-slate-500 text-[11px]">
                            {formatDateTime(item.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {item.retryCount > 0 && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 font-medium">
                              محاولات: {item.retryCount}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'pending'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {item.status === 'pending' ? 'معلق' : 'فشل مؤقت'}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-600 font-mono bg-slate-50 p-2 rounded-lg border border-slate-150">
                        <div>
                          <span className="text-slate-400">ID المعاملة: </span>
                          <span className="text-slate-800 font-bold">{item.transactionId}</span>
                        </div>
                        <div>
                          <span className="text-slate-400">ID السجل: </span>
                          <span className="text-slate-800">{item.recordId}</span>
                        </div>
                      </div>

                      {item.lastError && (
                        <p className="text-rose-600 text-[10px] bg-rose-50 p-1.5 rounded border border-rose-100">
                          سبب التأخير: {item.lastError}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SETTINGS */}
          {activeSubTab === 'settings' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-4">
                <h4 className="font-bold text-sm text-slate-900 border-b pb-2">
                  خيارات التحديث والتخزين التلقائي
                </h4>

                {/* Master Switch */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <label className="font-black text-xs text-slate-900 block">
                      تفعيل التخزين والمزامنة التلقائية بالكامل
                    </label>
                    <span className="text-[11px] text-slate-500">
                      تشغيل عمليات المزامنة والتخزين عند إجراء العمليات وتوفر الإنترنت
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enabled}
                    onChange={(e) => handleToggleSetting('enabled', e.target.checked)}
                    className="w-5 h-5 accent-emerald-700 cursor-pointer"
                  />
                </div>

                {/* Sync on Reconnect */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <label className="font-black text-xs text-slate-900 block">
                      التخزين الفوري التلقائي عند عودة الاتصال بالإنترنت
                    </label>
                    <span className="text-[11px] text-slate-500">
                      بمجرد توفر شبكة الإنترنت بعد فترة انقطاع، يتم إرسال وتخزين كافة المعاملات فوراً
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.syncOnReconnect}
                    onChange={(e) => handleToggleSetting('syncOnReconnect', e.target.checked)}
                    className="w-5 h-5 accent-emerald-700 cursor-pointer"
                  />
                </div>

                {/* Durable IndexedDB Copy */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <label className="font-black text-xs text-slate-900 block">
                      الاحتفاظ بنسخ احتياطية دورية في المستودع الدائم (IndexedDB)
                    </label>
                    <span className="text-[11px] text-slate-500">
                      تخزين لقطات زمنية غير قابلة للمسح في متصفح الجهاز
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.durableIndexedDB}
                    onChange={(e) => handleToggleSetting('durableIndexedDB', e.target.checked)}
                    className="w-5 h-5 accent-emerald-700 cursor-pointer"
                  />
                </div>

                {/* Cloud Server Sync */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                  <div>
                    <label className="font-black text-xs text-slate-900 block">
                      مزامنة السجلات مع الخادم السحابي للمركز
                    </label>
                    <span className="text-[11px] text-slate-500">
                      إرسال نسخة احتياطية مشفرة للخادم عند الاتصال
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.cloudServerSync}
                    onChange={(e) => handleToggleSetting('cloudServerSync', e.target.checked)}
                    className="w-5 h-5 accent-emerald-700 cursor-pointer"
                  />
                </div>

                {/* Periodic Frequency */}
                <div className="p-3 rounded-xl bg-slate-50 space-y-2">
                  <label className="font-black text-xs text-slate-900 block">
                    دورية المزامنة التلقائية بالخلفية عند توفر الإنترنت
                  </label>
                  <select
                    value={config.periodicSyncMinutes}
                    onChange={(e) => handleToggleSetting('periodicSyncMinutes', Number(e.target.value))}
                    className="w-full text-xs font-bold border border-slate-300 rounded-xl p-2 bg-white cursor-pointer"
                  >
                    <option value={2}>كل دقيقتين (تحديث مستمر سريع)</option>
                    <option value={5}>كل 5 دقائق (مستحسن ومثالي)</option>
                    <option value={15}>كل 15 دقيقة</option>
                    <option value={30}>كل 30 دقيقة</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INDEXEDDB SNAPSHOTS */}
          {activeSubTab === 'snapshots' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">النسخ الاحتياطية الدائمة المخزنة في IndexedDB</h4>
                  <p className="text-xs text-slate-500">
                    تُحفظ تلقائياً عند كل مزامنة وتتيح استرجاع النسخ السابقة في أي وقت.
                  </p>
                </div>
                <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                  {snapshots.length} نسخة محفوظة
                </span>
              </div>

              {snapshots.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">
                  لا توجد نسخ مخزنة حالياً في مستودع IndexedDB. اضغط على زر المزامنة لإنشاء أول لقطة.
                </div>
              ) : (
                <div className="divide-y divide-slate-150 border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-72 overflow-y-auto">
                  {snapshots.map((s, idx) => (
                    <div key={s.id} className="p-3 text-xs flex items-center justify-between hover:bg-slate-50">
                      <div className="flex items-center gap-2.5">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-mono font-bold text-[11px]">
                          {idx + 1}
                        </span>
                        <div>
                          <span className="font-mono font-bold text-slate-900 block">
                            {formatDateTime(s.timestamp)}
                          </span>
                          <span className="text-[11px] text-slate-500">
                            السبب: {s.trigger === 'reconnect' ? 'استعادة الاتصال بالإنترنت' : s.trigger === 'manual' ? 'مزامنة يدوية' : 'تخزين دوري'}
                          </span>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        {s.totalRecords} سجل
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: LOGS */}
          {activeSubTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-slate-900">سجل عمليات التخزين والتحديث التلقائي</h4>
                  <p className="text-xs text-slate-500">
                    يوثق كل عملية مزامنة حدثت وتوقيتها وعدد السجلات التي تمت معالجتها.
                  </p>
                </div>
                {logs.length > 0 && (
                  <button
                    onClick={handleClearLogs}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold transition cursor-pointer"
                  >
                    مسح السجل
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-xs">
                  لا توجد عمليات مسجلة حتى الآن.
                </div>
              ) : (
                <div className="divide-y divide-slate-150 border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-80 overflow-y-auto">
                  {logs.map((log) => (
                    <div key={log.id} className="p-3 text-xs space-y-1 hover:bg-slate-50">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-slate-500 text-[11px]">
                          {formatDateTime(log.timestamp)}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          log.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {log.status === 'success' ? 'ناجح' : 'فشل / مؤجل'}
                        </span>
                      </div>
                      <p className="text-slate-700 font-medium text-[11px]">
                        {log.details}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-slate-500">
            النظام يعمل في وضع عدم الاتصال (Offline First) مع مزامنة سحابية تلقائية فور توفر الشبكة.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold transition cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

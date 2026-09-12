import React from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, X, Wifi, WifiOff, Clock } from 'lucide-react';
import { SyncStatusInfo } from '../storage/syncManager';

interface AutoSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  syncInfo: SyncStatusInfo;
  isOnline: boolean;
  onTriggerSync: () => void;
}

export const AutoSyncModal: React.FC<AutoSyncModalProps> = ({
  isOpen,
  onClose,
  syncInfo,
  isOnline,
  onTriggerSync
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
          <div className="flex items-center gap-2">
            <RefreshCw className={`w-5 h-5 ${syncInfo.status === 'syncing' ? 'animate-spin text-teal-600' : 'text-slate-700'}`} />
            <h3 className="text-base font-bold text-slate-900">حالة المزامنة والاتصال المركزي</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-600 font-medium">حالة الاتصال بالشبكة:</span>
            <span className={`inline-flex items-center gap-1 font-bold ${isOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {isOnline ? 'متصل بالإنترنت' : 'غير متصل (أوفلاين)'}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-600 font-medium">حالة المزامنة:</span>
            <span className="font-bold">
              {syncInfo.status === 'syncing' && <span className="text-teal-600">جارٍ المزامنة...</span>}
              {syncInfo.status === 'synced' && <span className="text-emerald-600">متزامن ومكتمل</span>}
              {syncInfo.status === 'failed' && <span className="text-rose-600">فشلت المزامنة</span>}
              {syncInfo.status === 'idle' && <span className="text-slate-600">في وضع الاستعداد</span>}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-slate-600 font-medium">حركات معلقة في قائمة الانتظار:</span>
            <span className={`font-black ${syncInfo.pendingCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
              {syncInfo.pendingCount} حركة
            </span>
          </div>

          {syncInfo.lastSyncTime && (
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
              <span className="text-slate-600 font-medium">آخر مزامنة ناجحة:</span>
              <span className="text-slate-700 font-mono text-xs">
                {new Date(syncInfo.lastSyncTime).toLocaleTimeString('ar-EG')}
              </span>
            </div>
          )}

          {syncInfo.lastError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong>سبب عدم اكتمال المزامنة:</strong>
                <p className="mt-0.5">{syncInfo.lastError}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            إغلاق
          </button>
          <button
            onClick={onTriggerSync}
            disabled={syncInfo.status === 'syncing' || !isOnline}
            className={`px-5 py-2 text-xs font-bold rounded-lg text-white transition-all flex items-center gap-1.5 ${
              syncInfo.status === 'syncing' || !isOnline
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 shadow-xs'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncInfo.status === 'syncing' ? 'animate-spin' : ''}`} />
            <span>مزامنة فورية الآن</span>
          </button>
        </div>
      </div>
    </div>
  );
};

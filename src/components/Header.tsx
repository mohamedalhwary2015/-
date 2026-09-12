import React, { useState } from 'react';
import { RefreshCw, ShieldCheck, Wifi, WifiOff, AlertTriangle, Building2, User } from 'lucide-react';
import { DatabaseSchema } from '../types';
import { saveDatabase } from '../storage/db';

interface HeaderProps {
  db: DatabaseSchema;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  lastError: string | null;
  onTriggerSync: () => void;
  onOpenDiagnostics: () => void;
  integrityIssuesCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  db,
  isOnline,
  isSyncing,
  pendingCount,
  lastSyncTime,
  lastError,
  onTriggerSync,
  onOpenDiagnostics,
  integrityIssuesCount
}) => {
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [employeeInput, setEmployeeInput] = useState(db.officeSettings?.currentEmployee || 'غير محدد');

  const handleSaveEmployee = () => {
    const updatedDb = { ...db };
    if (!updatedDb.officeSettings) {
      updatedDb.officeSettings = {
        officeName: 'مكتب صحة سفلاق - إدارة ساقلتة الصحية',
        governorate: 'محافظة سوهاج',
        currentEmployee: 'غير محدد',
        healthCardMaleFee: 50,
        healthCardFemaleFee: 50,
        birthCertFee: 0,
        deathCertFee: 0
      };
    }
    updatedDb.officeSettings.currentEmployee = employeeInput.trim() || 'غير محدد';
    saveDatabase(updatedDb);
    setShowEmployeeModal(false);
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs" id="app-header">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Right side: Office Identity */}
          <div className="flex items-center space-x-3 space-x-reverse">
            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight">
                  {db.officeSettings?.officeName || 'مكتب صحة سفلاق - إدارة ساقلتة الصحية'}
                </h1>
                <span className="text-xs bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md font-medium border border-teal-200">
                  {db.officeSettings?.governorate || 'محافظة سوهاج'}
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                المنظومة الرقمية المعتمدة لتسجيل الأرصدة والمستندات وساقط القيد
              </p>
            </div>
          </div>

          {/* Left side: System Controls, Sync & Employee */}
          <div className="flex items-center space-x-2 sm:space-x-3 space-x-reverse">
            {/* Integrity status button */}
            <button
              id="btn-integrity-check"
              onClick={onOpenDiagnostics}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                integrityIssuesCount > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
              title="فحص نزاهة وتدقيق الأرصدة"
            >
              {integrityIssuesCount > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span>تنبيهات الأرصدة ({integrityIssuesCount})</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>الأرصدة سليمة</span>
                </>
              )}
            </button>

            {/* Current Employee Button (No hardcoded name - Rule 23) */}
            <button
              id="btn-current-employee"
              onClick={() => setShowEmployeeModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200"
              title="تحديد الموظف المختص الحالي"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="max-w-[100px] truncate">
                {db.officeSettings?.currentEmployee || 'غير محدد'}
              </span>
            </button>

            {/* Sync & Online Status */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
              <span
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-md ${
                  isOnline
                    ? 'bg-emerald-100/70 text-emerald-700'
                    : 'bg-rose-100/70 text-rose-700'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span className="hidden md:inline">{isOnline ? 'متصل' : 'أوفلاين'}</span>
              </span>

              <button
                id="btn-trigger-sync"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  isSyncing
                    ? 'bg-teal-50 text-teal-700 cursor-not-allowed'
                    : pendingCount > 0
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title={lastError ? `آخر خطأ: ${lastError}` : 'مزامنة المعاملات المعلقة'}
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-teal-600' : ''}`} />
                <span>
                  {isSyncing
                    ? 'جارٍ المزامنة...'
                    : pendingCount > 0
                    ? `معلق (${pendingCount})`
                    : 'مزامنة'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Employee Modal */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-2">الموظف المختص الحالي</h3>
            <p className="text-xs text-slate-500 mb-4">
              سيتم تسجيل هذا الاسم في سجلات التوريد والصرف وساقط القيد خلال فترة نوبتك.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الموظف / كاتب الصحة</label>
              <input
                type="text"
                id="input-employee-name"
                value={employeeInput}
                onChange={(e) => setEmployeeInput(e.target.value)}
                placeholder="مثال: محمد السيد، أو غير محدد"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-save-employee"
                onClick={handleSaveEmployee}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
              >
                حفظ الموظف
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

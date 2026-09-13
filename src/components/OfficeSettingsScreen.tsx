import React, { useState } from 'react';
import {
  Settings,
  Building2,
  User,
  Coins,
  Cpu,
  Save,
  CheckCircle2,
  ShieldAlert,
  HardDrive,
  Clock,
  Layers
} from 'lucide-react';
import { DatabaseSchema } from '../types';
import { saveDatabase, getDeviceId } from '../storage/db';

interface OfficeSettingsScreenProps {
  db: DatabaseSchema;
  onRefresh?: () => void;
  onSettingsUpdated?: () => void;
}

export const OfficeSettingsScreen: React.FC<OfficeSettingsScreenProps> = ({
  db,
  onRefresh,
  onSettingsUpdated
}) => {
  const triggerRefresh = () => {
    if (onSettingsUpdated) onSettingsUpdated();
    if (onRefresh) onRefresh();
  };
  const settings = db.officeSettings || {
    officeName: 'مكتب صحة سفلاق - إدارة ساقلتة الصحية',
    governorate: 'محافظة سوهاج',
    currentEmployee: 'غير محدد',
    healthCardMaleFee: 50,
    healthCardFemaleFee: 50,
    birthCertFee: 0,
    deathCertFee: 0
  };

  const [officeName, setOfficeName] = useState(settings.officeName);
  const [governorate, setGovernorate] = useState(settings.governorate);
  const [currentEmployee, setCurrentEmployee] = useState(settings.currentEmployee);
  const [healthCardMaleFee, setHealthCardMaleFee] = useState<number>(settings.healthCardMaleFee ?? 50);
  const [healthCardFemaleFee, setHealthCardFemaleFee] = useState<number>(settings.healthCardFemaleFee ?? 50);
  const [birthCertFee, setBirthCertFee] = useState<number>(settings.birthCertFee ?? 0);
  const [deathCertFee, setDeathCertFee] = useState<number>(settings.deathCertFee ?? 0);

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updatedDb: DatabaseSchema = {
      ...db,
      officeSettings: {
        officeName: officeName.trim() || 'مكتب صحة سفلاق - إدارة ساقلتة الصحية',
        governorate: governorate.trim() || 'محافظة سوهاج',
        currentEmployee: currentEmployee.trim() || 'غير محدد',
        healthCardMaleFee: Number(healthCardMaleFee) || 0,
        healthCardFemaleFee: Number(healthCardFemaleFee) || 0,
        birthCertFee: Number(birthCertFee) || 0,
        deathCertFee: Number(deathCertFee) || 0
      }
    };

    saveDatabase(updatedDb);
    triggerRefresh();
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const deviceId = getDeviceId();
  const suppliesCount = (db.supplies || []).filter((s) => !s.isDeleted).length;
  const dispensesCount = (db.dispenses || []).filter((d) => !d.isDeleted).length;
  const lateRegsCount = (db.lateRegistrations || []).filter((l) => !l.isDeleted).length;

  return (
    <div className="space-y-6" id="office-settings-view">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center font-bold">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              إعدادات المنظومة وهوية مكتب الصحة (System Configuration)
            </h2>
            <p className="text-xs text-slate-500">
              تخصيص بيانات المكتب الحكومي، الموظف المختص، والتسعيرة المعتمدة للخدمات والمستندات
            </p>
          </div>
        </div>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-800 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>تم حفظ وتحديث إعدادات المكتب والمنظومة بنجاح.</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Section 1: Office & Staff Identity */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
            <Building2 className="w-4 h-4 text-teal-600" />
            <span>بيانات المكتب الحكومي والموظف المختص</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                اسم مكتب الصحة / الإدارة الصحية
              </label>
              <input
                type="text"
                value={officeName}
                onChange={(e) => setOfficeName(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                المحافظة التابع لها
              </label>
              <input
                type="text"
                value={governorate}
                onChange={(e) => setGovernorate(e.target.value)}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium"
                required
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center justify-between">
                <span>الموظف المختص الحالي (القائم بالأعمال)</span>
                <span className="text-[11px] font-normal text-slate-400">
                  (افتراضي: &quot;غير محدد&quot; - لا يتم تعيين اسم موظف تلقائياً)
                </span>
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
                <input
                  type="text"
                  value={currentEmployee}
                  onChange={(e) => setCurrentEmployee(e.target.value)}
                  placeholder="غير محدد"
                  className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Official Fees */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
            <Coins className="w-4 h-4 text-amber-600" />
            <span>تسعيرة ورسوم المستندات والبطاقات الصحية (جنيه مصري)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رسم بطاقة صحية (ذكور)
              </label>
              <input
                type="number"
                min="0"
                value={healthCardMaleFee}
                onChange={(e) => setHealthCardMaleFee(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-bold text-teal-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رسم بطاقة صحية (إناث)
              </label>
              <input
                type="number"
                min="0"
                value={healthCardFemaleFee}
                onChange={(e) => setHealthCardFemaleFee(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-bold text-teal-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رسم شهادة ميلاد مميكنة
              </label>
              <input
                type="number"
                min="0"
                value={birthCertFee}
                onChange={(e) => setBirthCertFee(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رسم شهادة وفاة
              </label>
              <input
                type="number"
                min="0"
                value={deathCertFee}
                onChange={(e) => setDeathCertFee(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-bold text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            id="btn-save-office-settings"
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all"
          >
            <Save className="w-4 h-4" />
            <span>حفظ وتطبيق الإعدادات</span>
          </button>
        </div>
      </form>

      {/* Section 3: System Diagnostics & Device Info */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
          <Cpu className="w-4 h-4 text-indigo-600" />
          <span>بيانات النظام والبيئة التشغيلية الموثوقة</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1 font-medium">معرف الجهاز المحلي (Device ID)</span>
            <span className="font-mono font-bold text-slate-800 select-all">{deviceId}</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1 font-medium">إصدار قاعدة البيانات</span>
            <span className="font-mono font-bold text-slate-800">ERP Schema v{db.version}</span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1 font-medium">حد الأمان الزمني (Reset Boundary)</span>
            <span className="font-mono text-slate-700 truncate block" title={db.resetBoundary?.resetTimestamp || 'افتراضي'}>
              {db.resetBoundary?.resetTimestamp?.split('T')[0] || 'غير محدد'}
            </span>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-1 font-medium">إجمالي السجلات المسجلة</span>
            <span className="font-bold text-slate-800">
              {suppliesCount} توريد • {dispensesCount} صرف • {lateRegsCount} ساقط قيد
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

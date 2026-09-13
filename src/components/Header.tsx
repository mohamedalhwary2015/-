import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
  AlertTriangle,
  Building2,
  User,
  Search,
  Menu,
  FileCheck2,
  Boxes,
  FileSpreadsheet,
  ArrowUpRight,
  X
} from 'lucide-react';
import { DatabaseSchema, CATEGORY_LABELS } from '../types';
import { saveDatabase } from '../storage/db';
import { TabType } from './Sidebar';

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
  onToggleMobileMenu?: () => void;
  onNavigate?: (tab: TabType) => void;
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
  integrityIssuesCount,
  onToggleMobileMenu,
  onNavigate
}) => {
  const [showEmployeeModal, setShowEmployeeModal] = useState(false);
  const [employeeInput, setEmployeeInput] = useState(db.officeSettings?.currentEmployee || 'غير محدد');

  // Global Quick Search State
  const [globalSearch, setGlobalSearch] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = useMemo(() => {
    if (!globalSearch.trim() || globalSearch.length < 2) return [];
    const q = globalSearch.toLowerCase().trim();
    const results: Array<{
      id: string;
      type: 'dispense' | 'supply' | 'late_reg';
      title: string;
      subtitle: string;
      targetTab: TabType;
    }> = [];

    // Search Dispenses
    for (const d of (db.dispenses || [])) {
      if (d.isDeleted) continue;
      if (
        d.citizenName.toLowerCase().includes(q) ||
        (d.nationalId && d.nationalId.includes(q)) ||
        (d.childOrDeceasedName && d.childOrDeceasedName.toLowerCase().includes(q)) ||
        (d.receiptNumber && d.receiptNumber.toLowerCase().includes(q)) ||
        (d.serialNumber && d.serialNumber.toLowerCase().includes(q))
      ) {
        results.push({
          id: d.id,
          type: 'dispense',
          title: d.citizenName,
          subtitle: `صرف: ${CATEGORY_LABELS[d.category] || d.category} • ${d.date} ${d.receiptNumber ? `• إيصال: ${d.receiptNumber}` : ''}`,
          targetTab: d.category === 'health_cards_male' || d.category === 'health_cards_female' ? 'health_cards' : 'documents'
        });
      }
      if (results.length >= 6) break;
    }

    // Search Late Regs
    if (results.length < 6) {
      for (const r of (db.lateRegistrations || [])) {
        if (r.isDeleted) continue;
        if (
          r.personName.toLowerCase().includes(q) ||
          r.applicantName.toLowerCase().includes(q) ||
          (r.personNationalId && r.personNationalId.includes(q)) ||
          r.formNumber.toLowerCase().includes(q)
        ) {
          results.push({
            id: r.id,
            type: 'late_reg',
            title: r.personName,
            subtitle: `ساقط قيد ${r.eventType} • طلب رقم ${r.formNumber} • مقدم الطلب: ${r.applicantName}`,
            targetTab: 'late_registration'
          });
        }
        if (results.length >= 6) break;
      }
    }

    // Search Supplies
    if (results.length < 6) {
      for (const s of (db.supplies || [])) {
        if (s.isDeleted) continue;
        if (
          s.documentNumber.toLowerCase().includes(q) ||
          s.supplierSource.toLowerCase().includes(q)
        ) {
          results.push({
            id: s.id,
            type: 'supply',
            title: `إذن توريد: ${s.documentNumber}`,
            subtitle: `${CATEGORY_LABELS[s.category] || s.category} • كمية ${s.quantity} • ${s.supplierSource}`,
            targetTab: 'supplies'
          });
        }
        if (results.length >= 6) break;
      }
    }

    return results;
  }, [globalSearch, db]);

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

  const handleSelectSearchResult = (targetTab: TabType) => {
    if (onNavigate) {
      onNavigate(targetTab);
    }
    setIsSearchOpen(false);
    setGlobalSearch('');
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs" id="app-header">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Right side: Mobile Menu Button & Office Identity */}
          <div className="flex items-center gap-3">
            {onToggleMobileMenu && (
              <button
                id="btn-toggle-mobile-menu"
                onClick={onToggleMobileMenu}
                className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden border border-slate-200"
                aria-label="فتح القائمة"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white shadow-xs shrink-0">
              <Building2 className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight truncate">
                  {db.officeSettings?.officeName || 'مكتب صحة سفلاق - إدارة ساقلتة الصحية'}
                </h1>
                <span className="text-[11px] bg-teal-50 text-teal-700 px-2 py-0.5 rounded-md font-medium border border-teal-200 shrink-0 hidden md:inline-block">
                  {db.officeSettings?.governorate || 'محافظة سوهاج'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block truncate">
                منظومة ERP المتكاملة لتسجيل الأرصدة والمستندات والبطاقات الصحية وساقط القيد
              </p>
            </div>
          </div>

          {/* Center: Global ERP Search (Desktop/Tablet) */}
          <div className="flex-1 max-w-md hidden md:block relative" ref={searchRef}>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                placeholder="بحث سريع (مواطن، رقم قومي، إيصال، استمارة)..."
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setIsSearchOpen(true);
                }}
                onFocus={() => setIsSearchOpen(true)}
                className="w-full pr-9 pl-4 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 bg-slate-50/50 hover:bg-white transition-colors"
              />
              {globalSearch && (
                <button
                  onClick={() => setGlobalSearch('')}
                  className="absolute left-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Live Autocomplete Dropdown */}
            {isSearchOpen && globalSearch.trim().length >= 2 && (
              <div className="absolute top-full right-0 left-0 mt-1.5 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-fadeIn">
                <div className="px-3 py-1 text-[11px] font-bold text-slate-400 border-b border-slate-100">
                  نتائج البحث السريع ({searchResults.length})
                </div>

                {searchResults.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400">
                    لا توجد سجلات مطابقة لكلمة البحث
                  </div>
                ) : (
                  <div className="space-y-1 mt-1">
                    {searchResults.map((res) => (
                      <button
                        key={`${res.type}-${res.id}`}
                        onClick={() => handleSelectSearchResult(res.targetTab)}
                        className="w-full text-right p-2 rounded-xl hover:bg-teal-50/50 transition-colors flex items-center justify-between group"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-slate-900 group-hover:text-teal-900 truncate">
                            {res.title}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {res.subtitle}
                          </div>
                        </div>
                        <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700 shrink-0 mr-2" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Left side: System Controls, Sync & Employee */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Integrity status button */}
            <button
              id="btn-integrity-check"
              onClick={onOpenDiagnostics}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors border ${
                integrityIssuesCount > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
              title="فحص نزاهة وتدقيق الأرصدة"
            >
              {integrityIssuesCount > 0 ? (
                <>
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">تنبيهات ({integrityIssuesCount})</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">الأرصدة سليمة</span>
                </>
              )}
            </button>

            {/* Current Employee Button (Strictly defaults to "غير محدد") */}
            <button
              id="btn-current-employee"
              onClick={() => setShowEmployeeModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200 transition-colors"
              title="تحديد الموظف المختص الحالي"
            >
              <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="max-w-[80px] sm:max-w-[120px] truncate">
                {db.officeSettings?.currentEmployee || 'غير محدد'}
              </span>
            </button>

            {/* Sync & Online Status */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
              <span
                className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg ${
                  isOnline
                    ? 'bg-emerald-100/70 text-emerald-700'
                    : 'bg-rose-100/70 text-rose-700'
                }`}
              >
                {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                <span className="hidden lg:inline">{isOnline ? 'متصل' : 'أوفلاين'}</span>
              </span>

              <button
                id="btn-trigger-sync"
                onClick={onTriggerSync}
                disabled={isSyncing}
                className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  isSyncing
                    ? 'bg-teal-50 text-teal-700 cursor-not-allowed'
                    : pendingCount > 0
                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                }`}
                title={lastError ? `آخر خطأ: ${lastError}` : 'مزامنة المعاملات المعلقة مع السيرفر'}
              >
                <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin text-teal-600' : ''}`} />
                <span className="hidden sm:inline">
                  {isSyncing
                    ? 'جارٍ...'
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
                placeholder="غير محدد"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowEmployeeModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                type="button"
                id="btn-save-employee"
                onClick={handleSaveEmployee}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs"
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

import React from 'react';
import {
  LayoutDashboard,
  Boxes,
  FileCheck2,
  FileSpreadsheet,
  BookOpen,
  CalendarCheck,
  FileText,
  Database,
  ShieldAlert
} from 'lucide-react';

export type TabType =
  | 'dashboard'
  | 'stocks'
  | 'dispense'
  | 'late_registration'
  | 'opening_balances'
  | 'monthly_reports'
  | 'item_dispense_reports'
  | 'backup_restore'
  | 'diagnostics';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  integrityIssuesCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  integrityIssuesCount
}) => {
  const navItems = [
    { id: 'dashboard' as TabType, label: 'لوحة المتابعة', icon: LayoutDashboard },
    { id: 'stocks' as TabType, label: 'الأرصدة والتوريدات', icon: Boxes },
    { id: 'dispense' as TabType, label: 'صرف المستندات للمواطنين', icon: FileCheck2 },
    { id: 'late_registration' as TabType, label: 'استمارات ساقط القيد', icon: FileSpreadsheet },
    { id: 'opening_balances' as TabType, label: 'رصيد أول المدة والجرد', icon: BookOpen },
    { id: 'monthly_reports' as TabType, label: 'التقرير الشهري الرسمي', icon: CalendarCheck },
    { id: 'item_dispense_reports' as TabType, label: 'سجل المنصرف التفصيلي', icon: FileText },
    { id: 'backup_restore' as TabType, label: 'النسخ والمزامنة السحابية', icon: Database },
    {
      id: 'diagnostics' as TabType,
      label: 'تدقيق ونزاهة الأرصدة',
      icon: ShieldAlert,
      badge: integrityIssuesCount > 0 ? integrityIssuesCount : undefined
    }
  ];

  return (
    <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-l border-slate-200 p-3 lg:min-h-[calc(100vh-4rem)] flex lg:flex-col justify-between overflow-x-auto lg:overflow-visible">
      <div className="flex lg:flex-col gap-1 w-full">
        <div className="px-3 py-2 hidden lg:block text-xs font-bold text-slate-400 uppercase tracking-wider">
          أقسام المنظومة
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              onClick={() => onTabChange(item.id)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap ${
                isActive
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-white text-teal-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="hidden lg:block pt-4 border-t border-slate-100 text-center">
        <p className="text-[11px] text-slate-400">
          مكتب صحة سفلاق © {new Date().getFullYear()}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          نظام حماية الأرصدة الفعلي
        </p>
      </div>
    </aside>
  );
};

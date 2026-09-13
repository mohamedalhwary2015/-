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
  ShieldAlert,
  CreditCard,
  Layers,
  Coins,
  Settings,
  ArrowDownLeft,
  X,
  Building2
} from 'lucide-react';

export type TabType =
  | 'dashboard'
  | 'stocks'
  | 'supplies'
  | 'dispense'
  | 'health_cards'
  | 'documents'
  | 'stock_ledger'
  | 'late_registration'
  | 'opening_balances'
  | 'reports_center'
  | 'monthly_reports'
  | 'item_dispense_reports'
  | 'revenue_reports'
  | 'backup_restore'
  | 'diagnostics'
  | 'settings';

interface SidebarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  integrityIssuesCount: number;
  pendingSyncCount?: number;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

interface NavSection {
  title: string;
  items: Array<{
    id: TabType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeColor?: string;
  }>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  integrityIssuesCount,
  pendingSyncCount = 0,
  isMobileOpen = false,
  onCloseMobile
}) => {
  const sections: NavSection[] = [
    {
      title: 'الرئيسية',
      items: [
        { id: 'dashboard', label: 'لوحة القيادة المركزية', icon: LayoutDashboard }
      ]
    },
    {
      title: 'المخزون والعهد',
      items: [
        { id: 'stocks', label: 'الأرصدة والمخزون الفعلي', icon: Boxes },
        { id: 'supplies', label: 'أذون التوريد الواردة', icon: ArrowDownLeft },
        { id: 'stock_ledger', label: 'سجل حركات المخزون', icon: Layers },
        { id: 'opening_balances', label: 'الجرد ورصيد أول المدة', icon: BookOpen }
      ]
    },
    {
      title: 'المعاملات والخدمات',
      items: [
        { id: 'health_cards', label: 'صرف البطاقات الصحية', icon: CreditCard },
        { id: 'documents', label: 'صرف الشهادات والوثائق', icon: FileCheck2 },
        { id: 'dispense', label: 'سجل كافة المنصرف', icon: FileText },
        { id: 'late_registration', label: 'استمارات ساقط القيد', icon: FileSpreadsheet }
      ]
    },
    {
      title: 'التقارير والإحصائيات',
      items: [
        { id: 'reports_center', label: 'المركز الموحد للتقارير', icon: FileText },
        { id: 'monthly_reports', label: 'التقرير الشهري الرسمي', icon: CalendarCheck },
        { id: 'revenue_reports', label: 'تقرير الإيرادات والخزينة', icon: Coins },
        { id: 'item_dispense_reports', label: 'سجل المنصرف التفصيلي', icon: FileText }
      ]
    },
    {
      title: 'الإدارة والنظام',
      items: [
        {
          id: 'diagnostics',
          label: 'تدقيق ونزاهة الأرصدة',
          icon: ShieldAlert,
          badge: integrityIssuesCount > 0 ? integrityIssuesCount : undefined,
          badgeColor: 'bg-amber-100 text-amber-800'
        },
        {
          id: 'backup_restore',
          label: 'النسخ والمزامنة السحابية',
          icon: Database,
          badge: pendingSyncCount > 0 ? pendingSyncCount : undefined,
          badgeColor: 'bg-teal-100 text-teal-800'
        },
        { id: 'settings', label: 'إعدادات المنظومة والمكتب', icon: Settings }
      ]
    }
  ];

  const handleItemClick = (id: TabType) => {
    onTabChange(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  const content = (
    <div className="flex flex-col justify-between h-full p-3 select-none">
      <div className="space-y-4">
        {/* Mobile Header */}
        <div className="flex items-center justify-between lg:hidden pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center text-white">
              <Building2 className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-800 text-sm">مكتب صحة سفلاق</span>
          </div>
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Navigation Sections */}
        {sections.map((sec, secIdx) => (
          <div key={secIdx} className="space-y-1">
            <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              {sec.title}
            </div>
            <div className="space-y-0.5">
              {sec.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    id={`nav-${item.id}`}
                    onClick={() => handleItemClick(item.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                      isActive
                        ? 'bg-teal-600 text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && (
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 mr-1.5 ${
                          isActive
                            ? 'bg-white text-teal-800'
                            : (item.badgeColor || 'bg-slate-100 text-slate-700')
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Info */}
      <div className="pt-4 mt-6 border-t border-slate-100 text-center">
        <p className="text-[11px] text-slate-500 font-medium">
          مكتب صحة سفلاق © {new Date().getFullYear()}
        </p>
        <p className="text-[10px] text-slate-400 mt-0.5">
          منظومة ERP الحكومية المعتمدة
        </p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:block w-64 bg-white border-l border-slate-200 min-h-[calc(100vh-4rem)] overflow-y-auto shrink-0 shadow-xs">
        {content}
      </aside>

      {/* Mobile Drawer Backdrop & Sidebar */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <aside className="fixed inset-y-0 right-0 w-72 bg-white shadow-2xl overflow-y-auto z-50 border-l border-slate-200">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};

import React from 'react';
import { ChevronLeft, Home } from 'lucide-react';
import { TabType } from './Sidebar';

interface BreadcrumbProps {
  activeTab: TabType;
  onNavigate: (tab: TabType) => void;
}

interface TabMeta {
  section: string;
  sectionTab?: TabType;
  label: string;
}

const TAB_META_MAP: Record<TabType, TabMeta> = {
  dashboard: { section: 'الرئيسية', label: 'لوحة القيادة' },
  stocks: { section: 'المخزون والأرصدة', sectionTab: 'stocks', label: 'الأرصدة الحالية' },
  supplies: { section: 'المخزون والأرصدة', sectionTab: 'stocks', label: 'التوريدات الواردة' },
  stock_ledger: { section: 'المخزون والأرصدة', label: 'سجل حركة المخزون' },
  opening_balances: { section: 'المخزون والأرصدة', label: 'رصيد أول المدة والجرد' },
  manual_adjustments: { section: 'المخزون والأرصدة', label: 'التسويات اليدوية' },

  health_cards: { section: 'المستندات والخدمات', label: 'صرف البطاقات الصحية' },
  documents: { section: 'المستندات والخدمات', label: 'صرف الشهادات والوثائق' },
  birth_certificates: { section: 'المستندات والخدمات', label: 'صرف شهادات الميلاد' },
  death_certificates: { section: 'المستندات والخدمات', label: 'صرف شهادات وقيد الوفاة' },
  notifications: { section: 'المستندات والخدمات', label: 'صرف الإخطارات وبلاغات الولادة والوفاة' },
  late_registration: { section: 'المستندات والخدمات', label: 'استمارات ساقط القيد' },
  dispense: { section: 'المستندات والخدمات', label: 'سجل جميع المنصرف' },
  dispense_all: { section: 'المستندات والخدمات', label: 'سجل جميع المنصرف' },

  reports_center: { section: 'التقارير', label: 'مركز التقارير الموحد' },
  monthly_reports: { section: 'التقارير', label: 'التقرير الشهري الرسمي' },
  item_movement_report: { section: 'التقارير', label: 'تقرير حركة الأصناف' },
  item_dispense_reports: { section: 'التقارير', label: 'تقرير المنصرف التفصيلي' },
  revenue_reports: { section: 'التقارير', label: 'تقرير الإيرادات والتحصيل' },
  stock_balances_report: { section: 'التقارير', label: 'تقرير الأرصدة والمخزون' },
  inventory_audit_report: { section: 'التقارير', label: 'تقرير الجرد والفروقات' },

  backup_restore: { section: 'النظام', label: 'النسخ الاحتياطي والاستعادة' },
  sync_status: { section: 'النظام', label: 'المزامنة السحابية' },
  diagnostics: { section: 'النظام', label: 'تدقيق وسلامة البيانات' },
  settings: { section: 'النظام', label: 'إعدادات المكتب والمنظومة' }
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ activeTab, onNavigate }) => {
  const meta = TAB_META_MAP[activeTab] || { section: 'الرئيسية', label: 'لوحة القيادة' };

  return (
    <nav className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-4 select-none" aria-label="Breadcrumb">
      <button
        onClick={() => onNavigate('dashboard')}
        className="flex items-center gap-1 hover:text-teal-700 transition-colors cursor-pointer text-slate-600 font-semibold"
      >
        <Home className="w-3.5 h-3.5" />
        <span>الرئيسية</span>
      </button>

      {meta.section !== 'الرئيسية' && (
        <>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-slate-500">{meta.section}</span>
        </>
      )}

      {activeTab !== 'dashboard' && (
        <>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-teal-800 font-bold bg-teal-50/80 px-2 py-0.5 rounded-md border border-teal-100">
            {meta.label}
          </span>
        </>
      )}
    </nav>
  );
};

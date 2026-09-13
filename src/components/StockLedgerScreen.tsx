import React, { useState, useMemo } from 'react';
import {
  Layers,
  Search,
  Filter,
  Printer,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Sliders,
  FileText,
  Boxes
} from 'lucide-react';
import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS
} from '../types';

interface StockLedgerScreenProps {
  db: DatabaseSchema;
}

interface LedgerEntry {
  id: string;
  date: string;
  type: 'supply' | 'dispense' | 'adjustment' | 'opening';
  typeLabel: string;
  category: StockCategory;
  categoryLabel: string;
  change: number; // positive or negative
  documentOrReceipt: string;
  entityName: string; // citizen or supplier or reason
  performedBy: string;
  notes?: string;
}

export const StockLedgerScreen: React.FC<StockLedgerScreenProps> = ({ db }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Assemble full movement ledger
  const allEntries: LedgerEntry[] = useMemo(() => {
    const entries: LedgerEntry[] = [];

    // 1. Opening balances
    if (db.openingBalances) {
      for (const cat of STOCK_CATEGORIES) {
        const ob = db.openingBalances[cat];
        if (ob && ob.quantity > 0) {
          entries.push({
            id: `ob-${cat}`,
            date: ob.inventoryDate || '2026-01-01',
            type: 'opening',
            typeLabel: 'رصيد أول المدة',
            category: cat,
            categoryLabel: CATEGORY_LABELS[cat] || cat,
            change: ob.quantity,
            documentOrReceipt: 'رصيد افتتاحي معتمد',
            entityName: 'محضر جرد البداية',
            performedBy: ob.inventoryKeeper || 'غير محدد',
            notes: ob.notes
          });
        }
      }
    }

    // 2. Supplies (+)
    for (const s of (db.supplies || [])) {
      if (s.isDeleted) continue;
      entries.push({
        id: `sup-${s.id}`,
        date: s.date,
        type: 'supply',
        typeLabel: 'إذن توريد وارد',
        category: s.category,
        categoryLabel: CATEGORY_LABELS[s.category] || s.category,
        change: s.quantity,
        documentOrReceipt: `إذن توريد رقم: ${s.documentNumber}`,
        entityName: s.supplierSource || 'مخزن الإدارة الصحية',
        performedBy: s.receivedBy || 'غير محدد',
        notes: s.notes
      });
    }

    // 3. Dispenses (-)
    for (const d of (db.dispenses || [])) {
      if (d.isDeleted) continue;
      entries.push({
        id: `disp-${d.id}`,
        date: d.date,
        type: 'dispense',
        typeLabel: 'صرف لمواطن',
        category: d.category,
        categoryLabel: CATEGORY_LABELS[d.category] || d.category,
        change: -Math.abs(d.quantity),
        documentOrReceipt: d.receiptNumber ? `إيصال: ${d.receiptNumber}` : (d.serialNumber ? `مسلسل: ${d.serialNumber}` : 'صرف مباشر'),
        entityName: d.citizenName + (d.childOrDeceasedName ? ` (${d.childOrDeceasedName})` : ''),
        performedBy: d.dispensedBy || 'غير محدد',
        notes: d.notes
      });
    }

    // 4. Audit manual adjustments
    for (const a of (db.auditLogs || [])) {
      if (a.action === 'تسوية رصيد جرد يدوي صريح' && a.category) {
        const diff = (a.newValue ?? 0) - (a.previousValue ?? 0);
        entries.push({
          id: `adj-${a.id}`,
          date: a.timestamp.split('T')[0],
          type: 'adjustment',
          typeLabel: 'تسوية جرد يدوي',
          category: a.category,
          categoryLabel: CATEGORY_LABELS[a.category] || a.category,
          change: diff,
          documentOrReceipt: 'محضر تسوية معتمد',
          entityName: a.details,
          performedBy: a.performedBy || 'غير محدد'
        });
      }
    }

    // Sort by date descending
    entries.sort((a, b) => b.date.localeCompare(a.date));
    return entries;
  }, [db]);

  // Filtering
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (selectedCategory !== 'all' && e.category !== selectedCategory) return false;
      if (selectedType !== 'all' && e.type !== selectedType) return false;
      if (startDate && e.date < startDate) return false;
      if (endDate && e.date > endDate) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      return (
        e.entityName.toLowerCase().includes(q) ||
        e.documentOrReceipt.toLowerCase().includes(q) ||
        e.categoryLabel.toLowerCase().includes(q) ||
        e.performedBy.toLowerCase().includes(q) ||
        (e.notes && e.notes.toLowerCase().includes(q))
      );
    });
  }, [allEntries, selectedCategory, selectedType, startDate, endDate, searchQuery]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="stock-ledger-view">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                سجل حركات المخزون والعهد (Stock Movement Ledger)
              </h2>
              <p className="text-xs text-slate-500">
                سجل رقابي مركزي يوثق كافة الوارد والمنصرف وتسويات الجرد بحسب التاريخ والصنف
              </p>
            </div>
          </div>
        </div>

        <button
          id="btn-print-ledger"
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة كشف الحركات</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث في البيان، الإيصال، المستلم..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
            >
              <option value="all">كافة الأصناف الرسمية (6)</option>
              {STOCK_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          {/* Movement Type */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
            >
              <option value="all">كافة أنواع الحركات</option>
              <option value="supply">توريد وارد (+)</option>
              <option value="dispense">صرف لمواطن (-)</option>
              <option value="adjustment">تسوية جرد</option>
              <option value="opening">رصيد أول المدة</option>
            </select>
          </div>

          {/* Date from */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0">من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Date to */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0">إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {/* Quick Clear */}
        {(selectedCategory !== 'all' || selectedType !== 'all' || searchQuery || startDate || endDate) && (
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
            <span>تم تصفية {filteredEntries.length} حركة من إجمالي {allEntries.length}</span>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedType('all');
                setSearchQuery('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-teal-700 hover:text-teal-800 font-semibold"
            >
              إعادة ضبط الفلاتر
            </button>
          </div>
        )}
      </div>

      {/* Ledger Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none">
        {/* Printable Office Header */}
        <div className="p-6 border-b border-slate-200 hidden print:block text-center">
          <h2 className="text-base font-bold">جمهورية مصر العربية - وزارة الصحة والسكان</h2>
          <h3 className="text-sm font-semibold text-slate-700">مديرية الشؤون الصحية بسوهاج - إدارة ساقلتة الصحية</h3>
          <h1 className="text-lg font-black text-slate-900 mt-1">مكتب صحة سفلاق - سجل حركات العهد والمخزون</h1>
          <p className="text-xs text-slate-500 mt-1">تاريخ استخراج التقرير: {new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
                <th className="py-3.5 px-4">التاريخ</th>
                <th className="py-3.5 px-4">نوع الحركة</th>
                <th className="py-3.5 px-4">الصنف</th>
                <th className="py-3.5 px-4">الكمية</th>
                <th className="py-3.5 px-4">الجهة / المواطن</th>
                <th className="py-3.5 px-4">رقم المستند / الإيصال</th>
                <th className="py-3.5 px-4">الموظف المختص</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    لا توجد حركات مخزون مطابقة للبحث أو الفلتر المحدد
                  </td>
                </tr>
              ) : (
                filteredEntries.map((e) => {
                  const isPositive = e.change > 0;
                  const isNegative = e.change < 0;
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                        {e.date}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          e.type === 'supply'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : e.type === 'dispense'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : e.type === 'opening'
                            ? 'bg-purple-50 text-purple-800 border border-purple-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}>
                          {e.type === 'supply' && <ArrowDownLeft className="w-3 h-3 text-emerald-600" />}
                          {e.type === 'dispense' && <ArrowUpRight className="w-3 h-3 text-blue-600" />}
                          {e.type === 'opening' && <Boxes className="w-3 h-3 text-purple-600" />}
                          {e.type === 'adjustment' && <Sliders className="w-3 h-3 text-amber-600" />}
                          {e.typeLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        {e.categoryLabel}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-md ${
                          isPositive
                            ? 'bg-emerald-50 text-emerald-700 font-black'
                            : isNegative
                            ? 'bg-rose-50 text-rose-700 font-black'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {isPositive ? `+${e.change}` : e.change}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700 max-w-xs truncate">
                        {e.entityName}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-mono text-xs whitespace-nowrap">
                        {e.documentOrReceipt}
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {e.performedBy}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

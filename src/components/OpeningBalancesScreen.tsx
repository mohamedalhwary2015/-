import React, { useState } from 'react';
import { BookOpen, Check, AlertCircle, ShieldAlert } from 'lucide-react';
import { DatabaseSchema, StockCategory, STOCK_CATEGORIES, CATEGORY_LABELS } from '../types';
import { setOpeningBalance } from '../storage/db';

interface OpeningBalancesScreenProps {
  db: DatabaseSchema;
}

export const OpeningBalancesScreen: React.FC<OpeningBalancesScreenProps> = ({ db }) => {
  const [balances, setBalances] = useState<Record<StockCategory, number>>(() => {
    const init: any = {};
    for (const cat of STOCK_CATEGORIES) {
      init[cat] = db.stocks[cat]?.openingStock || db.openingBalances[cat]?.quantity || 0;
    }
    return init;
  });

  const [inventoryKeeper, setInventoryKeeper] = useState(
    db.officeSettings?.currentEmployee || 'غير محدد'
  );
  const [notes, setNotes] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleChange = (cat: StockCategory, val: string) => {
    const num = Math.max(0, parseInt(val, 10) || 0);
    setBalances(prev => ({ ...prev, [cat]: num }));
  };

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    for (const cat of STOCK_CATEGORIES) {
      setOpeningBalance(cat, balances[cat], inventoryKeeper, notes);
    }
    setSuccessMessage('تم اعتماد وتحديث أرصدة أول المدة بنجاح.');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  return (
    <div className="space-y-6" id="opening-balances-view">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              اعتماد وتسجيل أرصدة أول المدة والجرد الدفتري
            </h2>
            <p className="text-xs text-slate-500">
              قيد رصيد بداية السنة أو الدورة الدفترية لكل صنف من المستندات والدفاتر الرسمية
            </p>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 my-4 flex items-start gap-2.5 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>تنبيه الأمان الرقابي (Rule 22):</strong>
            تعديل رصيد أول المدة لا يصفر الرصيد الفعلي الحالي تلقائياً. يتم استخدام رصيد أول المدة كمرجع تاريخي ونظري في احتساب حركة الدورة الدفترية ومطابقة الجرد.
          </div>
        </div>

        {successMessage && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 my-4 flex items-center gap-2 text-xs font-semibold text-emerald-800">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSaveAll} className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {STOCK_CATEGORIES.map((cat) => {
              const currentStock = db.stocks[cat]?.currentStock || 0;
              return (
                <div
                  key={cat}
                  className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-between"
                >
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      {CATEGORY_LABELS[cat]}
                    </label>
                    <span className="text-[11px] text-slate-400 block mb-3">
                      الرصيد الفعلي التشغيلي الحالي: <strong className="text-slate-700">{currentStock}</strong>
                    </span>
                  </div>

                  <div>
                    <span className="text-[11px] text-slate-600 block mb-1 font-medium">
                      رصيد أول المدة المعتمد:
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={balances[cat]}
                      onChange={(e) => handleChange(cat, e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                الموظف المعتمد / أمين الخزينة
              </label>
              <input
                type="text"
                value={inventoryKeeper}
                onChange={(e) => setInventoryKeeper(e.target.value)}
                placeholder="اسم الموظف أو غير محدد"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                رقم محضر الجرد / ملاحظات البداية
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="مثال: محضر جرد الخزينة السنوي لسنة 2025"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              id="btn-save-opening-balances"
              className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              <span>حفظ واعتماد أرصدة أول المدة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

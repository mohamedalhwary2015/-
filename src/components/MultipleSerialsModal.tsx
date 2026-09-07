import React, { useState, useEffect } from 'react';
import { StockCategory, SerialRange } from '../types';
import { 
  X, 
  Plus, 
  Trash2, 
  Check, 
  Hash, 
  Layers, 
  BookOpen, 
  AlertCircle, 
  Calculator,
  ArrowLeftRight
} from 'lucide-react';

interface MultipleSerialsModalProps {
  isOpen: boolean;
  category: StockCategory | null;
  categoryName: string;
  unit: string;
  initialRanges?: SerialRange[];
  initialSingleFrom?: string;
  initialSingleTo?: string;
  onClose: () => void;
  onSave: (ranges: SerialRange[], totalQuantity: number) => void;
}

export const MultipleSerialsModal: React.FC<MultipleSerialsModalProps> = ({
  isOpen,
  category,
  categoryName,
  unit,
  initialRanges,
  initialSingleFrom,
  initialSingleTo,
  onClose,
  onSave,
}) => {
  const [ranges, setRanges] = useState<SerialRange[]>([]);
  const [autoUpdateQuantity, setAutoUpdateQuantity] = useState<boolean>(true);

  // Initialize ranges when modal opens
  useEffect(() => {
    if (!isOpen) return;

    if (initialRanges && initialRanges.length > 0) {
      setRanges(
        initialRanges.map((r, i) => ({
          id: r.id || `sr-${Date.now()}-${i}`,
          bookNumber: r.bookNumber || `دفتر ${i + 1}`,
          from: r.from || '',
          to: r.to || '',
          count: r.count ?? calculateCount(r.from, r.to),
          notes: r.notes || '',
        }))
      );
    } else if (initialSingleFrom || initialSingleTo) {
      setRanges([
        {
          id: `sr-${Date.now()}-0`,
          bookNumber: 'دفتر 1',
          from: initialSingleFrom || '',
          to: initialSingleTo || '',
          count: calculateCount(initialSingleFrom, initialSingleTo),
          notes: 'التسلسل الأول',
        },
      ]);
    } else {
      // Default two empty rows for quick entry of multiple sequences
      setRanges([
        {
          id: `sr-${Date.now()}-1`,
          bookNumber: 'دفتر 1',
          from: '',
          to: '',
          count: 0,
          notes: '',
        },
        {
          id: `sr-${Date.now()}-2`,
          bookNumber: 'دفتر 2',
          from: '',
          to: '',
          count: 0,
          notes: '',
        },
      ]);
    }
  }, [isOpen, initialRanges, initialSingleFrom, initialSingleTo]);

  if (!isOpen || !category) return null;

  function calculateCount(from?: string, to?: string): number {
    if (!from || !to) return 0;
    const nFrom = parseInt(from.trim(), 10);
    const nTo = parseInt(to.trim(), 10);
    if (isNaN(nFrom) || isNaN(nTo) || nTo < nFrom) return 0;
    return nTo - nFrom + 1;
  }

  const handleRangeChange = (index: number, field: keyof SerialRange, value: string) => {
    const updated = [...ranges];
    const current = { ...updated[index], [field]: value };

    // Auto-calculate count if from or to changed
    if (field === 'from' || field === 'to') {
      const fromVal = field === 'from' ? value : current.from;
      const toVal = field === 'to' ? value : current.to;
      current.count = calculateCount(fromVal, toVal);
    }

    updated[index] = current;
    setRanges(updated);
  };

  const handleAddRange = () => {
    const nextBookNum = `دفتر ${ranges.length + 1}`;
    setRanges([
      ...ranges,
      {
        id: `sr-${Date.now()}-${ranges.length}`,
        bookNumber: nextBookNum,
        from: '',
        to: '',
        count: 0,
        notes: '',
      },
    ]);
  };

  const handleRemoveRange = (index: number) => {
    if (ranges.length <= 1) {
      // Keep at least one empty
      setRanges([
        {
          id: `sr-${Date.now()}-0`,
          bookNumber: 'دفتر 1',
          from: '',
          to: '',
          count: 0,
          notes: '',
        },
      ]);
      return;
    }
    const updated = ranges.filter((_, i) => i !== index);
    setRanges(updated);
  };

  // Total count across all valid ranges
  const totalCalculatedUnits = ranges.reduce((acc, r) => acc + (r.count || 0), 0);

  const handleSave = () => {
    // Filter out completely empty ranges
    const validRanges = ranges.filter((r) => r.from.trim() !== '' || r.to.trim() !== '');

    if (validRanges.length === 0) {
      alert('يرجى إدخال تسلسل واحد على الأقل أو إغلاق النافذة');
      return;
    }

    // Check for logical inconsistencies in each range
    for (let i = 0; i < validRanges.length; i++) {
      const r = validRanges[i];
      if (r.from.trim() && r.to.trim()) {
        const nFrom = parseInt(r.from.trim(), 10);
        const nTo = parseInt(r.to.trim(), 10);
        if (!isNaN(nFrom) && !isNaN(nTo) && nTo < nFrom) {
          alert(`تنبيه في ${r.bookNumber || `التسلسل رقم ${i + 1}`}: الرقم "إلى مسلسل" (${r.to}) أصغر من "من مسلسل" (${r.from})! يرجى التصحيح.`);
          return;
        }
      }
    }

    onSave(validRanges, autoUpdateQuantity ? totalCalculatedUnits : 0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs no-print animate-in fade-in">
      <div 
        className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-emerald-900 to-slate-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-700/60 border border-emerald-500/40 text-white">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg">
                  إضافة وإدارة تسلسلات ودفاتر متعددة
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 text-xs font-bold">
                  {categoryName}
                </span>
              </div>
              <p className="text-xs text-emerald-200/90 mt-0.5">
                إثبات أرقام المسلسلات لعدة دفاتر غير متصلة أو متفرقة في الرصيد الافتتاحي
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Guidance Box */}
        <div className="bg-amber-50/80 border-b border-amber-200 p-3.5 px-5 flex items-start gap-3 text-xs text-amber-950">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-bold">ملاحظة تنظيمية للعهدة الدفترية بمكتب صحة سفلاق:</span>
            <p className="text-amber-900 leading-relaxed">
              إذا كانت شهادات الميلاد أو الوفاة واردة في دفاتر منفصلة (مثال: دفاتر بأرقام متفرقة)،
              يمكنك هنا تسجيل كل دفتر بتسلسله الخاص من - إلى، وسيقوم النظام تلقائياً باحتساب عدد الأوراق وإجمالي الرصيد.
            </p>
          </div>
        </div>

        {/* Ranges Form / Table */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-700" />
              <span className="text-xs sm:text-sm font-black text-slate-800">
                قائمة الدفاتر والتسلسلات ({ranges.length} دفاتر/تسلسلات)
              </span>
            </div>

            <button
              type="button"
              onClick={handleAddRange}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ إضافة تسلسل / دفتر جديد</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {ranges.map((r, idx) => (
              <div 
                key={r.id || idx}
                className="bg-slate-50 p-3 sm:p-3.5 rounded-xl border border-slate-200 hover:border-emerald-300 transition space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-700 text-white font-mono text-xs font-bold flex items-center justify-center">
                      {idx + 1}
                    </span>
                    <input
                      type="text"
                      placeholder="رقم الدفتر (مثال: دفتر 1)"
                      value={r.bookNumber || ''}
                      onChange={(e) => handleRangeChange(idx, 'bookNumber', e.target.value)}
                      className="px-2.5 py-1 text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg w-32 focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {r.count !== undefined && r.count > 0 ? (
                      <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold font-mono">
                        {r.count.toLocaleString('ar-EG')} {unit}
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}

                    <button
                      type="button"
                      onClick={() => handleRemoveRange(idx)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="حذف هذا التسلسل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 items-center">
                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                      من مسلسل: *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="مثال: 001001"
                        value={r.from}
                        onChange={(e) => handleRangeChange(idx, 'from', e.target.value)}
                        className="w-full px-3 py-1.5 font-mono text-xs sm:text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg text-center focus:border-emerald-600 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-1 flex justify-center text-slate-400 pt-3 sm:pt-0">
                    <ArrowLeftRight className="w-4 h-4" />
                  </div>

                  <div className="sm:col-span-4">
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                      إلى مسلسل: *
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="مثال: 001050"
                        value={r.to}
                        onChange={(e) => handleRangeChange(idx, 'to', e.target.value)}
                        className="w-full px-3 py-1.5 font-mono text-xs sm:text-sm font-bold text-slate-900 bg-white border border-slate-300 rounded-lg text-center focus:border-emerald-600 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                      ملاحظة الدفتر (اختياري):
                    </label>
                    <input
                      type="text"
                      placeholder="مثال: عهدة الخزينة"
                      value={r.notes || ''}
                      onChange={(e) => handleRangeChange(idx, 'notes', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs text-slate-700 bg-white border border-slate-300 rounded-lg focus:border-emerald-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Calculated Totals Box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-600 text-white">
                <Calculator className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs text-emerald-800 font-bold block">
                  إجمالي الأوراق المحسوبة لجميع التسلسلات:
                </span>
                <span className="text-lg sm:text-xl font-black text-emerald-950 font-mono">
                  {totalCalculatedUnits.toLocaleString('ar-EG')} {unit}
                </span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs font-bold text-emerald-900 cursor-pointer bg-white px-3 py-2 rounded-lg border border-emerald-300">
              <input
                type="checkbox"
                checked={autoUpdateQuantity}
                onChange={(e) => setAutoUpdateQuantity(e.target.checked)}
                className="w-4 h-4 text-emerald-700 rounded-md focus:ring-emerald-600"
              />
              <span>تحديث قيمة "الرصيد الافتتاحي" تلقائياً لتساوي هذا المجموع</span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-white hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold transition cursor-pointer"
          >
            إلغاء
          </button>

          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-black shadow-md transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>اعتماد وتثبيت المسلسلات</span>
          </button>
        </div>
      </div>
    </div>
  );
};

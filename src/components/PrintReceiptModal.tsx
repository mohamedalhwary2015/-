import React from 'react';
import { Printer, X, Building2, Check } from 'lucide-react';
import { DispenseRecord, CATEGORY_LABELS, TRANSACTION_TYPE_LABELS } from '../types';

interface PrintReceiptModalProps {
  record: DispenseRecord | null;
  onClose: () => void;
  officeName?: string;
  governorate?: string;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  record,
  onClose,
  officeName = 'مكتب صحة سفلاق - إدارة ساقلتة الصحية',
  governorate = 'محافظة سوهاج'
}) => {
  if (!record) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Control Bar (No print) */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50 no-print">
          <div className="flex items-center gap-2 font-bold text-slate-800 text-sm">
            <Printer className="w-4 h-4 text-teal-600" />
            <span>إيصال صرف مستند رسمي</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Printable Ticket Receipt */}
        <div className="p-6 overflow-y-auto print:p-0 print:m-0 text-slate-900" id="printable-receipt">
          <div className="border-2 border-slate-800 p-5 rounded-xl space-y-4 text-right">
            {/* Office Header */}
            <div className="text-center border-b border-slate-300 pb-3">
              <div className="text-xs font-bold text-slate-600">{governorate}</div>
              <div className="text-sm font-black text-slate-900 mt-0.5">{officeName}</div>
              <div className="text-[11px] font-bold text-teal-800 mt-1">
                إيصال استلام مستند رسمي / قسيمة سداد
              </div>
            </div>

            {/* Receipt Details */}
            <div className="text-xs space-y-2">
              <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                <span className="text-slate-500">رقم المعاملة:</span>
                <span className="font-mono font-bold">{record.transactionId.substring(0, 16)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                <span className="text-slate-500">التاريخ:</span>
                <span className="font-semibold">{record.date}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                <span className="text-slate-500">اسم المواطن:</span>
                <span className="font-bold text-slate-900">{record.citizenName}</span>
              </div>
              {record.nationalId && (
                <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                  <span className="text-slate-500">الرقم القومي:</span>
                  <span className="font-mono">{record.nationalId}</span>
                </div>
              )}
              {record.childOrDeceasedName && (
                <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                  <span className="text-slate-500">المولود / المتوفى:</span>
                  <span className="font-semibold">{record.childOrDeceasedName}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                <span className="text-slate-500">المستند المصروف:</span>
                <span className="font-bold text-teal-900">{CATEGORY_LABELS[record.category]}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                <span className="text-slate-500">الكمية:</span>
                <span className="font-bold">{record.quantity}</span>
              </div>
              {record.receiptNumber && (
                <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                  <span className="text-slate-500">رقم إيصال السداد:</span>
                  <span className="font-mono font-bold">{record.receiptNumber}</span>
                </div>
              )}
              {record.serialNumber && (
                <div className="flex justify-between py-1 border-b border-dotted border-slate-200">
                  <span className="text-slate-500">الرقم المسلسل:</span>
                  <span className="font-mono font-bold">{record.serialNumber}</span>
                </div>
              )}
              <div className="flex justify-between py-1.5 bg-slate-100 p-2 rounded-lg font-black text-sm text-slate-900">
                <span>المبلغ المحصل رسمياً:</span>
                <span className="text-teal-900 font-bold">{record.collectedAmount} جنيه مصري</span>
              </div>
            </div>

            {/* Signature */}
            <div className="pt-4 border-t border-slate-300 flex justify-between text-[11px] text-slate-600">
              <div>
                <span>الموظف المختص:</span>
                <p className="font-bold text-slate-800 mt-1">{record.dispensedBy}</p>
              </div>
              <div className="text-center">
                <span>خاتم الوحدة / المكتب</span>
                <div className="w-14 h-14 border border-dashed border-slate-400 rounded-full mx-auto mt-1 flex items-center justify-center text-[9px] text-slate-400">
                  خاتم
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

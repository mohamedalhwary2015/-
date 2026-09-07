import React from 'react';
import { DispenseRecord, LateRegistrationRecord } from '../types';
import { Printer, X, Building2, CheckCircle2 } from 'lucide-react';

interface PrintReceiptModalProps {
  dispenseRecord: DispenseRecord | null;
  lateRegRecord: LateRegistrationRecord | null;
  onClose: () => void;
}

export const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  dispenseRecord,
  lateRegRecord,
  onClose,
}) => {
  if (!dispenseRecord && !lateRegRecord) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-300 animate-in fade-in zoom-in duration-150 my-8">
        {/* Action bar (hidden when printed) */}
        <div className="no-print bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm">معاينة الطباعة الرسمية - مكتب صحة سفلاق</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              id="modal-print-button"
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الآن (Ctrl + P)</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* PRINT CONTENT BODY */}
        <div className="p-8 text-black bg-white select-text print:p-0 print:m-0" dir="rtl">
          {/* Official Header */}
          <div className="border-b-2 border-slate-900 pb-4 mb-6">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800">
              <div className="text-right leading-relaxed">
                <div>جمهورية مصر العربية</div>
                <div>وزارة الصحة والسكان</div>
                <div>مديرية الشؤون الصحية بسوهاج</div>
                <div>الإدارة الصحية بساقلتة</div>
                <div className="text-sm font-black text-slate-900 mt-1">مكتب صحة سفلاق</div>
              </div>

              <div className="text-center">
                <div className="w-14 h-14 mx-auto rounded-full border-2 border-slate-900 flex items-center justify-center mb-1">
                  <Building2 className="w-8 h-8 text-slate-800" />
                </div>
                <div className="text-[11px] font-black">شعار وزارة الصحة</div>
              </div>

              <div className="text-left text-xs font-mono leading-relaxed">
                <div>تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</div>
                <div>سجل قيد: المواليد والوفيات</div>
                <div>القرية: سفلاق</div>
              </div>
            </div>

            <div className="text-center mt-3">
              <h2 className="text-lg font-black tracking-wide inline-block border-b-2 border-slate-800 px-6 pb-1">
                {dispenseRecord
                  ? 'إيصال تسليم وثائق ومستندات رسمية للمواطن'
                  : 'استمارة إثبات وقيد ساقط قيد (ميلاد / وفاة)'}
              </h2>
            </div>
          </div>

          {/* DISPENSE RECEIPT PRINT VIEW */}
          {dispenseRecord && (
            <div className="space-y-4 text-xs md:text-sm leading-relaxed">
              {/* Box of Key Identifiers */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-3.5 bg-slate-50 rounded-xl border border-slate-400 font-mono">
                <div>
                  <span className="font-bold text-slate-600 block text-xs">رقم الشهادة:</span>
                  <span className="text-base font-black text-slate-900">
                    {dispenseRecord.certificateNumber || 'غير محدد'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block text-xs">رقم الإيصال:</span>
                  <span className="text-base font-black text-blue-900">
                    {dispenseRecord.healthCardReceiptNumber || '—'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block text-xs">المبلغ المورّد:</span>
                  <span className="text-base font-black text-emerald-900">
                    {dispenseRecord.paymentAmount !== undefined && dispenseRecord.paymentAmount !== null
                      ? `${dispenseRecord.paymentAmount} ج.م`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block text-xs">تاريخ ووقت الصرف:</span>
                  <span className="text-sm font-black text-slate-900">
                    {dispenseRecord.date} {dispenseRecord.time && `(${dispenseRecord.time})`}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block text-xs">الموظف الصارف:</span>
                  <span className="text-sm font-black text-emerald-900">
                    {dispenseRecord.dispensedBy}
                  </span>
                </div>
              </div>

              {/* Beneficiary Details */}
              <div className="space-y-2 border border-slate-300 rounded-xl p-3.5">
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="font-bold">اسم المنصرف له / المستلم:</span>
                  <span className="font-black text-base text-slate-900">{dispenseRecord.beneficiaryName}</span>
                </div>

                <div className="flex justify-between border-b border-slate-200 pb-1.5 text-xs">
                  <span className="font-bold text-slate-700">نوع واقعة الصرف:</span>
                  <span className="font-bold text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {dispenseRecord.dispenseEventType || (
                      dispenseRecord.dispenseType === 'birth_male' ? 'قيد ولادة - ذكر' :
                      dispenseRecord.dispenseType === 'birth_female' ? 'قيد ولادة - أنثى' :
                      dispenseRecord.dispenseType === 'death' ? 'قيد وفاة' :
                      dispenseRecord.dispenseType === 'health_card_male' ? 'بطاقة صحية ذكور' :
                      dispenseRecord.dispenseType === 'health_card_female' ? 'بطاقة صحية إناث' :
                      'صرف مستندات رسمي'
                    )}
                  </span>
                </div>

                {/* Extended fields */}
                {(dispenseRecord.gender || dispenseRecord.fatherName || dispenseRecord.motherName || dispenseRecord.address || dispenseRecord.eventDate) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 pt-1">
                    {dispenseRecord.gender && (
                      <div>
                        <span className="font-bold">النوع: </span>
                        <span>{dispenseRecord.gender === 'male' ? 'ذكر' : dispenseRecord.gender === 'female' ? 'أنثى' : 'غير محدد'}</span>
                      </div>
                    )}
                    {dispenseRecord.eventDate && (
                      <div>
                        <span className="font-bold">تاريخ الواقعة: </span>
                        <span className="font-mono">{dispenseRecord.eventDate}</span>
                      </div>
                    )}
                    {dispenseRecord.fatherName && (
                      <div>
                        <span className="font-bold">اسم الأب: </span>
                        <span>{dispenseRecord.fatherName}</span>
                      </div>
                    )}
                    {dispenseRecord.motherName && (
                      <div>
                        <span className="font-bold">اسم الأم: </span>
                        <span>{dispenseRecord.motherName}</span>
                      </div>
                    )}
                    {dispenseRecord.address && (
                      <div className="sm:col-span-2">
                        <span className="font-bold">العنوان: </span>
                        <span>{dispenseRecord.address}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Items Handed Over */}
              <div className="border border-slate-300 rounded-xl p-3.5 bg-white">
                <span className="font-bold text-slate-900 block mb-2">المستندات والأصناف المصروفة رسمياً:</span>
                <div className="divide-y divide-slate-100">
                  {dispenseRecord.itemsDeducted.map((it, idx) => {
                    let itemName = 'مستند رسمي';
                    if (it.stockCategory === 'birth_certificates') itemName = 'شهادة ميلاد ورقية معتمدة';
                    else if (it.stockCategory === 'birth_notifications') itemName = 'إخطار بلاغ ميلاد رسمي';
                    else if (it.stockCategory === 'death_certificates') itemName = 'شهادة وفاة ورقية وتصريح دفن';
                    else if (it.stockCategory === 'death_notifications') itemName = 'إخطار بلاغ وفاة رسمي';
                    else if (it.stockCategory === 'health_cards_male') itemName = 'بطاقة صحية ورعاية أطفال (ذكور)';
                    else if (it.stockCategory === 'health_cards_female') itemName = 'بطاقة صحية ورعاية أطفال (إناث)';
                    else if (it.stockCategory === 'late_reg_under_year') itemName = 'استمارة ساقط قيد (أقل من عام)';
                    else if (it.stockCategory === 'late_reg_over_year') itemName = 'استمارة ساقط قيد (أكبر من عام)';

                    return (
                      <div key={idx} className="flex justify-between items-center py-2 text-xs font-semibold">
                        <span className="text-slate-800">• {itemName}</span>
                        <span className="font-mono px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-black border border-emerald-200">
                          الكمية المصروفة: {it.quantity}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Notes if any */}
              {dispenseRecord.notes && (
                <div className="text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <strong className="block text-slate-700 mb-1">ملاحظات الصرف:</strong>
                  <span className="text-slate-900">{dispenseRecord.notes}</span>
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-4 pt-6 text-center text-xs font-bold mt-4 border-t border-slate-300">
                <div>
                  <p className="mb-6 text-slate-700">توقيع المنصرف له / المستلم</p>
                  <p className="font-normal text-[11px] text-slate-800">الاسم: {dispenseRecord.beneficiaryName}</p>
                  <p className="font-normal text-[11px] text-slate-500 mt-2">التوقيع: .....................</p>
                </div>
                <div>
                  <p className="mb-6 text-slate-700">كاتب صحة سفلاق</p>
                  <p className="font-normal text-[11px] text-slate-800">الاسم: {dispenseRecord.dispensedBy}</p>
                  <p className="font-normal text-[11px] text-slate-500 mt-2">التوقيع: .....................</p>
                </div>
                <div>
                  <p className="mb-6 text-slate-700">مفتش الصحة / خاتم المكتب</p>
                  <div className="w-16 h-16 mx-auto rounded-full border border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-400">
                    مكان الختم
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* LATE REGISTRATION PRINT VIEW */}
          {lateRegRecord && (
            <div className="space-y-4 text-xs md:text-sm leading-relaxed">
              <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-300 rounded-xl">
                <div>
                  <span className="font-bold text-slate-600 block text-xs">رقم استمارة ساقط القيد:</span>
                  <span className="text-base font-mono font-black">{lateRegRecord.formNumber}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block text-xs">تاريخ التقديم:</span>
                  <span className="font-mono font-bold">{lateRegRecord.submissionDate}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-600 block text-xs">النوع:</span>
                  <span className="font-bold">
                    {lateRegRecord.type === 'birth' ? 'ساقط قيد ميلاد' : 'ساقط قيد وفاة'}
                  </span>
                </div>
              </div>

              {/* Person & Applicant Details */}
              <div className="border border-slate-300 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between border-b border-slate-200 pb-1.5">
                  <span className="font-bold">اسم صاحب القيد رباعي:</span>
                  <span className="font-black text-sm">{lateRegRecord.personName}</span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-bold">تاريخ الواقعة: </span>
                    <span>{lateRegRecord.eventDate || '—'}</span>
                  </div>
                  <div>
                    <span className="font-bold">محل الواقعة: </span>
                    <span>{lateRegRecord.eventPlace}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-bold">اسم الأب: </span>
                    <span>{lateRegRecord.fatherName || '—'}</span>
                  </div>
                  <div>
                    <span className="font-bold">اسم الأم: </span>
                    <span>{lateRegRecord.motherName || '—'}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-200 grid grid-cols-2 gap-2">
                  <div>
                    <span className="font-bold">مقدم الطلب: </span>
                    <span>{lateRegRecord.applicantName} ({lateRegRecord.applicantRelation})</span>
                  </div>
                  <div>
                    <span className="font-bold">الرقم القومي: </span>
                    <span className="font-mono">{lateRegRecord.applicantNationalId || '—'}</span>
                  </div>
                </div>

                <div>
                  <span className="font-bold">سبب التأخر: </span>
                  <span>{lateRegRecord.delayReason}</span>
                </div>
              </div>

              {/* CRITICAL: PRINTED NOTES */}
              <div className="border-2 border-slate-800 rounded-xl p-4 bg-slate-50">
                <span className="font-black text-sm block mb-1.5">
                  الملاحظات الإدارية والمستندية وقرارات اللجنة المسجلة بالاستمارة:
                </span>
                <p className="whitespace-pre-wrap leading-relaxed text-slate-800">
                  {lateRegRecord.notes || 'لا توجد ملاحظات إضافية'}
                </p>
              </div>

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-4 pt-8 text-center text-xs font-bold mt-6 border-t border-slate-300">
                <div>
                  <p className="mb-8">مقدم الطلب</p>
                  <p className="font-normal text-[11px]">الاسم: {lateRegRecord.applicantName}</p>
                  <p className="font-normal text-[11px]">التوقيع: .....................</p>
                </div>
                <div>
                  <p className="mb-8">كاتب صحة سفلاق</p>
                  <p className="font-normal text-[11px]">الاسم: {lateRegRecord.staffName}</p>
                  <p className="font-normal text-[11px]">التوقيع: .....................</p>
                </div>
                <div>
                  <p className="mb-8">مفتش صحة ساقلتة</p>
                  <div className="w-20 h-20 mx-auto rounded-full border border-dashed border-slate-400 flex items-center justify-center text-[10px] text-slate-400">
                    خاتم شعار الجمهورية
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/**
 * طبقة المصادقة والتحقق من الهوية لطلبات الخادم (Client API Authentication Layer)
 * توفر التوكن الموحد (API_ACCESS_TOKEN) لجميع مسارات /api/*
 * 
 * ملاحظة أمنية صارمة:
 * كلمة المرور السرية للإدارة (ADMIN_SECRET_KEY) لا تُخزن ولا تُضمّن في كود العميل مطلقاً،
 * بل يكتبها الموظف المخوّل يدوياً في نافذة تأكيد منبثقة (Confirmation Modal) وقت التنفيذ الفعلي.
 */

export function getApiAccessToken(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_ACCESS_TOKEN) {
    return import.meta.env.VITE_API_ACCESS_TOKEN;
  }
  return '';
}

export interface ApiAuthHeaderOptions {
  adminSecretKey?: string;
  extraHeaders?: Record<string, string>;
}

/**
 * دالة مركزية لتوليد Headers الموثوقة والمصادق عليها لجميع اتصالات الخادم
 */
export function getApiAuthHeaders(options?: ApiAuthHeaderOptions): Record<string, string> {
  const token = getApiAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.extraHeaders || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['x-api-key'] = token;
  }

  // يتم تمرير كلمة السر الإدارية حصراً من إدخال الموظف اليدوي في شاشة التأكيد
  if (options?.adminSecretKey) {
    headers['x-admin-key'] = options.adminSecretKey.trim();
  }

  return headers;
}

/**
 * طبقة الاتصال والترويسات لطلبات الخادم (Client API Communication Layer)
 * التطبيق يعمل داخل شبكة موثوقة لمكتب صحة سفلاق بدون متطلبات توكن أو كلمات مرور معقدة.
 */

export function getApiAccessToken(): string {
  return '';
}

export interface ApiAuthHeaderOptions {
  adminSecretKey?: string;
  extraHeaders?: Record<string, string>;
}

/**
 * دالة مركزية لتوليد Headers المعتمدة لجميع اتصالات الخادم
 */
export function getApiAuthHeaders(options?: ApiAuthHeaderOptions): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(options?.extraHeaders || {}),
  };
}


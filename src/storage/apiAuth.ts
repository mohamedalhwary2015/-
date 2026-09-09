/**
 * طبقة المصادقة والتحقق من الهوية لطلبات الخادم (Client API Authentication Layer)
 * توفر التوكن الموحد (API_ACCESS_TOKEN) لجميع مسارات /api/*
 * وتوفر توكن الحماية المشددة (ADMIN_SECRET_KEY) للمسارات التدميرية
 */

export function getApiAccessToken(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_ACCESS_TOKEN) {
    return import.meta.env.VITE_API_ACCESS_TOKEN;
  }
  return 'saflaq-office-secure-token-2026';
}

export function getAdminSecretKey(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_ADMIN_SECRET_KEY) {
    return import.meta.env.VITE_ADMIN_SECRET_KEY;
  }
  return 'saflaq-admin-destructive-auth-2026';
}

export interface ApiAuthHeaderOptions {
  isDestructive?: boolean;
  extraHeaders?: Record<string, string>;
}

/**
 * دالة مركزية لتوليد Headers الموثوقة والمصادق عليها لجميع اتصالات الخادم
 */
export function getApiAuthHeaders(options?: ApiAuthHeaderOptions): Record<string, string> {
  const token = getApiAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-api-key': token,
    ...(options?.extraHeaders || {}),
  };

  if (options?.isDestructive) {
    headers['x-admin-key'] = getAdminSecretKey();
  }

  return headers;
}

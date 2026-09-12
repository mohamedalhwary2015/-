/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * API Client Configuration (Trusted Network - No Passwords)
 */

export function getApiAuthHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Client-App': 'sohag-saflaq-health-office',
    'X-Client-Time': new Date().toISOString()
  };
}

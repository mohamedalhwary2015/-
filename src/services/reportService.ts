import { DispenseRecord, LateRegistrationRecord, StockCategory, StockItem } from '../types';

export type NormalizedGender = 'male' | 'female' | 'unknown';

/**
 * Robust gender normalization handling diverse Arabic and Latin inputs.
 */
export function normalizeGender(gender?: string | null): NormalizedGender {
  if (!gender) return 'unknown';
  const g = gender.toString().trim().toLowerCase();
  
  // Female variants
  if (
    g === 'female' ||
    g === 'f' ||
    g === 'انثى' ||
    g === 'أنثى' ||
    g === 'انثي' ||
    g === 'أنثي' ||
    g === 'بنت' ||
    g === 'إناث' ||
    g === 'اناث' ||
    g.includes('أنث') ||
    g.includes('انث') ||
    g.includes('وردي')
  ) {
    return 'female';
  }

  // Male variants
  if (
    g === 'male' ||
    g === 'm' ||
    g === 'ذكر' ||
    g === 'ولد' ||
    g === 'ذكور' ||
    g.includes('ذكر') ||
    g.includes('أزرق') ||
    g.includes('ازرق')
  ) {
    return 'male';
  }

  return 'unknown';
}

/**
 * Check if the item deducted matches a given stock category.
 * Defensively checks both item.stockCategory and legacy item.category.
 */
export function getItemCategory(item: any): StockCategory | undefined {
  return item?.stockCategory || item?.category;
}

/**
 * Determines whether a dispense record is purely for health card(s)
 * without registering an actual birth (no birth certificate or notification deducted).
 */
export function isPureHealthCardDispense(record: DispenseRecord): boolean {
  if (record.dispenseType === 'health_card_male' || record.dispenseType === 'health_card_female') {
    return true;
  }

  const items = record.itemsDeducted || [];
  if (items.length === 0) return false;

  const hasHealthCards = items.some(
    (i) =>
      (getItemCategory(i) === 'health_cards_male' || getItemCategory(i) === 'health_cards_female') &&
      Number(i.quantity) > 0
  );

  const hasBirthDocs = items.some(
    (i) =>
      (getItemCategory(i) === 'birth_certificates' || getItemCategory(i) === 'birth_notifications') &&
      Number(i.quantity) > 0
  );

  const hasDeathDocs = items.some(
    (i) =>
      (getItemCategory(i) === 'death_certificates' || getItemCategory(i) === 'death_notifications') &&
      Number(i.quantity) > 0
  );

  return hasHealthCards && !hasBirthDocs && !hasDeathDocs;
}

/**
 * Checks if a transaction represents an ACTUAL birth registration.
 * CRITICAL: Health cards alone DO NOT count as a birth registration!
 */
export function isActualBirthRegistration(record: DispenseRecord): boolean {
  // Pure health card dispenses are never birth registrations
  if (isPureHealthCardDispense(record)) return false;

  // Death registrations are never birth registrations
  if (isDeathRegistration(record)) return false;

  const items = record.itemsDeducted || [];

  // 1. Check if birth certificate or birth notification is deducted
  const hasBirthDocs = items.some(
    (i) =>
      (getItemCategory(i) === 'birth_certificates' || getItemCategory(i) === 'birth_notifications') &&
      Number(i.quantity) > 0
  );

  if (hasBirthDocs) return true;

  // 2. Check explicit birth dispense types if itemsDeducted is empty (legacy records)
  if (items.length === 0) {
    if (
      record.dispenseType === 'birth_certificate' ||
      record.dispenseType === 'birth_notification' ||
      record.dispenseType === 'birth_male' ||
      record.dispenseType === 'birth_female'
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a transaction represents a death registration.
 */
export function isDeathRegistration(record: DispenseRecord): boolean {
  if (
    record.dispenseType === 'death' ||
    record.dispenseType === 'death_certificate' ||
    record.dispenseType === 'death_notification'
  ) {
    return true;
  }

  const items = record.itemsDeducted || [];
  return items.some(
    (i) =>
      (getItemCategory(i) === 'death_certificates' || getItemCategory(i) === 'death_notifications') &&
      Number(i.quantity) > 0
  );
}

/**
 * Calculates the count of health cards dispensed in a record.
 */
export function getDispensedHealthCards(record: DispenseRecord): { male: number; female: number; total: number } {
  let male = 0;
  let female = 0;

  const items = record.itemsDeducted || [];
  items.forEach((i) => {
    const cat = getItemCategory(i);
    const qty = Number(i.quantity) || 0;
    if (cat === 'health_cards_male') male += qty;
    if (cat === 'health_cards_female') female += qty;
  });

  // Fallback for legacy records without itemsDeducted
  if (male === 0 && female === 0 && items.length === 0) {
    if (record.dispenseType === 'health_card_male') male = 1;
    else if (record.dispenseType === 'health_card_female') female = 1;
  }

  return { male, female, total: male + female };
}

/**
 * Returns the exact quantity of a specific stock category dispensed in a record.
 */
export function getCategoryDispensedQuantity(record: DispenseRecord, category: StockCategory): number {
  const items = record.itemsDeducted || [];
  return items
    .filter((i) => getItemCategory(i) === category)
    .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
}

export interface DispenseTypeDisplay {
  label: string;
  badgeClass: string;
  iconType: 'birth' | 'death' | 'health_card' | 'document';
}

/**
 * Determines user-facing transaction type and badge.
 */
export function getDispenseTypeDisplay(record: DispenseRecord): DispenseTypeDisplay {
  const gender = normalizeGender(record.gender);

  // 1. Pure Health Card Dispense
  if (isPureHealthCardDispense(record)) {
    const cards = getDispensedHealthCards(record);
    if (gender === 'female' || record.dispenseType === 'health_card_female' || (cards.female > 0 && cards.male === 0)) {
      return {
        label: 'صرف بطاقة صحية (إناث)',
        badgeClass: 'bg-pink-50 text-pink-800 border border-pink-200',
        iconType: 'health_card',
      };
    }
    return {
      label: 'صرف بطاقة صحية (ذكور)',
      badgeClass: 'bg-indigo-50 text-indigo-800 border border-indigo-200',
      iconType: 'health_card',
    };
  }

  // 2. Death Registration
  if (isDeathRegistration(record)) {
    if (gender === 'female') {
      return {
        label: 'قيد وفاة وتصريح دفن (أنثى)',
        badgeClass: 'bg-slate-100 text-slate-800 border border-slate-300',
        iconType: 'death',
      };
    }
    if (gender === 'male') {
      return {
        label: 'قيد وفاة وتصريح دفن (ذكر)',
        badgeClass: 'bg-slate-100 text-slate-800 border border-slate-300',
        iconType: 'death',
      };
    }
    return {
      label: 'قيد وفاة وتصريح دفن',
      badgeClass: 'bg-slate-100 text-slate-800 border border-slate-300',
      iconType: 'death',
    };
  }

  // 3. Actual Birth Registration
  if (isActualBirthRegistration(record)) {
    if (gender === 'female' || record.dispenseType === 'birth_female') {
      return {
        label: 'تسجيل قيد مولود (أنثى)',
        badgeClass: 'bg-rose-50 text-rose-800 border border-rose-200',
        iconType: 'birth',
      };
    }
    return {
      label: 'تسجيل قيد مولود (ذكر)',
      badgeClass: 'bg-blue-50 text-blue-800 border border-blue-200',
      iconType: 'birth',
    };
  }

  // 4. Custom or Specific Event Type
  if (record.dispenseEventType) {
    return {
      label: record.dispenseEventType,
      badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
      iconType: 'document',
    };
  }

  return {
    label: 'صرف مستندات رسمية',
    badgeClass: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    iconType: 'document',
  };
}

/**
 * Validates a transaction before submission or update.
 */
export function validateTransaction(record: Partial<DispenseRecord>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!record.beneficiaryName || !record.beneficiaryName.trim()) {
    errors.push('اسم المستفيد أو المنصرف له مطلوب.');
  }
  if (!record.date) {
    errors.push('تاريخ الحركة مطلوب.');
  }
  if (!record.itemsDeducted || record.itemsDeducted.length === 0) {
    errors.push('يجب تحديد صنف واحد على الأقل للصرف.');
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

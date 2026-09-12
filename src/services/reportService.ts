/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Official Health Bureau Monthly & Statistical Report Service
 */

import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_SHORT_LABELS,
  DispenseRecord,
  SupplyTransaction,
  LateRegistrationRecord
} from '../types';

export interface MonthlyCategorySummary {
  category: StockCategory;
  categoryLabel: string;
  openingStock: number;       // رصيد أول الشهر
  receivedThisMonth: number;  // الوارد خلال الشهر
  dispensedThisMonth: number; // المنصرف خلال الشهر
  damagedThisMonth: number;   // التالف خلال الشهر
  closingStock: number;       // الرصيد الفعلي بنهاية الشهر
}

export interface VitalStatisticsSummary {
  // Births
  birthCertificatesTotal: number;
  birthCertificatesMale: number;
  birthCertificatesFemale: number;
  birthNotificationsTotal: number;

  // Deaths
  deathCertificatesTotal: number;
  deathCertificatesMale: number;
  deathCertificatesFemale: number;
  deathNotificationsTotal: number;

  // Health Cards - STRICTLY SEPARATE FROM BIRTHS (Rule 25)
  healthCardsMaleTotal: number;
  healthCardsFemaleTotal: number;
  healthCardsTotal: number;

  // Revenue / Collected Fees (Rule 28)
  healthCardRevenue: number;
  certificatesRevenue: number;
  totalCollectedRevenue: number;

  // Late Registrations
  lateRegistrationsBirth: number;
  lateRegistrationsDeath: number;
  lateRegistrationsTotal: number;
}

export interface OfficialMonthlyReport {
  year: number;
  month: number; // 1-12
  monthNameAr: string;
  officeName: string;
  governorate: string;
  categorySummaries: MonthlyCategorySummary[];
  vitalStats: VitalStatisticsSummary;
  totalDispensedRecords: number;
  totalSuppliesRecords: number;
  reportDate: string;
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'إبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export function getArabicMonthName(monthIndex: number): string {
  return ARABIC_MONTHS[monthIndex - 1] || `شهر ${monthIndex}`;
}

export function generateOfficialMonthlyReport(
  db: DatabaseSchema,
  year: number,
  month: number
): OfficialMonthlyReport {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const monthPrefix = `${year}-${pad(month)}`;

  // Filter non-deleted transactions for the specified month
  const monthSupplies = (db.supplies || []).filter(
    s => !s.isDeleted && s.date && s.date.startsWith(monthPrefix)
  );

  const monthDispenses = (db.dispenses || []).filter(
    d => !d.isDeleted && d.date && d.date.startsWith(monthPrefix)
  );

  const monthLateRegs = (db.lateRegistrations || []).filter(
    r => !r.isDeleted && r.date && r.date.startsWith(monthPrefix)
  );

  // 1. Category Movement Summaries
  const categorySummaries: MonthlyCategorySummary[] = STOCK_CATEGORIES.map(cat => {
    const stock = db.stocks[cat];
    const currentActual = stock ? stock.currentStock : 0;

    const received = monthSupplies
      .filter(s => s.category === cat)
      .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

    const dispensed = monthDispenses
      .filter(d => d.category === cat)
      .reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);

    const opening = currentActual - received + dispensed;

    return {
      category: cat,
      categoryLabel: CATEGORY_LABELS[cat],
      openingStock: Math.max(0, opening),
      receivedThisMonth: received,
      dispensedThisMonth: dispensed,
      damagedThisMonth: 0,
      closingStock: currentActual
    };
  });

  // 2. Vital Statistics - STRICT SEPARATION (Rule 25, 26, 27, 28)
  let birthCertificatesMale = 0;
  let birthCertificatesFemale = 0;
  let birthNotificationsTotal = 0;

  let deathCertificatesMale = 0;
  let deathCertificatesFemale = 0;
  let deathNotificationsTotal = 0;

  let healthCardsMaleTotal = 0;
  let healthCardsFemaleTotal = 0;

  let healthCardRevenue = 0;
  let certificatesRevenue = 0;

  for (const d of monthDispenses) {
    const amt = Number(d.collectedAmount) || 0;

    // Strict Classification: Check transactionType and category
    if (d.transactionType === 'health_card_male' || d.category === 'health_cards_male') {
      healthCardsMaleTotal += d.quantity;
      healthCardRevenue += amt;
    } else if (d.transactionType === 'health_card_female' || d.category === 'health_cards_female') {
      healthCardsFemaleTotal += d.quantity;
      healthCardRevenue += amt;
    } else if (d.transactionType === 'birth' || d.category === 'birth_certificates') {
      // Birth Certificates
      if (d.gender === 'أنثى') {
        birthCertificatesFemale += d.quantity;
      } else {
        // Default to Male for standard birth certs if specified or default
        birthCertificatesMale += d.quantity;
      }
      certificatesRevenue += amt;
    } else if (d.transactionType === 'birth_notification' || d.category === 'birth_notifications') {
      birthNotificationsTotal += d.quantity;
    } else if (d.transactionType === 'death' || d.category === 'death_certificates') {
      // Death Certificates (Rule 26: Male = ذكر, Female = أنثى)
      if (d.gender === 'أنثى') {
        deathCertificatesFemale += d.quantity;
      } else {
        deathCertificatesMale += d.quantity;
      }
      certificatesRevenue += amt;
    } else if (d.transactionType === 'death_notification' || d.category === 'death_notifications') {
      deathNotificationsTotal += d.quantity;
    } else {
      certificatesRevenue += amt;
    }
  }

  // Late Registrations
  let lateRegistrationsBirth = 0;
  let lateRegistrationsDeath = 0;
  for (const r of monthLateRegs) {
    if (r.eventType === 'وفاة') {
      lateRegistrationsDeath++;
    } else {
      lateRegistrationsBirth++;
    }
  }

  const vitalStats: VitalStatisticsSummary = {
    birthCertificatesTotal: birthCertificatesMale + birthCertificatesFemale,
    birthCertificatesMale,
    birthCertificatesFemale,
    birthNotificationsTotal,

    deathCertificatesTotal: deathCertificatesMale + deathCertificatesFemale,
    deathCertificatesMale,
    deathCertificatesFemale,
    deathNotificationsTotal,

    // Health cards are strictly NOT added to birth certificates
    healthCardsMaleTotal,
    healthCardsFemaleTotal,
    healthCardsTotal: healthCardsMaleTotal + healthCardsFemaleTotal,

    healthCardRevenue,
    certificatesRevenue,
    totalCollectedRevenue: healthCardRevenue + certificatesRevenue,

    lateRegistrationsBirth,
    lateRegistrationsDeath,
    lateRegistrationsTotal: lateRegistrationsBirth + lateRegistrationsDeath
  };

  return {
    year,
    month,
    monthNameAr: getArabicMonthName(month),
    officeName: db.officeSettings?.officeName || 'مكتب صحة سفلاق',
    governorate: db.officeSettings?.governorate || 'محافظة سوهاج',
    categorySummaries,
    vitalStats,
    totalDispensedRecords: monthDispenses.length,
    totalSuppliesRecords: monthSupplies.length,
    reportDate: new Date().toLocaleDateString('ar-EG')
  };
}

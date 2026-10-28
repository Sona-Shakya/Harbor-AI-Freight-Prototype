/**
 * Accounts Receivable (AR) Aging Calculator
 *
 * Implements SRS Module M11 (FR-11.6):
 * "System shall reconcile payments received against outstanding invoices and flag aging receivables (30/60/90 day buckets)."
 *
 * Buckets:
 * 1. Current / Not Yet Due: dueDate >= today
 * 2. 1–30 Days Overdue:    1 <= daysOverdue <= 30
 * 3. 31–60 Days Overdue:   31 <= daysOverdue <= 60
 * 4. 61–90 Days Overdue:   61 <= daysOverdue <= 90
 * 5. > 90 Days Overdue:    daysOverdue > 90
 *
 * Paid invoices (outstanding balance <= 0 or status === 'paid') are categorized as 'paid'
 * and do not count toward outstanding aging debt.
 */

export const AGING_BUCKET_DEFINITIONS = [
  { id: 'current', label: 'Current / Not Due', rangeLabel: 'Not Due', minDays: -Infinity, maxDays: 0, tone: 'success' },
  { id: '1-30', label: '1–30 Days Overdue', rangeLabel: '1–30 Days', minDays: 1, maxDays: 30, tone: 'warning-light' },
  { id: '31-60', label: '31–60 Days Overdue', rangeLabel: '31–60 Days', minDays: 31, maxDays: 60, tone: 'warning' },
  { id: '61-90', label: '61–90 Days Overdue', rangeLabel: '61–90 Days', minDays: 61, maxDays: 90, tone: 'danger-light' },
  { id: '90+', label: '> 90 Days Overdue', rangeLabel: '90+ Days', minDays: 91, maxDays: Infinity, tone: 'danger' },
];

/**
 * Normalizes a date to UTC midnight for consistent calendar-day calculations.
 *
 * @param {Date|string|number} dateInput
 * @returns {Date}
 */
export function normalizeToUtcMidnight(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Calculates days overdue and determines the aging bucket for an individual invoice.
 *
 * @param {Object} invoice - Invoice record
 * @param {Date|string} [referenceDate=new Date()] - Reference date for calculation (defaults to now)
 * @returns {Object|null}
 */
export function calculateInvoiceAging(invoice, referenceDate = new Date()) {
  if (!invoice) return null;

  const amount = Number(invoice.amount || 0);
  const amountPaid = Number(invoice.amount_paid || 0);
  const outstanding = Math.max(0, amount - amountPaid);
  const status = String(invoice.status || 'pending').toLowerCase();

  const isPaid = status === 'paid' || (amount > 0 && outstanding <= 0);

  if (!invoice.due_date) {
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      amount,
      amountPaid,
      outstanding,
      daysOverdue: 0,
      bucketId: isPaid ? 'paid' : 'current',
      bucketLabel: isPaid ? 'Paid' : 'Current / Not Due',
      isOverdue: false,
      isPaid,
    };
  }

  const due = normalizeToUtcMidnight(invoice.due_date);
  const ref = normalizeToUtcMidnight(referenceDate);

  const msPerDay = 1000 * 60 * 60 * 24;
  const diffDays = Math.round((ref.getTime() - due.getTime()) / msPerDay);

  let bucketId = 'current';
  let bucketLabel = 'Current / Not Due';
  let isOverdue = false;

  if (isPaid) {
    bucketId = 'paid';
    bucketLabel = 'Paid';
    isOverdue = false;
  } else if (diffDays > 0) {
    isOverdue = true;
    if (diffDays <= 30) {
      bucketId = '1-30';
      bucketLabel = '1–30 Days Overdue';
    } else if (diffDays <= 60) {
      bucketId = '31-60';
      bucketLabel = '31–60 Days Overdue';
    } else if (diffDays <= 90) {
      bucketId = '61-90';
      bucketLabel = '61–90 Days Overdue';
    } else {
      bucketId = '90+';
      bucketLabel = '> 90 Days Overdue';
    }
  }

  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoice_number,
    amount,
    amountPaid,
    outstanding,
    daysOverdue: isOverdue ? diffDays : 0,
    bucketId,
    bucketLabel,
    isOverdue,
    isPaid,
  };
}

/**
 * Aggregates an array of invoices into standard AR aging buckets and summary statistics.
 *
 * @param {Array<Object>} invoices - Array of invoice objects
 * @param {Date|string} [referenceDate=new Date()] - Reference date for calculation
 * @returns {Object}
 */
export function aggregateArAging(invoices, referenceDate = new Date()) {
  const bucketMap = {
    current: { ...AGING_BUCKET_DEFINITIONS[0], count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0 },
    '1-30': { ...AGING_BUCKET_DEFINITIONS[1], count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0 },
    '31-60': { ...AGING_BUCKET_DEFINITIONS[2], count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0 },
    '61-90': { ...AGING_BUCKET_DEFINITIONS[3], count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0 },
    '90+': { ...AGING_BUCKET_DEFINITIONS[4], count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0 },
    paid: { id: 'paid', label: 'Paid in Full', rangeLabel: 'Settled', count: 0, totalAmount: 0, totalPaid: 0, totalOutstanding: 0, tone: 'neutral' },
  };

  let totalInvoiced = 0;
  let totalPaid = 0;
  let totalOutstanding = 0;
  let totalOverdue = 0;
  let overdueCount = 0;

  if (Array.isArray(invoices)) {
    for (const inv of invoices) {
      const calc = calculateInvoiceAging(inv, referenceDate);
      if (!calc) continue;

      const bucket = bucketMap[calc.bucketId];
      if (bucket) {
        bucket.count++;
        bucket.totalAmount += calc.amount;
        bucket.totalPaid += calc.amountPaid;
        bucket.totalOutstanding += calc.outstanding;
      }

      totalInvoiced += calc.amount;
      totalPaid += calc.amountPaid;
      totalOutstanding += calc.outstanding;

      if (calc.isOverdue) {
        totalOverdue += calc.outstanding;
        overdueCount++;
      }
    }
  }

  // Calculate percentages based on total outstanding debt
  const buckets = AGING_BUCKET_DEFINITIONS.map((def) => {
    const b = bucketMap[def.id];
    const percentage = totalOutstanding > 0 ? (b.totalOutstanding / totalOutstanding) * 100 : 0;
    return {
      ...b,
      amount: b.totalOutstanding,
      percentage: Math.round(percentage * 10) / 10,
    };
  });

  const bucketsById = {};
  buckets.forEach((b) => {
    bucketsById[b.id] = b;
  });

  const overdueRatio = totalOutstanding > 0 ? Math.round((totalOverdue / totalOutstanding) * 1000) / 10 : 0;

  return {
    totalInvoiced: Math.round(totalInvoiced * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalOutstanding: Math.round(totalOutstanding * 100) / 100,
    totalOverdue: Math.round(totalOverdue * 100) / 100,
    overdueCount,
    overduePercentage: overdueRatio,
    overdueRatio,
    totalCount: Array.isArray(invoices) ? invoices.length : 0,
    paidInvoicesCount: bucketMap['paid'].count,
    unpaidCount: (Array.isArray(invoices) ? invoices.length : 0) - bucketMap['paid'].count,
    buckets: bucketsById,
    bucketList: buckets,
    paidBucket: bucketMap['paid'],
    summary: {
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalOverdue: Math.round(totalOverdue * 100) / 100,
      overdueCount,
      overdueRatio,
      invoiceCount: Array.isArray(invoices) ? invoices.length : 0,
    },
  };
}

/**
 * Filters invoices by selected aging bucket.
 *
 * @param {Array<Object>} invoices
 * @param {string} bucketId - 'all', 'current', '1-30', '31-60', '61-90', '90+', or 'paid'
 * @param {Date|string} [referenceDate=new Date()]
 * @returns {Array<Object>}
 */
export function filterInvoicesByAgingBucket(invoices, bucketId, referenceDate = new Date()) {
  if (!Array.isArray(invoices)) return [];
  if (!bucketId || bucketId === 'all') return invoices;

  return invoices.filter((inv) => {
    const calc = calculateInvoiceAging(inv, referenceDate);
    return calc && calc.bucketId === bucketId;
  });
}

import type { InvoiceListQuery } from '../../../api/adminClient';
import { isValidUuid } from '../../../utils/validators';

export interface TransactionFilters {
  q: string;
  status: string;
  paymentMethod: string;
  planTier: string;
  billingCycle: string;
  dateFrom: string;
  dateTo: string;
  minAmount: string;
  maxAmount: string;
  couponPresence: 'all' | 'yes' | 'no';
  couponCode: string;
  txType: 'all' | 'auto' | 'manual';
  upgrade: 'all' | 'upgrade' | 'new';
  userId: string;
  excludeInternal: boolean;
}

export const DEFAULT_FILTERS: TransactionFilters = {
  q: '',
  status: 'all',
  paymentMethod: 'all',
  planTier: 'all',
  billingCycle: 'all',
  dateFrom: '',
  dateTo: '',
  minAmount: '',
  maxAmount: '',
  couponPresence: 'all',
  couponCode: '',
  txType: 'all',
  upgrade: 'all',
  userId: '',
  excludeInternal: false,
};

export type FilterErrors = Partial<Record<'userId' | 'amount' | 'date', string>>;

/** Đầu ngày theo giờ địa phương → ISO (để BE so sánh đúng mốc thời gian, không lệch múi giờ). */
const startOfDayIso = (isoDate: string, plusDays = 0): string => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d + plusDays).toISOString();
};

const parseAmount = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN;
};

export function validateFilters(f: TransactionFilters): FilterErrors {
  const errors: FilterErrors = {};
  if (f.userId.trim() && !isValidUuid(f.userId)) errors.userId = 'User ID phải là UUID hợp lệ.';

  const min = parseAmount(f.minAmount);
  const max = parseAmount(f.maxAmount);
  if (Number.isNaN(min) || Number.isNaN(max)) errors.amount = 'Số tiền phải là số nguyên không âm.';
  else if (min !== null && max !== null && min > max) errors.amount = 'Số tiền tối thiểu không được lớn hơn tối đa.';

  if (f.dateFrom && f.dateTo && f.dateFrom > f.dateTo) errors.date = 'Từ ngày không được sau Đến ngày.';
  return errors;
}

/** Chuyển bộ lọc trên form thành query gửi BE. Trường không hợp lệ bị bỏ qua (kèm lỗi ở validateFilters). */
export function buildInvoiceQuery(f: TransactionFilters): InvoiceListQuery {
  const errors = validateFilters(f);
  const query: InvoiceListQuery = {};

  if (f.q.trim()) query.q = f.q.trim();
  if (f.status !== 'all') query.status = f.status;
  if (f.paymentMethod !== 'all') query.payment_method = f.paymentMethod as InvoiceListQuery['payment_method'];
  if (f.planTier !== 'all') query.plan_tier = f.planTier as InvoiceListQuery['plan_tier'];
  if (f.billingCycle !== 'all') query.billing_cycle = f.billingCycle as InvoiceListQuery['billing_cycle'];
  if (!errors.date) {
    if (f.dateFrom) query.date_from = startOfDayIso(f.dateFrom);
    if (f.dateTo) query.date_to = startOfDayIso(f.dateTo, 1); // BE: date_to là cận trên loại trừ
  }
  if (!errors.amount) {
    const min = parseAmount(f.minAmount);
    const max = parseAmount(f.maxAmount);
    if (min !== null) query.min_amount_vnd = min;
    if (max !== null) query.max_amount_vnd = max;
  }
  if (f.couponPresence !== 'all') query.has_coupon = f.couponPresence === 'yes';
  if (f.couponCode.trim()) query.coupon_code = f.couponCode.trim();
  if (f.txType !== 'all') query.is_manual = f.txType === 'manual';
  if (f.upgrade !== 'all') query.is_upgrade = f.upgrade === 'upgrade';
  if (f.userId.trim() && !errors.userId) query.user_id = f.userId.trim();
  if (f.excludeInternal) query.exclude_internal = true;
  return query;
}

/** Số ô lọc đang khác giá trị mặc định (hiển thị cạnh tiêu đề bộ lọc). */
export function countActiveFilters(f: TransactionFilters): number {
  return (Object.keys(DEFAULT_FILTERS) as (keyof TransactionFilters)[]).filter((key) => {
    const value = f[key];
    return typeof value === 'string' ? value.trim() !== DEFAULT_FILTERS[key] : value !== DEFAULT_FILTERS[key];
  }).length;
}

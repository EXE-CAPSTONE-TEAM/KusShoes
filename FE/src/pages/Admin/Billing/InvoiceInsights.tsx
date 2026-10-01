import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { StatusBadge } from '../../../components/Admin/StatusBadge';
import type { AdminInvoice, InvoiceSummary } from '../../../types/admin';
import shared from '../admin-shared.module.css';
import { CYCLE_LABEL, formatDateTime, formatVnd, METHOD_LABEL, tierLabel } from './invoiceFormat';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Đang chờ',
  awaiting_approval: 'Chờ duyệt',
  paid: 'Đã thanh toán',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
  refunded: 'Đã hoàn tiền',
};
interface SummaryProps {
  summary: InvoiceSummary | null;
  loading: boolean;
  error: string | null;
}

/** Revenue overview for the invoice list's current filters — every number comes from the DB. */
export const InvoiceSummaryPanel: React.FC<SummaryProps> = ({ summary, loading, error }) => {
  if (error) return <p className={shared.errorMessage}>{error}</p>;
  const show = (text: string | null | undefined) => (summary ? text : loading ? '…' : '—');
  const cards: { label: string; value: string | null | undefined; hint?: string }[] = [
    {
      label: 'Doanh thu ròng',
      value: show(summary && formatVnd(summary.net_vnd)),
      hint: 'Đã thu trừ hoàn tiền',
    },
    {
      label: 'Doanh thu gộp',
      value: show(summary && formatVnd(summary.gross_vnd)),
      hint: 'Hóa đơn đã thanh toán hoặc hoàn tiền',
    },
    {
      label: 'Tổng giao dịch',
      value: show(summary && String(summary.total_count)),
      hint: summary ? `${summary.settled_count} đã thu tiền` : undefined,
    },
    {
      label: 'Giá trị trung bình',
      value: show(summary && formatVnd(summary.average_order_vnd)),
      hint: 'Mỗi giao dịch đã thu',
    },
    {
      label: 'Tỷ lệ thành công',
      value: show(
        summary &&
          (summary.success_rate_percent === null ? '—' : `${summary.success_rate_percent}%`),
      ),
      hint: 'Không tính giao dịch đang chờ',
    },
    {
      label: 'Hoàn tiền',
      value: show(summary && formatVnd(summary.refunded_vnd)),
      hint: summary ? `${summary.refund_count} lần hoàn` : undefined,
    },
    {
      label: 'Giảm giá đã cấp',
      value: show(summary && formatVnd(summary.discount_vnd)),
      hint: 'Trên giao dịch đã thu',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
      <div className={shared.statsGrid}>
        {cards.map((card) => (
          <div key={card.label} className={shared.statCard}>
            <div className={shared.statLabel}>
              <span className={shared.statLabelText}>{card.label}</span>
            </div>
            <div className={shared.statValue}>{card.value}</div>
            {card.hint && (
              <div className={shared.mutedCell} style={{ fontSize: '0.72rem' }}>
                {card.hint}
              </div>
            )}
          </div>
        ))}
      </div>

      {summary && summary.total_count > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}
        >
          <Breakdown
            title="Theo trạng thái"
            rows={summary.by_status.map((r) => ({
              key: r.status,
              label: STATUS_LABEL[r.status] ?? r.status,
              count: r.count,
              amount: r.amount_vnd,
            }))}
          />
          <Breakdown
            title="Theo phương thức"
            rows={summary.by_method.map((r) => ({
              key: r.payment_method,
              label: METHOD_LABEL[r.payment_method] ?? r.payment_method,
              count: r.count,
              amount: r.amount_vnd,
            }))}
          />
          <Breakdown
            title="Theo gói"
            rows={summary.by_plan.map((r) => ({
              key: `${r.plan_tier}-${r.billing_cycle}`,
              label: `${tierLabel(r.plan_tier)} · ${CYCLE_LABEL[r.billing_cycle] ?? r.billing_cycle}`,
              count: r.count,
              amount: r.amount_vnd,
            }))}
          />
        </div>
      )}
    </div>
  );
};

const Breakdown: React.FC<{
  title: string;
  rows: { key: string; label: string; count: number; amount: number }[];
}> = ({ title, rows }) => (
  <div className={`${shared.tableWrap} glass-panel`}>
    <table className={shared.table}>
      <thead>
        <tr>
          <th>{title}</th>
          <th style={{ textAlign: 'right' }}>SL</th>
          <th style={{ textAlign: 'right' }}>Số tiền</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={3}>
              <div className={shared.emptyState}>Chưa có dữ liệu.</div>
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{row.label}</td>
            <td className={shared.mutedCell} style={{ textAlign: 'right' }}>
              {row.count}
            </td>
            <td style={{ textAlign: 'right' }}>{formatVnd(row.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

interface DetailProps {
  invoice: AdminInvoice | null;
  onOpenChange: (open: boolean) => void;
}

type DetailRow = [string, React.ReactNode];

/** Read-only view of one transaction with every field an admin needs to reconcile it. */
export const InvoiceDetailDialog: React.FC<DetailProps> = ({ invoice, onOpenChange }) => {
  const rows: DetailRow[] = [];
  if (invoice) {
    const discount = invoice.coupon_code
      ? `${invoice.coupon_code} (−${formatVnd(invoice.discount_vnd)})`
      : invoice.discount_vnd
        ? `−${formatVnd(invoice.discount_vnd)}`
        : '—';
    rows.push(
      ['Mã giao dịch', invoice.id],
      ['Mã đơn (order code)', String(invoice.order_code)],
      ['Mã tham chiếu cổng', invoice.payment_reference ?? '—'],
      ['Số biên nhận', invoice.receipt_number ?? '—'],
      ['Khách hàng', invoice.user_email ?? invoice.user_id],
      [
        'Gói',
        `${tierLabel(invoice.plan_tier)} · ${CYCLE_LABEL[invoice.billing_cycle] ?? invoice.billing_cycle}`,
      ],
      ['Phương thức', METHOD_LABEL[invoice.payment_method] ?? invoice.payment_method],
      ['Trạng thái', <StatusBadge key="status" status={invoice.status} />],
      ['Giá niêm yết', formatVnd(invoice.listed_price_vnd)],
      ['Giảm giá', discount],
      ['Số tiền thực trả', formatVnd(invoice.amount_vnd)],
    );
    if (invoice.vat.enabled) {
      rows.push(
        [`VAT (${invoice.vat.rate_percent}%)`, formatVnd(invoice.vat.vat_vnd)],
        ['Doanh thu trước thuế', formatVnd(invoice.vat.net_vnd)],
      );
    }
    rows.push(
      ['Ngày tạo', formatDateTime(invoice.created_at)],
      ['Ngày thanh toán', formatDateTime(invoice.paid_at)],
    );
    if (invoice.is_manual) {
      rows.push(
        ['Giao dịch thủ công', 'Có'],
        ['Người thu tiền', invoice.collected_by ?? '—'],
        ['Người tạo', invoice.created_by ?? '—'],
        ['Người duyệt', invoice.approved_by ?? '—'],
      );
    }
  }

  return (
    <Dialog.Root open={invoice !== null} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={shared.dialogOverlay} />
        <Dialog.Content className={shared.dialogContent}>
          <Dialog.Title className={shared.dialogTitle}>Chi tiết giao dịch</Dialog.Title>
          <Dialog.Description className={shared.dialogDescription}>
            Thông tin đối soát của giao dịch này.
          </Dialog.Description>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(120px, 40%) 1fr',
              gap: '8px 16px',
              margin: '8px 0 16px',
            }}
          >
            {rows.map(([label, content]) => (
              <React.Fragment key={label}>
                <dt className={shared.mutedCell}>{label}</dt>
                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{content}</dd>
              </React.Fragment>
            ))}
          </dl>
          <div className={shared.dialogActions}>
            <Dialog.Close asChild>
              <button type="button" className="btn-outline">
                Đóng
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  Download,
  Printer,
  ArrowLeft,
  RotateCw,
  Clock,
  Undo2,
} from 'lucide-react';
import { api, type Invoice } from '../../api/client';
import { billingApi } from '../../api/billing';
import { formatVnd, formatDate, formatDateTime } from '../../utils/format';
import { pushAnalyticsEvent } from '../../analytics';
import { useToast } from '../../context/ToastContext';
import { invoiceItemLabel, retryCheckoutPath } from './invoiceLabels';
import styles from './BillPage.module.css';

interface BillPageProps {
  navigate?: (path: string) => void;
}

/** MSG29: the gateway return page polls every 3 s, 20 times (≈1 min), as before. */
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

type BillState = 'checking' | 'paid' | 'refunded' | 'failed' | 'pending' | 'timeout' | 'error';

/** Settled statuses end polling; pending/awaiting_approval keep it going on the return page. */
function stateForStatus(status: string): BillState | null {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'paid';
    case 'refunded':
      return 'refunded';
    case 'failed':
    case 'cancelled':
      return 'failed';
    default:
      return null;
  }
}

export const BillPage: React.FC<BillPageProps> = ({ navigate }) => {
  const { t } = useTranslation('billing');
  const { toast } = useToast();

  const handleNavigate = (path: string) => {
    if (navigate) {
      navigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const pathname = window.location.pathname;
  const searchParams = new URLSearchParams(window.location.search);
  // /billing/success is the PayOS/MoMo return URL; /billing/invoices/<id> is a bill opened from history.
  const returnedFromGateway = pathname === '/billing/success';
  const pathInvoiceId = pathname.startsWith('/billing/invoices/')
    ? pathname.replace('/billing/invoices/', '').split('/')[0]
    : null;
  // PayOS appends orderCode to the return URL, MoMo appends orderId.
  const queryOrderCode = searchParams.get('orderCode') || searchParams.get('orderId') || null;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [billState, setBillState] = useState<BillState>('checking');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const resolveInvoice = React.useCallback(async (): Promise<Invoice | null> => {
    if (pathInvoiceId) return api.getInvoice(pathInvoiceId);
    if (queryOrderCode) return api.getInvoiceByOrder(queryOrderCode);
    const list = await api.listInvoices({ limit: 1 });
    return list[0] ?? null;
  }, [pathInvoiceId, queryOrderCode]);

  /** Fires `purchase` once per order, only on the gateway return page — never for a history view. */
  const pushPurchaseOnce = React.useCallback((inv: Invoice) => {
    const storageKey = `kusshoes_purchase_pushed_${inv.order_code}`;
    try {
      if (sessionStorage.getItem(storageKey)) return;
      sessionStorage.setItem(storageKey, '1');
    } catch {
      // Storage blocked: still push once for this page view.
    }

    let planCode = inv.plan_tier;
    let currency = 'VND';
    try {
      const lastCheckout = sessionStorage.getItem('kusshoes_last_checkout');
      if (lastCheckout) {
        const parsed = JSON.parse(lastCheckout);
        planCode = parsed.plan_code || planCode;
        currency = parsed.currency || currency;
        sessionStorage.removeItem('kusshoes_last_checkout');
      }
    } catch {
      // Malformed or unavailable checkout memo: fall back to the invoice's own values.
    }

    pushAnalyticsEvent('purchase', {
      transaction_id: String(inv.order_code),
      value: inv.amount_vnd,
      currency,
      plan_code: planCode,
    });
  }, []);

  // Each run gets its own token so an unmount or a manual refresh stops the previous one.
  const runRef = useRef<{ cancelled: boolean; timer?: number } | null>(null);

  const stopRun = () => {
    if (!runRef.current) return;
    runRef.current.cancelled = true;
    window.clearTimeout(runRef.current.timer);
    runRef.current = null;
  };

  const load = React.useCallback(() => {
    stopRun();
    const run: { cancelled: boolean; timer?: number } = { cancelled: false };
    runRef.current = run;
    setBillState('checking');
    let attempts = 0;

    const tick = async () => {
      if (run.cancelled) return;
      attempts += 1;
      let next: BillState | null = null;
      try {
        const inv = await resolveInvoice();
        if (run.cancelled) return;
        if (inv) {
          setInvoice(inv);
          next = stateForStatus(inv.status);
          if (next === 'paid' && returnedFromGateway) pushPurchaseOnce(inv);
          // A bill opened from history is shown as it is now; only the return page waits.
          if (!next && !returnedFromGateway) next = 'pending';
        } else if (!returnedFromGateway) {
          next = 'error';
        }
      } catch {
        if (run.cancelled) return;
        if (!returnedFromGateway) next = 'error';
      }

      if (!next && attempts >= POLL_MAX_ATTEMPTS) next = 'timeout';
      if (next) {
        setBillState(next);
        return;
      }
      run.timer = window.setTimeout(() => void tick(), POLL_INTERVAL_MS);
    };

    void tick();
  }, [resolveInvoice, returnedFromGateway, pushPurchaseOnce]);

  useEffect(() => {
    load();
    return stopRun;
  }, [load]);

  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setDownloadingPdf(true);
    try {
      const receipt = await billingApi.getReceipt(invoice.id);
      window.open(receipt.download_url, '_blank', 'noopener');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : t('toast.receiptError'), 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const discountLabel = (inv: Invoice) => {
    if (inv.coupon_code) return t('checkout.couponDiscount', { code: inv.coupon_code });
    if (inv.is_upgrade) return t('checkout.upgradeDiscount');
    return t('bill.discount');
  };

  const showBill = (billState === 'paid' || billState === 'refunded') && invoice;
  const itemLabel = invoice ? invoiceItemLabel(invoice, t) : '';

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('bill.title')}</h1>
      </div>

      {billState === 'checking' && (
        <div className={styles.banner}>
          <Loader2 size={20} className={`${styles.bannerIcon} ${styles.spin}`} />
          <div>
            <div className={styles.bannerTitle}>{t('bill.checkingTitle')}</div>
            <div className={styles.bannerSubtitle}>
              {t('bill.checkingSubtitle', { orderCode: invoice?.order_code ?? queryOrderCode ?? '—' })}
            </div>
          </div>
        </div>
      )}

      {billState === 'timeout' && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <AlertTriangle size={20} className={`${styles.bannerIcon} ${styles.bannerIconWarning}`} />
          <div style={{ flexGrow: 1 }}>
            <div className={styles.bannerTitle}>{t('bill.timeoutTitle')}</div>
            <div className={styles.bannerSubtitle}>{t('bill.timeoutSubtitle')}</div>
            <div style={{ marginTop: 12 }}>
              <button type="button" className={styles.btnSecondary} onClick={() => load()}>
                <RotateCw size={14} />
                {t('bill.refresh')}
              </button>
            </div>
          </div>
        </div>
      )}

      {billState === 'pending' && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <Clock size={20} className={`${styles.bannerIcon} ${styles.bannerIconWarning}`} />
          <div style={{ flexGrow: 1 }}>
            <div className={styles.bannerTitle}>{t('bill.pendingTitle')}</div>
            <div className={styles.bannerSubtitle}>
              {t('bill.pendingSubtitle', { orderCode: invoice?.order_code ?? '—' })}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className={styles.btnSecondary} onClick={() => load()}>
                <RotateCw size={14} />
                {t('bill.refresh')}
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => handleNavigate('/billing')}>
                <ArrowLeft size={14} />
                {t('bill.backToBilling')}
              </button>
            </div>
          </div>
        </div>
      )}

      {billState === 'error' && (
        <div className={`${styles.banner} ${styles.bannerDanger}`}>
          <XCircle size={20} className={`${styles.bannerIcon} ${styles.bannerIconDanger}`} />
          <div style={{ flexGrow: 1 }}>
            <div className={styles.bannerTitle}>{t('bill.loadErrorTitle')}</div>
            <div className={styles.bannerSubtitle}>{t('bill.loadErrorSubtitle')}</div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button type="button" className={styles.btnSecondary} onClick={() => load()}>
                <RotateCw size={14} />
                {t('bill.refresh')}
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => handleNavigate('/billing')}>
                <ArrowLeft size={14} />
                {t('bill.backToBilling')}
              </button>
            </div>
          </div>
        </div>
      )}

      {billState === 'failed' && (
        <div className={`${styles.banner} ${styles.bannerDanger}`}>
          <XCircle size={20} className={`${styles.bannerIcon} ${styles.bannerIconDanger}`} />
          <div style={{ flexGrow: 1 }}>
            <div className={styles.bannerTitle}>{t('bill.failedTitle')}</div>
            <div className={styles.bannerSubtitle}>{t('bill.failedSubtitle')}</div>
            <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {t('bill.supportContact')}
            </p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => handleNavigate(invoice ? retryCheckoutPath(invoice) : '/billing')}
              >
                {t('bill.tryAgain')}
              </button>
              <button type="button" className={styles.btnSecondary} onClick={() => handleNavigate('/billing')}>
                <ArrowLeft size={14} />
                {t('bill.backToBilling')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBill && (
        <>
          {billState === 'refunded' ? (
            <div className={`${styles.banner} ${styles.bannerWarning}`}>
              <Undo2 size={20} className={`${styles.bannerIcon} ${styles.bannerIconWarning}`} />
              <div>
                <div className={styles.bannerTitle}>{t('bill.refundedTitle')}</div>
                <div className={styles.bannerSubtitle}>{t('bill.refundedSubtitle')}</div>
              </div>
            </div>
          ) : (
            <div className={`${styles.banner} ${styles.bannerSuccess}`}>
              <CheckCircle2 size={20} className={`${styles.bannerIcon} ${styles.bannerIconSuccess}`} />
              <div>
                <div className={styles.bannerTitle}>{t('bill.paidTitle')}</div>
                <div className={styles.bannerSubtitle}>{t('bill.paidSubtitle')}</div>
              </div>
            </div>
          )}

          <div className={styles.billCard}>
            {/* Bill Header */}
            <div className={styles.billTop}>
              <div className={styles.brandGroup}>
                <span className={styles.brandName}>KusShoes</span>
                <span className={styles.brandSub}>Shoe Design Platform</span>
              </div>
              <div className={styles.receiptMeta}>
                <span className={styles.receiptNumber}>
                  {invoice.receipt_number || invoice.id.slice(0, 8)}
                </span>
                <span className={styles.orderCode}>
                  {t('bill.orderCode')}: #{invoice.order_code ?? '—'}
                </span>
              </div>
            </div>

            {/* Timestamps & Payment Method */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('bill.paymentMethod')}</h3>
              <div className={styles.grid2}>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>{t('bill.paidAt')}</span>
                  <span className={styles.metaVal}>{formatDateTime(invoice.paid_at)}</span>
                </div>
                {invoice.transfer?.transferred_at && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('bill.transferredAt')}</span>
                    <span className={styles.metaVal}>
                      {formatDateTime(invoice.transfer.transferred_at)}
                    </span>
                  </div>
                )}
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>{t('bill.paymentMethod')}</span>
                  <span className={styles.metaVal}>{invoice.payment_method ? invoice.payment_method.toUpperCase() : '—'}</span>
                </div>
                {invoice.transfer?.bank_reference && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('bill.bankReference')}</span>
                    <span className={styles.metaVal}>{invoice.transfer.bank_reference}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Sender details if available */}
            {invoice.transfer && (invoice.transfer.sender_name || invoice.transfer.sender_account_number) && (
              <div className={styles.section}>
                <h3 className={styles.sectionTitle}>{t('bill.sender')}</h3>
                <div className={styles.grid2}>
                  {invoice.transfer.sender_name && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaKey}>{t('bill.sender')}</span>
                      <span className={styles.metaVal}>{invoice.transfer.sender_name}</span>
                    </div>
                  )}
                  {invoice.transfer.sender_account_number && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaKey}>{t('bill.senderAccount')}</span>
                      <span className={styles.metaVal}>{invoice.transfer.sender_account_number}</span>
                    </div>
                  )}
                  {(invoice.transfer.sender_bank_name || invoice.transfer.sender_bank_id) && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaKey}>{t('bill.senderBank')}</span>
                      <span className={styles.metaVal}>
                        {invoice.transfer.sender_bank_name || invoice.transfer.sender_bank_id}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Service & Validity Period */}
            <div className={styles.section}>
              <h3 className={styles.sectionTitle}>{t('bill.item')}</h3>
              <div className={styles.grid2}>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>{t('bill.item')}</span>
                  <span className={styles.metaVal}>{itemLabel}</span>
                </div>
                {invoice.subscription_period && (
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('bill.servicePeriod')}</span>
                    <span className={styles.metaVal}>
                      {t('checkout.fromTo', {
                        from: formatDate(invoice.subscription_period.start),
                        to: formatDate(invoice.subscription_period.end),
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Line Items & Total (BR-31: listed price, discount, amount actually paid) */}
            <div className={styles.section}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t('bill.item')}</th>
                    <th>{t('bill.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      {itemLabel}
                      <div className={styles.vatNote}>{t('bill.listedPrice')}</div>
                    </td>
                    <td>{formatVnd(invoice.listed_price_vnd)}</td>
                  </tr>
                  {invoice.discount_vnd > 0 && (
                    <tr>
                      <td>{discountLabel(invoice)}</td>
                      <td>-{formatVnd(invoice.discount_vnd)}</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className={styles.summarySection}>
                <div className={styles.totalSummaryRow}>
                  <span>{t('bill.totalPaid')}</span>
                  <span className={styles.totalSummaryAmount}>{formatVnd(invoice.amount_vnd)}</span>
                </div>
                {invoice.vat?.enabled && (
                  <div className={styles.vatNote}>
                    {t('bill.vatIncluded', {
                      rate: invoice.vat.rate_percent,
                      amount: formatVnd(invoice.vat.vat_vnd),
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.actionRow}>
            <button type="button" className={styles.btnSecondary} onClick={() => handleNavigate('/billing')}>
              <ArrowLeft size={16} />
              {t('bill.backToBilling')}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => window.print()}>
              <Printer size={16} />
              {t('bill.print')}
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleDownloadPdf()}
              disabled={downloadingPdf || !invoice.receipt_number}
            >
              {downloadingPdf ? <Loader2 size={16} className={styles.spin} /> : <Download size={16} />}
              {t('bill.downloadPdf')}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default BillPage;

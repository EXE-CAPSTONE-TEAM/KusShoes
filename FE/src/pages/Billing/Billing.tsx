import React, { useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  HardDrive,
  Check,
  X,
  Building,
  FileText,
  AlertTriangle,
  Tag,
  Loader2,
  Gem,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmDialog } from '../../components/ConfirmDialog/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import {
  api,
  ApiError,
  type Plan,
  type Subscription,
  type Usage,
  type Invoice as ApiInvoice,
  type UserProfile,
} from '../../api/client';
import { billingApi, type CouponPreview, type CreditBalance, type CreditLedgerItem } from '../../api/billing';
import { formatVnd, formatDate } from '../../utils/format';
import { LoadingDots } from '../../components/LoadingDots/LoadingDots';
import styles from './Billing.module.css';

type InvoiceStatus = 'Paid' | 'Pending' | 'Failed' | 'Cancelled' | 'Refunded';

const GRACE_DAYS = 3; // BR-90: view/edit stays open, exports are blocked

interface Invoice {
  id: string;
  date: string;
  amount: string;
  vatNote: string | null;
  status: InvoiceStatus;
  receiptNumber: string | null;
}

function formatTierName(tier: string): string {
  return tier.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeInvoiceStatus(status: string): InvoiceStatus {
  const normalized = status.toLowerCase();
  if (normalized === 'paid') return 'Paid';
  if (normalized === 'failed') return 'Failed';
  if (normalized === 'cancelled') return 'Cancelled';
  if (normalized === 'refunded') return 'Refunded';
  return 'Pending';
}

function toInvoiceRow(invoice: ApiInvoice): Invoice {
  return {
    id: invoice.id,
    date: formatDate(invoice.created_at),
    amount: formatVnd(invoice.amount_vnd),
    vatNote: invoice.vat.enabled ? `incl. ${invoice.vat.rate_percent}% VAT` : null,
    status: normalizeInvoiceStatus(invoice.status),
    receiptNumber: invoice.receipt_number ?? null,
  };
}

function profileDisplayName(profile: UserProfile | null): string {
  if (!profile) return '—';
  return `${profile.first_name} ${profile.last_name}`.trim() || profile.username;
}

/** Status indicator adhering to docs/DESIGN.md Section 5.7 (6px dot + 12px label) */
function StatusIndicator({ status, label }: { status: 'success' | 'warning' | 'danger' | 'neutral'; label: string }) {
  const colorMap = {
    success: 'var(--success)',
    warning: 'var(--warning)',
    danger: 'var(--danger)',
    neutral: 'var(--neutral)',
  };

  return (
    <span className={styles.statusIndicator}>
      <span className={styles.statusDot} style={{ backgroundColor: colorMap[status] }} />
      <span>{label}</span>
    </span>
  );
}

/** Usage meter adhering to docs/DESIGN.md Section 5.13 */
function UsageMeter({ label, used, limit }: { label: string; used: number; limit: number | null | undefined }) {
  const hasLimit = typeof limit === 'number' && limit > 0;
  const percent = hasLimit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const displayValue = hasLimit ? `${used} of ${limit}` : `${used} (unlimited)`;

  let fillColor = 'var(--text-primary)';
  if (hasLimit) {
    if (percent > 95) fillColor = 'var(--danger)';
    else if (percent >= 80) fillColor = 'var(--accent)';
  }

  return (
    <div className={styles.meterContainer}>
      <div className={styles.meterLabels}>
        <span className={styles.meterLabel}>{label}</span>
        <span className={styles.meterValue}>{displayValue}</span>
      </div>
      <div className={styles.meterTrack}>
        <div
          className={styles.meterFill}
          style={{
            width: hasLimit ? `${percent}%` : '0%',
            backgroundColor: fillColor,
          }}
        />
      </div>
    </div>
  );
}

export const Billing: React.FC = () => {
  const { toast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponPreviews, setCouponPreviews] = useState<Record<string, CouponPreview>>({});
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);
  const [creditLedger, setCreditLedger] = useState<CreditLedgerItem[]>([]);
  const [showBuyCreditModal, setShowBuyCreditModal] = useState(false);
  const [buyQuantity, setBuyQuantity] = useState(1);
  const [buyingCredit, setBuyingCredit] = useState(false);

  // Landing here from PayOS/MoMo (/billing/success): poll until the webhook has settled the invoice (MSG29).
  const returnedFromGateway = window.location.pathname === '/billing/success';
  const cancelledAtGateway = window.location.pathname === '/billing/cancel';
  const [paymentCheck, setPaymentCheck] = useState<'idle' | 'checking' | 'paid' | 'failed' | 'timeout'>(
    returnedFromGateway ? 'checking' : 'idle',
  );

  useEffect(() => {
    if (!returnedFromGateway) return;
    let attempts = 0;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const latest = (await api.listInvoices())[0];
        if (cancelled) return;
        const status = latest?.status.toLowerCase();
        if (status === 'paid') {
          window.clearInterval(timer);
          const [nextSubscription, nextInvoices, nextCredit, nextLedger] = await Promise.all([
            api.subscription().catch(() => null),
            api.listInvoices(),
            billingApi.getCreditBalance().catch(() => null),
            billingApi.getCreditLedger().catch(() => null),
          ]);
          if (cancelled) return;
          if (nextSubscription) setSubscription(nextSubscription);
          setInvoices(nextInvoices.map(toInvoiceRow));
          if (nextCredit) setCreditBalance(nextCredit);
          if (nextLedger) setCreditLedger(nextLedger.items);
          setPaymentCheck('paid');
        } else if (status === 'failed' || status === 'cancelled') {
          window.clearInterval(timer);
          setPaymentCheck('failed');
        } else if (attempts >= 20) {
          window.clearInterval(timer);
          setPaymentCheck('timeout');
        }
      } catch {
        if (attempts >= 20) {
          window.clearInterval(timer);
          setPaymentCheck('timeout');
        }
      }
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [returnedFromGateway]);

  useEffect(() => {
    const subscriptionRequest = api.subscription().catch((caught) => {
      if (caught instanceof ApiError && caught.status === 404) return null;
      throw caught;
    });
    const creditRequest = billingApi.getCreditBalance().catch(() => null);
    const creditLedgerRequest = billingApi.getCreditLedger().catch(() => null);

    Promise.all([
      api.listPlans(),
      subscriptionRequest,
      api.listInvoices(),
      api.usage(),
      api.profile(),
      creditRequest,
      creditLedgerRequest,
    ])
      .then(([nextPlans, nextSubscription, nextInvoices, nextUsage, nextProfile, nextCredit, nextLedger]) => {
        setPlans(nextPlans);
        setSubscription(nextSubscription);
        setUsage(nextUsage);
        setProfile(nextProfile);
        setInvoices(nextInvoices.map(toInvoiceRow));
        setCreditBalance(nextCredit);
        if (nextLedger) setCreditLedger(nextLedger.items);
      })
      .catch((caught) => toast(caught instanceof Error ? caught.message : 'Unable to load billing data.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  const currentPlan = useMemo(
    () =>
      plans.find(
        (plan) =>
          subscription?.tier === plan.tier ||
          subscription?.tier === `${plan.tier}_${plan.billing_cycle}`,
      ),
    [plans, subscription],
  );

  const pricingTiers = plans.map((plan) => {
    const isCurrent = currentPlan?.id === plan.id;
    return {
      plan,
      name: formatTierName(plan.tier),
      price: formatVnd(plan.price_vnd),
      period: plan.billing_cycle ?? 'one time',
      description: `${plan.bake_priority} bake priority`,
      features: [
        plan.max_projects === null ? 'Unlimited projects' : `${plan.max_projects} active projects`,
        plan.max_exports_per_month === null ? 'Unlimited exports' : `${plan.max_exports_per_month} exports / month`,
        `Formats: ${plan.allowed_export_formats.join(', ') || 'none'}`,
      ],
      cta: isCurrent ? 'Current Plan' : 'Choose Plan',
      popular: plan.tier.toLowerCase().includes('basic'),
      isCurrent,
    };
  });

  const handleChoosePlan = async (plan: Plan, gateway: 'payos' | 'momo') => {
    try {
      const checkoutUrl = await api.createCheckout(plan.tier, plan.billing_cycle ?? 'monthly', gateway, appliedCoupon);
      window.location.assign(checkoutUrl);
      setShowUpgradeModal(false);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to start checkout.', 'error');
    }
  };

  const handleBuyCredit = async (gateway: 'payos' | 'momo') => {
    setBuyingCredit(true);
    try {
      const checkoutUrl = await billingApi.createCreditCheckout(buyQuantity, gateway);
      window.location.assign(checkoutUrl);
      setShowBuyCreditModal(false);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to start Credit checkout.', 'error');
    } finally {
      setBuyingCredit(false);
    }
  };

  const applyCoupon = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = couponInput.trim();
    if (!code) return;
    setApplyingCoupon(true);
    try {
      const paidPlans = plans.filter((plan) => plan.tier !== 'free');
      const settled = await Promise.allSettled(
        paidPlans.map((plan) => billingApi.previewCoupon(plan.tier, plan.billing_cycle ?? 'monthly', code)),
      );
      const previews: Record<string, CouponPreview> = {};
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') previews[paidPlans[index].id] = result.value;
      });
      if (Object.keys(previews).length === 0) {
        setAppliedCoupon(null);
        setCouponPreviews({});
        toast('This code is not valid for any plan.', 'error');
        return;
      }
      setAppliedCoupon(code);
      setCouponPreviews(previews);
      toast('Coupon applied. Discounted prices are shown on eligible plans.');
    } finally {
      setApplyingCoupon(false);
    }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCouponPreviews({});
    setCouponInput('');
  };

  const downloadReceipt = async (invoiceId: string) => {
    setDownloadingReceipt(invoiceId);
    try {
      const receipt = await billingApi.getReceipt(invoiceId);
      window.open(receipt.download_url, '_blank', 'noopener');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to download the receipt.', 'error');
    } finally {
      setDownloadingReceipt(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await api.cancelSubscription(false);
      toast('Cancellation requested. Access remains active until the period ends.');
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to cancel subscription.', 'error');
    }
  };

  // Determine top status badge for subscription
  const subscriptionStatusInfo = useMemo(() => {
    if (!subscription || subscription.tier === 'free') {
      return { status: 'neutral' as const, label: 'Free plan' };
    }
    if (subscription.status === 'grace') {
      return { status: 'warning' as const, label: 'Grace period' };
    }
    if (subscription.status === 'active') {
      return { status: 'success' as const, label: 'Active subscription' };
    }
    return { status: 'neutral' as const, label: subscription.status };
  }, [subscription]);

  return (
    <div className={styles.container}>
      {/* Page Header - docs/DESIGN.md Section 6.1 (Row 1: 56px, max 1 primary button) */}
      <div className={styles.pageHeader}>
        <div className={styles.headerTitleGroup}>
          <h1 className={styles.title}>Billing & Subscriptions</h1>
          <StatusIndicator status={subscriptionStatusInfo.status} label={subscriptionStatusInfo.label} />
        </div>
        <button
          className={styles.btnPrimary}
          onClick={() => setShowUpgradeModal(true)}
        >
          {subscription && subscription.tier !== 'free' ? 'Change plan' : 'Upgrade plan'}
        </button>
      </div>

      {/* Notification Banners */}
      {cancelledAtGateway && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <AlertTriangle size={16} className={styles.bannerIcon} />
          <span>The payment was cancelled. You have not been charged.</span>
        </div>
      )}
      {paymentCheck === 'checking' && (
        <div className={styles.banner}>
          <Loader2 size={16} className={`${styles.bannerIcon} ${styles.spin}`} />
          <span>Confirming your payment with the provider…</span>
        </div>
      )}
      {paymentCheck === 'paid' && (
        <div className={`${styles.banner} ${styles.bannerSuccess}`}>
          <Check size={16} className={styles.bannerIcon} />
          <span>Payment confirmed. Your plan is active and your receipt is available below.</span>
        </div>
      )}
      {paymentCheck === 'failed' && (
        <div className={`${styles.banner} ${styles.bannerDanger}`}>
          <AlertTriangle size={16} className={styles.bannerIcon} />
          <span>The payment did not go through. You have not been charged.</span>
        </div>
      )}
      {paymentCheck === 'timeout' && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <AlertTriangle size={16} className={styles.bannerIcon} />
          <span>Payment confirmation is taking longer than usual. Please refresh in a moment.</span>
        </div>
      )}
      {subscription?.status === 'grace' && subscription.expires_at && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <AlertTriangle size={16} className={styles.bannerIcon} />
          <span>
            Your plan has expired. Editing remains active until{' '}
            {formatDate(new Date(new Date(subscription.expires_at).getTime() + GRACE_DAYS * 86_400_000))},
            but exports are paused. Renew to keep full access.
          </span>
        </div>
      )}

      {/* Main Grid Layout - Section 4.3 (2/3 + 1/3 Two-Column Layout) */}
      <div className={styles.mainGrid}>
        {/* Left Column (2/3) */}
        <div className={styles.column}>
          {/* Active Subscription Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <CreditCard size={16} className={styles.cardIcon} /> Active Subscription
              </h2>
              {subscription && (
                <StatusIndicator
                  status={subscription.status === 'active' ? 'success' : subscription.status === 'grace' ? 'warning' : 'neutral'}
                  label={subscription.status.toUpperCase()}
                />
              )}
            </div>

            <div className={styles.planOverview}>
              <div>
                <div className={styles.planTierLabel}>
                  {loading ? <LoadingDots inline size="sm" /> : formatTierName(currentPlan?.tier ?? subscription?.tier ?? 'free')}
                </div>
                <p className={styles.planDescription}>
                  {currentPlan ? `${currentPlan.bake_priority} bake priority · High quality 3D generation` : 'Standard shoe design capabilities'}
                </p>
              </div>

              <div className={styles.planPriceWrapper}>
                <span className={styles.planPrice}>{formatVnd(currentPlan?.price_vnd ?? 0)}</span>
                <span className={styles.planCycle}>/ {currentPlan?.billing_cycle ?? 'month'}</span>
              </div>
            </div>

            <div className={styles.metaList}>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Period status</span>
                <span className={styles.metaVal}>
                  {subscription?.expires_at ? `Expires ${formatDate(subscription.expires_at)}` : 'Continuous access (Free)'}
                </span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Payment provider</span>
                <span className={styles.metaVal}>PayOS / MoMo (pay-per-cycle, no card stored)</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Included exports</span>
                <span className={styles.metaVal}>
                  {currentPlan?.max_exports_per_month === null ? 'Unlimited exports' : `${currentPlan?.max_exports_per_month ?? 5} / month`}
                </span>
              </div>
            </div>

            <div className={styles.actionRow}>
              <button className={styles.btnSecondary} onClick={() => setShowUpgradeModal(true)}>
                Compare & Change Plan
              </button>

              {subscription && subscription.tier !== 'free' && (
                <div className={styles.cancelWrap}>
                  <button className={`${styles.btnText} ${styles.btnTextDanger}`} onClick={() => setShowCancelConfirm(true)}>
                    Cancel plan
                  </button>
                  <span className={styles.microCopy}>Access remains active until billing period ends</span>
                </div>
              )}
            </div>
          </div>

          {/* Invoices History Table Card - Section 5.12 */}
          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <h2 className={styles.cardTitle}>
                <FileText size={16} className={styles.cardIcon} /> Invoices & Receipts
                <span className={styles.cardTitleCount}>({invoices.length})</span>
              </h2>
            </div>

            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={5} style={{ padding: '24px 0', textAlign: 'center' }}>
                        <LoadingDots center label="Loading invoices…" />
                      </td>
                    </tr>
                  )}
                  {!loading && invoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className={styles.tableEmpty}>
                        No invoices found.
                      </td>
                    </tr>
                  )}
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 500 }}>{inv.receiptNumber ?? inv.id.slice(0, 8)}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{inv.date}</td>
                      <td>
                        {inv.amount}
                        {inv.vatNote && <div className={styles.vatNote}>{inv.vatNote}</div>}
                      </td>
                      <td>
                        <StatusIndicator
                          status={
                            inv.status === 'Paid'
                              ? 'success'
                              : inv.status === 'Pending'
                                ? 'warning'
                                : inv.status === 'Failed' || inv.status === 'Cancelled'
                                  ? 'danger'
                                  : 'neutral'
                          }
                          label={inv.status}
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className={`${styles.btnSecondary} ${styles.btnSm}`}
                          disabled={!inv.receiptNumber || downloadingReceipt === inv.id}
                          title={inv.receiptNumber ? 'Download receipt PDF' : 'Receipt issued upon successful payment'}
                          onClick={() => downloadReceipt(inv.id)}
                        >
                          <FileText size={12} />
                          <span>{downloadingReceipt === inv.id ? 'Opening…' : 'Receipt'}</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Credit Ledger Table (if user has scan credit history) */}
          {creditLedger.length > 0 && (
            <div className={styles.tableCard}>
              <div className={styles.tableHeader}>
                <h2 className={styles.cardTitle}>
                  <Gem size={16} className={styles.cardIcon} /> Scan Credit Transactions
                  <span className={styles.cardTitleCount}>({creditLedger.length})</span>
                </h2>
              </div>

              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Purchased</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditLedger.map((item) => (
                      <tr key={item.id}>
                        <td>{formatDate(item.purchased_at)}</td>
                        <td style={{ color: 'var(--text-secondary)' }}>{formatDate(item.expires_at)}</td>
                        <td>
                          <StatusIndicator
                            status={item.status.toLowerCase() === 'available' ? 'success' : item.status.toLowerCase() === 'used' ? 'neutral' : 'danger'}
                            label={item.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (1/3) */}
        <div className={styles.column}>
          {/* Cloud Quotas Card - docs/DESIGN.md Section 5.13 */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <HardDrive size={16} className={styles.cardIcon} /> Cloud Quotas
              </h2>
            </div>

            {loading ? (
              <LoadingDots center label="Loading quotas…" />
            ) : (
              <div className={styles.meterList}>
                <UsageMeter
                  label="Active projects"
                  used={usage?.projects_count ?? 0}
                  limit={usage?.max_projects}
                />
                <UsageMeter
                  label="Monthly exports"
                  used={usage?.exports_count ?? 0}
                  limit={usage?.max_exports_per_month}
                />
                <UsageMeter
                  label="AI generation credits"
                  used={usage?.ai_credits_used ?? 0}
                  limit={usage?.ai_credits_limit}
                />
              </div>
            )}

            <div className={styles.cardFooterMeta}>
              <span>Current plan: <strong>{formatTierName(usage?.tier ?? 'free')}</strong></span>
              <span>Status: <strong>{subscription?.status ?? 'active'}</strong></span>
            </div>
          </div>

          {/* Scan Credits Card (BR-94 / UC-27) */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <Gem size={16} className={styles.cardIcon} /> Scan Credits
              </h2>
            </div>

            {creditBalance ? (
              <>
                <div className={styles.metaList} style={{ borderTop: 'none', paddingTop: 0 }}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>Available</span>
                    <span className={styles.metaVal}>{creditBalance.available}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>Used</span>
                    <span className={styles.metaVal}>{creditBalance.used}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>Expired</span>
                    <span className={styles.metaVal}>{creditBalance.expired}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>Purchased this cycle</span>
                    <span className={styles.metaVal}>
                      {creditBalance.purchased_this_cycle} of {creditBalance.max_per_cycle}
                    </span>
                  </div>
                  {creditBalance.next_expires_at && (
                    <div className={styles.metaItem}>
                      <span className={styles.metaKey}>Next expiry</span>
                      <span className={styles.metaVal}>{formatDate(creditBalance.next_expires_at)}</span>
                    </div>
                  )}
                </div>

                <p className={styles.planDescription}>
                  {formatVnd(creditBalance.price_vnd)} per extra scan. Credits remain valid for 12 months.
                </p>

                <button
                  className={styles.btnSecondary}
                  onClick={() => setShowBuyCreditModal(true)}
                  disabled={!creditBalance.can_purchase}
                  title={creditBalance.can_purchase ? undefined : 'Available on active Basic/Pro plans, up to per-cycle limit'}
                >
                  <Plus size={14} /> Buy Credit
                </button>
              </>
            ) : (
              <LoadingDots center label="Loading scan credits…" />
            )}
          </div>

          {/* Billing Profile Card */}
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>
                <Building size={16} className={styles.cardIcon} /> Billing Profile
              </h2>
            </div>

            <div className={styles.metaList} style={{ borderTop: 'none', borderBottom: 'none', padding: 0 }}>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Owner</span>
                <span className={styles.metaVal}>{profileDisplayName(profile)}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Email</span>
                <span className={styles.metaVal}>{profile?.email ?? '—'}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Account code</span>
                <span className={styles.metaVal}>{profile?.account_code ?? '—'}</span>
              </div>
              <div className={styles.metaItem}>
                <span className={styles.metaKey}>Account status</span>
                <span className={styles.metaVal}>{profile?.status ?? '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Buy Credit Modal */}
      <AnimatePresence>
        {showBuyCreditModal && creditBalance && (
          <div className={styles.modalBackdrop}>
            <motion.div
              className={styles.modalDialog}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Buy Scan Credits</h3>
                <button
                  className={styles.modalCloseBtn}
                  onClick={() => setShowBuyCreditModal(false)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                <p className={styles.planDescription}>
                  {formatVnd(creditBalance.price_vnd)} per scan, up to {creditBalance.max_per_cycle - creditBalance.purchased_this_cycle} more this cycle.
                  Credits expire in 12 months and are non-refundable once used.
                </p>

                <div className={styles.creditQtyRow}>
                  <label htmlFor="credit-qty">Quantity</label>
                  <input
                    id="credit-qty"
                    type="number"
                    min={1}
                    max={creditBalance.max_per_cycle - creditBalance.purchased_this_cycle}
                    value={buyQuantity}
                    onChange={(event) => setBuyQuantity(Math.max(1, Number(event.target.value) || 1))}
                    className={styles.creditQtyInput}
                  />
                  <span>× {formatVnd(creditBalance.price_vnd)}</span>
                </div>

                <div className={styles.creditTotalRow}>
                  Total: {formatVnd(buyQuantity * creditBalance.price_vnd)}
                </div>
              </div>

              <div className={styles.modalFooter}>
                <button
                  className={styles.btnPrimary}
                  disabled={buyingCredit}
                  onClick={() => handleBuyCredit('payos')}
                >
                  {buyingCredit ? 'Connecting…' : 'Pay via PayOS'}
                </button>
                <button
                  className={styles.btnSecondary}
                  disabled
                  title="Cổng thanh toán MoMo sắp ra mắt (Coming Soon)"
                >
                  MoMo (Coming Soon)
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upgrade / Compare Plans Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <div className={styles.modalBackdrop}>
            <motion.div
              className={`${styles.modalDialog} ${styles.modalDialogWide}`}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
            >
              <div className={styles.modalHeader}>
                <h3 className={styles.modalTitle}>Compare Cloud Plans</h3>
                <button
                  className={styles.modalCloseBtn}
                  onClick={() => setShowUpgradeModal(false)}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className={styles.modalBody}>
                {/* Promo Code Form */}
                <form onSubmit={applyCoupon} className={styles.couponForm}>
                  <Tag size={14} className={styles.cardIcon} />
                  <input
                    className={styles.couponInput}
                    placeholder="Enter promo code"
                    value={couponInput}
                    onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                    maxLength={40}
                    aria-label="Promo code"
                  />
                  <button
                    type="submit"
                    className={styles.btnSecondary}
                    disabled={applyingCoupon || !couponInput.trim()}
                  >
                    {applyingCoupon ? 'Checking…' : 'Apply code'}
                  </button>
                  {appliedCoupon && (
                    <button type="button" className={styles.couponClearBtn} onClick={clearCoupon}>
                      Remove {appliedCoupon}
                    </button>
                  )}
                </form>

                {/* Pricing Grid */}
                <div className={styles.pricingGrid}>
                  {pricingTiers.map((tier) => (
                    <div
                      key={tier.plan.id}
                      className={`${styles.planCardOption} ${tier.popular ? styles.planCardRecommended : ''} ${
                        tier.isCurrent ? styles.planCardCurrent : ''
                      }`}
                    >
                      {tier.popular && <span className={styles.recommendedBadge}>RECOMMENDED</span>}

                      <div className={styles.tierHeading}>
                        <h4 className={styles.tierTitle}>{tier.name}</h4>
                        <div className={styles.tierPriceContainer}>
                          {couponPreviews[tier.plan.id] ? (
                            <>
                              <span className={styles.tierPriceOld}>{tier.price}</span>
                              <span className={styles.tierPriceAmount}>
                                {formatVnd(couponPreviews[tier.plan.id].amount_vnd)}
                              </span>
                            </>
                          ) : (
                            <span className={styles.tierPriceAmount}>{tier.price}</span>
                          )}
                          <span className={styles.tierPriceCycle}>
                            {tier.price !== 'Custom' && `/ ${tier.period}`}
                          </span>
                        </div>
                        {couponPreviews[tier.plan.id]?.vat.enabled && (
                          <div className={styles.vatNote}>
                            Incl. {couponPreviews[tier.plan.id].vat.rate_percent}% VAT
                          </div>
                        )}
                      </div>

                      <ul className={styles.tierFeatureList}>
                        {tier.features.map((feat) => (
                          <li key={feat} className={styles.tierFeatureItem}>
                            <Check size={14} className={styles.tierCheckIcon} />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>

                      <div className={styles.tierButtonGroup}>
                        {tier.isCurrent || tier.plan.tier === 'free' ? (
                          <button className={styles.btnSecondary} disabled>
                            {tier.isCurrent ? 'Current Plan' : 'Free tier'}
                          </button>
                        ) : (
                          <>
                            <button
                              className={tier.popular ? styles.btnPrimary : styles.btnSecondary}
                              onClick={() => handleChoosePlan(tier.plan, 'payos')}
                            >
                              Pay via PayOS
                            </button>
                            <button
                              className={styles.btnSecondary}
                              disabled
                              title="Cổng thanh toán MoMo sắp ra mắt (Coming Soon)"
                            >
                              MoMo (Coming Soon)
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancel Confirmation Dialog */}
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Cancel subscription?"
        description="Your access remains active until the end of the current billing cycle."
        confirmLabel="Cancel Subscription"
        cancelLabel="Keep Plan"
        onConfirm={handleCancelSubscription}
      />
    </div>
  );
};

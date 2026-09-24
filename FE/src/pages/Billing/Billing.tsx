import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, HardDrive, Check, Calendar, ArrowUpRight, HelpCircle, X, Building, FileText, AlertTriangle, Tag, Loader2, Gem, Plus } from 'lucide-react';
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

function formatVnd(amount: number): string {
  return `${amount.toLocaleString('vi-VN')} VNĐ`;
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
    date: new Date(invoice.created_at).toLocaleDateString(),
    amount: formatVnd(invoice.amount_vnd),
    vatNote: invoice.vat.enabled ? `incl. ${invoice.vat.rate_percent}% VAT` : null,
    status: normalizeInvoiceStatus(invoice.status),
    receiptNumber: invoice.receipt_number ?? null,
  };
}

function quotaPercent(used: number | undefined, limit: number | null | undefined): number {
  if (!limit) return 0;
  return Math.min(100, ((used ?? 0) / limit) * 100);
}

function profileDisplayName(profile: UserProfile | null): string {
  if (!profile) return 'Loading...';
  return `${profile.first_name} ${profile.last_name}`.trim() || profile.username;
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
    const creditRequest = billingApi.getCreditBalance().catch(() => null); // 402/403 when not on Basic/Pro
    const creditLedgerRequest = billingApi.getCreditLedger().catch(() => null);
    Promise.all([api.listPlans(), subscriptionRequest, api.listInvoices(), api.usage(), api.profile(), creditRequest, creditLedgerRequest])
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

  const currentPlan = useMemo(() => plans.find((plan) =>
    subscription?.tier === plan.tier
    || subscription?.tier === `${plan.tier}_${plan.billing_cycle}`
  ), [plans, subscription]);

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
      toast('Coupon applied. Discounted prices are shown on the eligible plans.');
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

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Billing & Subscription</h1>
          <p className={styles.subtitle}>Check your current quotas, subscription tiers, and view past invoices.</p>
        </div>
      </div>

      {cancelledAtGateway && (
        <div className={styles.paymentBanner}>
          <AlertTriangle size={16} /> <span>The payment was cancelled. You have not been charged.</span>
        </div>
      )}
      {paymentCheck === 'checking' && (
        <div className={styles.paymentBanner}>
          <Loader2 size={16} className={styles.spin} /> <span>Confirming your payment with the provider…</span>
        </div>
      )}
      {paymentCheck === 'paid' && (
        <div className={`${styles.paymentBanner} ${styles.paymentOk}`}>
          <Check size={16} /> <span>Payment confirmed. Your plan is active and the receipt is ready below.</span>
        </div>
      )}
      {paymentCheck === 'failed' && (
        <div className={styles.paymentBanner}>
          <AlertTriangle size={16} /> <span>The payment did not go through. You have not been charged.</span>
        </div>
      )}
      {paymentCheck === 'timeout' && (
        <div className={styles.paymentBanner}>
          <AlertTriangle size={16} />
          <span>We have not received the confirmation yet. It can take a few minutes; refresh this page shortly.</span>
        </div>
      )}
      {subscription?.status === 'grace' && subscription.expires_at && (
        <div className={styles.paymentBanner}>
          <AlertTriangle size={16} />
          <span>
            Your plan has expired. Editing stays open until{' '}
            {new Date(new Date(subscription.expires_at).getTime() + GRACE_DAYS * 86_400_000).toLocaleDateString()},
            but exports are paused. Renew to keep your plan.
          </span>
        </div>
      )}

      {/* Main Grid */}
      <div className={styles.mainGrid}>
        {/* Top-Left Card: Active Plan */}
        <motion.div 
          className={`${styles.planCard} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className={styles.planHeader}>
            <div>
              <span className={styles.planBadge}>ACTIVE PLAN</span>
              <h2 className={styles.planName}>
                {loading ? 'Loading...' : formatTierName(currentPlan?.tier ?? subscription?.tier ?? 'free')}
              </h2>
            </div>
            <div className={styles.planPriceInfo}>
              <span className={styles.planPrice}>{formatVnd(currentPlan?.price_vnd ?? 0)}</span>
              <span className={styles.planPeriod}>/ {currentPlan?.billing_cycle ?? 'month'}</span>
            </div>
          </div>
          
          <p className={styles.planDesc}>
            Subscription data and quota limits are loaded directly from the KusShoes API.
          </p>

          <div className={styles.planMeta}>
            <div className={styles.metaItem}>
              <Calendar size={16} className={styles.metaIcon} />
              <span>Expires: <strong>{subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString() : 'No expiry'}</strong></span>
            </div>
            <div className={styles.metaItem}>
              <CreditCard size={16} className={styles.metaIcon} />
              <div className={styles.paymentMethodWrapper}>
                <span>Payment: <strong>PayOS / MoMo</strong> (no card stored — pay-per-cycle)</span>
              </div>
            </div>
          </div>

          <div className={styles.planActions}>
            <button className="btn-neon-orange" onClick={() => setShowUpgradeModal(true)}>
              Upgrade / Change Plan
            </button>
            <div className={styles.cancelActionWrapper}>
              <button className="btn-outline" onClick={() => setShowCancelConfirm(true)} disabled={!subscription}>
                Cancel Plan
              </button>
              <span className={styles.cancelMicroCopy}>
                Access remains active until the next billing date.
              </span>
            </div>
          </div>
        </motion.div>

        {/* Top-Right Card: Invoice History */}
        <motion.div 
          className={`${styles.rightCol} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className={styles.invoiceHeader}>
            <h3 className={styles.invoiceTitle}>Invoice History</h3>
            <button className={styles.invoiceHelpBtn} onClick={() => toast('Opening support ticket form...', 'info')}>
              <HelpCircle size={16} />
              <span>Need help?</span>
            </button>
          </div>

          <table className={styles.table}>
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Billing Date</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading && invoices.length === 0 && (
                <tr><td colSpan={5}>No invoices found.</td></tr>
              )}
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td className={styles.invId}>{inv.receiptNumber ?? inv.id.slice(0, 8)}</td>
                  <td>{inv.date}</td>
                  <td>{inv.amount}{inv.vatNote && <div className={styles.planPeriod}>{inv.vatNote}</div>}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[inv.status.toLowerCase()]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionCell}>
                      <button
                        className={styles.downloadBtn}
                        disabled={!inv.receiptNumber || downloadingReceipt === inv.id}
                        title={inv.receiptNumber ? 'Download receipt (PDF)' : 'A receipt is issued once the payment succeeds'}
                        onClick={() => downloadReceipt(inv.id)}
                      >
                        <FileText size={14} /> {downloadingReceipt === inv.id ? 'Opening…' : 'Receipt'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* Bottom-Left Card: Billing Details */}
        <motion.div 
          className={`${styles.billingCard} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <div className={styles.billingHeader}>
            <div className={styles.billingTitleContainer}>
              <Building size={18} className={styles.billingIcon} />
              <h3 className={styles.billingTitle}>Account Billing Profile</h3>
            </div>
          </div>
          
          <div className={styles.billingFields}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>ACCOUNT OWNER</label>
              <p className={styles.fieldValue}>{profileDisplayName(profile)}</p>
            </div>
            
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>EMAIL</label>
              <p className={styles.fieldValue}>{profile?.email ?? 'Loading...'}</p>
            </div>
            
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>ACCOUNT CODE</label>
              <p className={styles.fieldValue}>{profile?.account_code ?? 'Loading...'}</p>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>ACCOUNT STATUS</label>
              <p className={styles.fieldValue}>{profile?.status ?? 'Loading...'}</p>
            </div>
          </div>
        </motion.div>

        {/* Bottom-Right Card: Cloud Quota Usage */}
        <motion.div 
          className={`${styles.quotaCard} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className={styles.quotaHeader}>
            <h3 className={styles.quotaTitle}>Cloud Quota Usage</h3>
            <HardDrive size={18} className={styles.quotaIcon} />
          </div>
          
          <div className={styles.progressContainer}>
            <div className={styles.progressLabels}>
              <span>Active Projects</span>
              <span>{usage?.projects_count ?? 0} / {usage?.max_projects ?? '∞'} used</span>
            </div>
            <div className={styles.progressBarBg}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${quotaPercent(usage?.projects_count, usage?.max_projects)}%` }}
              />
            </div>
          </div>

          <div className={styles.progressContainer}>
            <div className={styles.progressLabels}>
              <span>Monthly Exports</span>
              <span>{usage?.exports_count ?? 0} / {usage?.max_exports_per_month ?? '∞'} used</span>
            </div>
            <div className={styles.progressBarBg}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${quotaPercent(usage?.exports_count, usage?.max_exports_per_month)}%` }}
              />
            </div>
          </div>

          <div className={styles.progressContainer}>
            <div className={styles.progressLabels}>
              <span>AI Credits</span>
              <span>{usage?.ai_credits_used ?? 0} / {usage?.ai_credits_limit ?? '∞'} used</span>
            </div>
            <div className={styles.progressBarBg}>
              <div
                className={styles.progressBarFill}
                style={{ width: `${quotaPercent(usage?.ai_credits_used, usage?.ai_credits_limit)}%` }}
              />
            </div>
          </div>

          <div className={styles.quotaInfoList}>
            <div className={styles.quotaInfoItem}>
              <span>Current tier</span>
              <span>{usage?.tier ?? 'free'}</span>
            </div>
            <div className={styles.quotaInfoItem}>
              <span>Subscription status</span>
              <span>{subscription?.status ?? 'none'}</span>
            </div>
          </div>
        </motion.div>

        {/* Scan Credits (BR-94 / UC-27) */}
        <motion.div
          className={`${styles.quotaCard} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className={styles.quotaHeader}>
            <h3 className={styles.quotaTitle}>Scan Credits</h3>
            <Gem size={18} className={styles.quotaIcon} />
          </div>

          {creditBalance ? (
            <>
              <div className={styles.quotaInfoList}>
                <div className={styles.quotaInfoItem}>
                  <span>Available</span>
                  <span>{creditBalance.available}</span>
                </div>
                <div className={styles.quotaInfoItem}>
                  <span>Used</span>
                  <span>{creditBalance.used}</span>
                </div>
                <div className={styles.quotaInfoItem}>
                  <span>Expired</span>
                  <span>{creditBalance.expired}</span>
                </div>
                <div className={styles.quotaInfoItem}>
                  <span>Bought this cycle</span>
                  <span>{creditBalance.purchased_this_cycle} / {creditBalance.max_per_cycle}</span>
                </div>
                {creditBalance.next_expires_at && (
                  <div className={styles.quotaInfoItem}>
                    <span>Next expiry</span>
                    <span>{new Date(creditBalance.next_expires_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              <p className={styles.planDesc}>
                {formatVnd(creditBalance.price_vnd)} per extra scan, on top of your plan&apos;s quota.
              </p>
              <button
                className="btn-outline"
                onClick={() => setShowBuyCreditModal(true)}
                disabled={!creditBalance.can_purchase}
                title={creditBalance.can_purchase ? undefined : 'Available on an active Basic/Pro plan, up to the per-cycle cap'}
              >
                <Plus size={16} /> Buy Credit
              </button>

              {creditLedger.length > 0 && (
                <table className={styles.table} style={{ marginTop: 12 }}>
                  <thead>
                    <tr><th>Purchased</th><th>Expires</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {creditLedger.slice(0, 5).map((item) => (
                      <tr key={item.id}>
                        <td>{new Date(item.purchased_at).toLocaleDateString()}</td>
                        <td>{new Date(item.expires_at).toLocaleDateString()}</td>
                        <td>
                          <span className={`${styles.statusBadge} ${styles[item.status.toLowerCase()] ?? ''}`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className={styles.planDesc}>Loading…</p>
          )}
        </motion.div>
      </div>

      {/* Buy Credit Modal */}
      <AnimatePresence>
        {showBuyCreditModal && creditBalance && (
          <div className={styles.modalBackdrop}>
            <motion.div
              className={`${styles.upgradeModal} glass-panel`}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
            >
              <div className={styles.modalCloseHeader}>
                <h2 className={styles.compareTitle}>Buy Scan Credit</h2>
                <button className={styles.closeBtn} onClick={() => setShowBuyCreditModal(false)}>
                  <X size={20} />
                </button>
              </div>
              <p className={styles.planDesc}>
                {formatVnd(creditBalance.price_vnd)} each, up to {creditBalance.max_per_cycle - creditBalance.purchased_this_cycle}{' '}
                more this cycle. Credits expire 12 months after purchase and are non-refundable once used.
              </p>
              <div className={styles.couponForm}>
                <label htmlFor="credit-qty">Quantity</label>
                <input
                  id="credit-qty"
                  type="number"
                  min={1}
                  max={creditBalance.max_per_cycle - creditBalance.purchased_this_cycle}
                  value={buyQuantity}
                  onChange={(event) => setBuyQuantity(Math.max(1, Number(event.target.value) || 1))}
                  className={styles.couponInput}
                  style={{ maxWidth: 100 }}
                />
                <span>= {formatVnd(buyQuantity * creditBalance.price_vnd)}</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-neon-orange" disabled={buyingCredit} onClick={() => handleBuyCredit('payos')}>
                  Pay via PayOS
                </button>
                <button className="btn-outline" disabled={buyingCredit} onClick={() => handleBuyCredit('momo')}>
                  Pay via MoMo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Upgrade / Compare Pricing Modal */}
      <AnimatePresence>
        {showUpgradeModal && (
          <div className={styles.modalBackdrop}>
            <motion.div 
              className={`${styles.upgradeModal} glass-panel`}
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.95 }}
            >
              {/* Close Header */}
              <div className={styles.modalCloseHeader}>
                <h2 className={styles.compareTitle}>Compare Cloud Plans</h2>
                <button className={styles.closeBtn} onClick={() => setShowUpgradeModal(false)}>
                  <X size={20} />
                </button>
              </div>

              {/* Promo code (BR-26) */}
              <form onSubmit={applyCoupon} className={styles.couponForm}>
                <Tag size={16} className={styles.metaIcon} />
                <input
                  className={styles.couponInput}
                  placeholder="Promo code"
                  value={couponInput}
                  onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                  maxLength={40}
                  aria-label="Promo code"
                />
                <button type="submit" className="btn-outline" disabled={applyingCoupon || !couponInput.trim()}>
                  {applyingCoupon ? 'Checking…' : 'Apply'}
                </button>
                {appliedCoupon && (
                  <button type="button" className={styles.couponClear} onClick={clearCoupon}>
                    Remove {appliedCoupon}
                  </button>
                )}
              </form>

              {/* Pricing Cards Grid */}
              <div className={styles.pricingGrid}>
                {pricingTiers.map((tier) => (
                  <div 
                    key={tier.plan.id}
                    className={`${styles.priceCard} ${tier.popular ? styles.popularCard : ''} glass-panel`}
                  >
                    {tier.popular && <span className={styles.popularBadge}>RECOMMENDED</span>}
                    <h3 className={styles.tierName}>{tier.name}</h3>
                    <div className={styles.priceContainer}>
                      {couponPreviews[tier.plan.id] ? (
                        <>
                          <span className={styles.tierPriceOld}>{tier.price}</span>
                          <span className={styles.tierPrice}>{formatVnd(couponPreviews[tier.plan.id].amount_vnd)}</span>
                        </>
                      ) : (
                        <span className={styles.tierPrice}>{tier.price}</span>
                      )}
                      <span className={styles.tierPeriod}>{tier.price !== 'Custom' && `/ ${tier.period}`}</span>
                    </div>
                    {couponPreviews[tier.plan.id]?.vat.enabled && (
                      <p className={styles.tierDesc}>
                        Includes {couponPreviews[tier.plan.id].vat.rate_percent}% VAT ({formatVnd(couponPreviews[tier.plan.id].vat.vat_vnd)})
                      </p>
                    )}
                    <p className={styles.tierDesc}>{tier.description}</p>
                    
                    <div className={styles.divider} />

                    <ul className={styles.featureList}>
                      {tier.features.map((feat) => (
                        <li key={feat} className={styles.featureItem}>
                          <Check size={14} className={styles.checkIcon} />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>

                    {tier.isCurrent || tier.plan.tier === 'free' ? (
                      <button
                        className={`${tier.popular ? 'btn-neon-orange' : 'btn-outline'} ${styles.pricingCta}`}
                        disabled
                      >
                        <span>{tier.cta}</span>
                        <ArrowUpRight size={16} />
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className={`${tier.popular ? 'btn-neon-orange' : 'btn-outline'} ${styles.pricingCta}`}
                          onClick={() => handleChoosePlan(tier.plan, 'payos')}
                        >
                          <span>Pay via PayOS</span>
                        </button>
                        <button
                          className={`btn-outline ${styles.pricingCta}`}
                          onClick={() => handleChoosePlan(tier.plan, 'momo')}
                        >
                          <span>Pay via MoMo</span>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="Cancel your subscription?"
        description="Your access remains active until the billing provider confirms the end of the current period."
        confirmLabel="Cancel Subscription"
        cancelLabel="Keep Plan"
        onConfirm={handleCancelSubscription}
      />
    </div>
  );
};

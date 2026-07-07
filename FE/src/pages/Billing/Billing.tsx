import React, { useEffect, useMemo, useState } from 'react';
import { CreditCard, HardDrive, Check, Calendar, ArrowUpRight, HelpCircle, X, Building, Pencil, Eye } from 'lucide-react';
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
} from '../../api/client';
import styles from './Billing.module.css';

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'Paid' | 'Pending' | 'Failed';
}

export const Billing: React.FC = () => {
  const { toast } = useToast();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscriptionRequest = api.subscription().catch((caught) => {
      if (caught instanceof ApiError && caught.status === 404) return null;
      throw caught;
    });
    Promise.all([api.listPlans(), subscriptionRequest, api.listInvoices(), api.usage()])
      .then(([nextPlans, nextSubscription, nextInvoices, nextUsage]) => {
        setPlans(nextPlans);
        setSubscription(nextSubscription);
        setUsage(nextUsage);
        setInvoices(nextInvoices.map((invoice: ApiInvoice) => ({
          id: invoice.id,
          date: new Date(invoice.created_at).toLocaleDateString(),
          amount: `${invoice.amount_vnd.toLocaleString('vi-VN')} VNĐ`,
          status: `${invoice.status.charAt(0).toUpperCase()}${invoice.status.slice(1)}` as Invoice['status'],
        })));
      })
      .catch((caught) => toast(caught instanceof Error ? caught.message : 'Unable to load billing data.', 'error'))
      .finally(() => setLoading(false));
  }, [toast]);

  // Billing Details State
  const [companyName, setCompanyName] = useState('KusShoes Joint Stock Company');
  const [billingAddress, setBillingAddress] = useState('FPT University, Hoa Lac High-Tech Park, Hanoi, Vietnam');
  const [taxId, setTaxId] = useState('0109876543');
  const [isEditingBilling, setIsEditingBilling] = useState(false);

  const currentPlan = useMemo(() => plans.find((plan) =>
    subscription?.tier === plan.tier
    || subscription?.tier === `${plan.tier}_${plan.billing_cycle}`
  ), [plans, subscription]);

  const pricingTiers = plans.map((plan) => {
    const isCurrent = currentPlan?.id === plan.id;
    return {
      plan,
      name: plan.tier.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      price: `${plan.price_vnd.toLocaleString('vi-VN')} VNĐ`,
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

  const handleChoosePlan = async (plan: Plan) => {
    try {
      if (subscription) {
        await api.changePlan(plan.tier, plan.billing_cycle ?? 'monthly');
        toast('Plan change requested. Billing status will update after provider confirmation.');
      } else {
        const checkoutUrl = await api.createCheckout(plan.tier, plan.billing_cycle ?? 'monthly');
        window.location.assign(checkoutUrl);
      }
      setShowUpgradeModal(false);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to change plan.', 'error');
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

  const handleOpenBillingPortal = async () => {
    try {
      window.location.assign(await api.billingPortal());
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : 'Unable to open billing portal.', 'error');
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
                {loading ? 'Loading...' : (currentPlan?.tier ?? subscription?.tier ?? 'Free')}
              </h2>
            </div>
            <div className={styles.planPriceInfo}>
              <span className={styles.planPrice}>{(currentPlan?.price_vnd ?? 0).toLocaleString('vi-VN')} VNĐ</span>
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
                <span>Payment management: <strong>Polar customer portal</strong></span>
                <button
                  className={styles.editPaymentBtn}
                  onClick={handleOpenBillingPortal}
                  title="Edit Payment Method"
                >
                  <Pencil size={12} />
                </button>
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
                  <td className={styles.invId}>{inv.id}</td>
                  <td>{inv.date}</td>
                  <td>{inv.amount}</td>
                  <td>
                    <span className={`${styles.statusBadge} ${styles[inv.status.toLowerCase()]}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    <div className={styles.actionCell}>
                      <button
                        className={styles.viewIconBtn}
                        onClick={() => toast('Invoice preview is not exposed by the backend yet.', 'info')}
                        title="View Invoice"
                      >
                        <Eye size={16} />
                      </button>
                      <button className={styles.downloadBtn} onClick={() => toast('Invoice PDF download is not exposed by the backend yet.', 'info')}>
                        Download
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
              <h3 className={styles.billingTitle}>Billing Details</h3>
            </div>
            <button 
              className={styles.editDetailsBtn} 
              onClick={() => setIsEditingBilling(!isEditingBilling)}
            >
              {isEditingBilling ? 'Save Changes' : 'Edit Details'}
            </button>
          </div>
          
          <div className={styles.billingFields}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>COMPANY NAME</label>
              {isEditingBilling ? (
                <input 
                  type="text" 
                  className={styles.fieldInput} 
                  value={companyName} 
                  onChange={(e) => setCompanyName(e.target.value)} 
                />
              ) : (
                <p className={styles.fieldValue}>{companyName}</p>
              )}
            </div>
            
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>BILLING ADDRESS</label>
              {isEditingBilling ? (
                <input 
                  type="text" 
                  className={styles.fieldInput} 
                  value={billingAddress} 
                  onChange={(e) => setBillingAddress(e.target.value)} 
                />
              ) : (
                <p className={styles.fieldValue}>{billingAddress}</p>
              )}
            </div>
            
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>TAX ID</label>
              {isEditingBilling ? (
                <input 
                  type="text" 
                  className={styles.fieldInput} 
                  value={taxId} 
                  onChange={(e) => setTaxId(e.target.value)} 
                />
              ) : (
                <p className={styles.fieldValue}>{taxId}</p>
              )}
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
              <div className={styles.progressBarFill} style={{ width: `${usage?.max_projects ? Math.min(100, usage.projects_count / usage.max_projects * 100) : 0}%` }} />
            </div>
          </div>

          <div className={styles.progressContainer}>
            <div className={styles.progressLabels}>
              <span>Monthly Exports</span>
              <span>{usage?.exports_count ?? 0} / {usage?.max_exports_per_month ?? '∞'} used</span>
            </div>
            <div className={styles.progressBarBg}>
              <div className={styles.progressBarFill} style={{ width: `${usage?.max_exports_per_month ? Math.min(100, usage.exports_count / usage.max_exports_per_month * 100) : 0}%` }} />
            </div>
          </div>

          <div className={styles.progressContainer}>
            <div className={styles.progressLabels}>
              <span>AI Credits</span>
              <span>{usage?.ai_credits_used ?? 0} / {usage?.ai_credits_limit ?? '∞'} used</span>
            </div>
            <div className={styles.progressBarBg}>
              <div className={styles.progressBarFill} style={{ width: `${usage?.ai_credits_limit ? Math.min(100, usage.ai_credits_used / usage.ai_credits_limit * 100) : 0}%` }} />
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
      </div>

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
                      <span className={styles.tierPrice}>{tier.price}</span>
                      <span className={styles.tierPeriod}>{tier.price !== 'Custom' && `/ ${tier.period}`}</span>
                    </div>
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

                    <button 
                      className={`${tier.popular ? 'btn-neon-orange' : 'btn-outline'} ${styles.pricingCta}`}
                      onClick={() => handleChoosePlan(tier.plan)}
                      disabled={tier.isCurrent}
                    >
                      <span>{tier.cta}</span>
                      <ArrowUpRight size={16} />
                    </button>
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

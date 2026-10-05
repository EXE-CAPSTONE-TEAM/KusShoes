import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User,
  Package,
  CreditCard,
  Check,
  ArrowLeft,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import {
  api,
  ApiError,
  type CheckoutQuote,
  type CreditQuote,
  type UserProfile,
} from '../../api/client';
import { billingApi } from '../../api/billing';
import { formatVnd, formatDate } from '../../utils/format';
import { pushAnalyticsEvent } from '../../analytics';
import { useToast } from '../../context/ToastContext';
import styles from './CheckoutReview.module.css';

interface CheckoutReviewProps {
  navigate?: (path: string) => void;
}

export const CheckoutReview: React.FC<CheckoutReviewProps> = ({ navigate }) => {
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

  const searchParams = new URLSearchParams(window.location.search);
  const checkoutType = searchParams.get('type') === 'credit' ? 'credit' : 'plan';
  const tier = searchParams.get('tier') || 'basic';
  const cycle = searchParams.get('cycle') || 'monthly';
  const coupon = searchParams.get('coupon') || null;
  const initialGateway = searchParams.get('gateway') === 'momo' ? 'momo' : 'payos';
  const creditQty = Math.max(1, parseInt(searchParams.get('qty') || '1', 10));

  const [gateway, setGateway] = useState<'payos' | 'momo'>(initialGateway);
  const [momoEnabled, setMomoEnabled] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [planQuote, setPlanQuote] = useState<CheckoutQuote | null>(null);
  const [creditQuote, setCreditQuote] = useState<CreditQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAlreadyActive, setIsAlreadyActive] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchQuote = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsAlreadyActive(false);

    try {
      const [gatewaysRes, profileRes] = await Promise.all([
        billingApi.getPaymentGateways().catch(() => ({ payos: true, momo: false })),
        api.profile().catch(() => null),
      ]);
      setMomoEnabled(gatewaysRes.momo);
      setProfile(profileRes);

      if (checkoutType === 'plan') {
        const quote = await api.quoteCheckout(tier, cycle, coupon);
        setPlanQuote(quote);
      } else {
        const quote = await billingApi.quoteCredits(creditQty);
        setCreditQuote(quote);
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setIsAlreadyActive(true);
        toast(t('checkout.alreadyActive'), 'error');
      } else {
        setError(caught instanceof Error ? caught.message : t('checkout.quoteError'));
      }
    } finally {
      setLoading(false);
    }
  }, [checkoutType, tier, cycle, coupon, creditQty, t, toast]);

  useEffect(() => {
    void fetchQuote();
  }, [fetchQuote]);

  const handleConfirmPay = async () => {
    if (!termsAgreed || submitting) return;
    setSubmitting(true);

    try {
      if (checkoutType === 'plan' && planQuote) {
        pushAnalyticsEvent('begin_checkout', {
          plan_code: `${planQuote.plan.tier}_${planQuote.plan.billing_cycle}`,
          value: planQuote.amount_vnd,
          currency: 'VND',
        });
        sessionStorage.setItem(
          'kusshoes_last_checkout',
          JSON.stringify({
            plan_code: `${planQuote.plan.tier}_${planQuote.plan.billing_cycle}`,
            value: planQuote.amount_vnd,
            currency: 'VND',
          }),
        );
        const checkoutUrl = await api.createCheckout(
          planQuote.plan.tier,
          planQuote.plan.billing_cycle,
          gateway,
          planQuote.coupon_code,
        );
        window.location.assign(checkoutUrl);
      } else if (checkoutType === 'credit' && creditQuote) {
        pushAnalyticsEvent('begin_checkout', {
          plan_code: `credits_${creditQuote.quantity}`,
          value: creditQuote.total_vnd,
          currency: 'VND',
        });
        sessionStorage.setItem(
          'kusshoes_last_checkout',
          JSON.stringify({
            plan_code: `credits_${creditQuote.quantity}`,
            value: creditQuote.total_vnd,
            currency: 'VND',
          }),
        );
        const checkoutUrl = await billingApi.createCreditCheckout(creditQuote.quantity, gateway);
        window.location.assign(checkoutUrl);
      }
    } catch (caught) {
      setSubmitting(false);
      toast(caught instanceof Error ? caught.message : t('toast.checkoutError'), 'error');
    }
  };

  const buyerFullName =
    planQuote?.buyer.full_name ||
    (profile ? `${profile.first_name} ${profile.last_name}`.trim() || profile.username : '—');
  const buyerEmail = planQuote?.buyer.email || profile?.email || '—';

  return (
    <div className={styles.container}>
      <div className={styles.pageHeader}>
        <h1 className={styles.title}>{t('checkout.title')}</h1>
        <p className={styles.subtitle}>{t('checkout.subtitle')}</p>
      </div>

      {isAlreadyActive && (
        <div className={`${styles.banner} ${styles.bannerWarning}`}>
          <AlertTriangle size={18} className={styles.cardIcon} />
          <div style={{ flexGrow: 1 }}>
            <strong>{t('checkout.alreadyActive')}</strong>
          </div>
          <button className={styles.btnSecondary} onClick={() => handleNavigate('/billing')}>
            {t('checkout.back')}
          </button>
        </div>
      )}

      {error && !isAlreadyActive && (
        <div className={`${styles.banner} ${styles.bannerDanger}`}>
          <ShieldAlert size={18} className={styles.cardIcon} />
          <div style={{ flexGrow: 1 }}>
            <strong>{error}</strong>
          </div>
          <button className={styles.btnSecondary} onClick={() => void fetchQuote()}>
            {t('checkout.retry')}
          </button>
        </div>
      )}

      {loading ? (
        <div className={styles.card} style={{ alignItems: 'center', padding: '48px 24px' }}>
          <Loader2 size={24} className={styles.spin} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            {t('checkout.quoteLoading')}
          </span>
        </div>
      ) : (
        (!error || planQuote || creditQuote) && (
          <>
            {/* Buyer Details */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <User size={16} className={styles.cardIcon} /> {t('checkout.buyerTitle')}
                </h2>
                <button
                  type="button"
                  className={styles.linkBtn}
                  onClick={() => handleNavigate('/settings?tab=profile')}
                >
                  {t('checkout.editSettings')} <ExternalLink size={12} />
                </button>
              </div>
              <div className={styles.metaList}>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>{t('checkout.buyerName')}</span>
                  <span className={styles.metaVal}>{buyerFullName}</span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaKey}>{t('checkout.buyerEmail')}</span>
                  <span className={styles.metaVal}>{buyerEmail}</span>
                </div>
              </div>
            </div>

            {/* Order Details */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <Package size={16} className={styles.cardIcon} /> {t('checkout.orderTitle')}
                </h2>
              </div>

              {checkoutType === 'plan' && planQuote && (
                <div className={styles.metaList}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('checkout.orderTitle')}</span>
                    <span className={styles.metaVal}>
                      {t('checkout.planService', {
                        name: planQuote.plan.tier.toUpperCase(),
                        cycle: t(`cycle.${planQuote.plan.billing_cycle}`, {
                          defaultValue: planQuote.plan.billing_cycle,
                        }),
                      })}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('checkout.validity')}</span>
                    <span className={styles.metaVal}>
                      {planQuote.new_expires_at
                        ? t('checkout.fromTo', {
                            from: formatDate(planQuote.new_period_start),
                            to: formatDate(planQuote.new_expires_at),
                          })
                        : t('checkout.continuous')}
                    </span>
                  </div>

                  {planQuote.is_upgrade && (
                    <div className={styles.upgradeCallout}>
                      {t('checkout.upgradeNotice', {
                        current: planQuote.current_tier?.toUpperCase() || 'FREE',
                      })}
                    </div>
                  )}

                  <ul className={styles.featureList}>
                    <li className={styles.featureItem}>
                      <Check size={14} className={styles.featureCheck} />
                      <span>
                        {planQuote.plan.max_projects === null
                          ? t('plan.unlimitedProjects')
                          : t('plan.activeProjects', { count: planQuote.plan.max_projects })}
                      </span>
                    </li>
                    <li className={styles.featureItem}>
                      <Check size={14} className={styles.featureCheck} />
                      <span>
                        {planQuote.plan.max_exports_per_month === null
                          ? t('plan.unlimitedExports')
                          : t('plan.exportsPerMonth', { count: planQuote.plan.max_exports_per_month })}
                      </span>
                    </li>
                  </ul>
                </div>
              )}

              {checkoutType === 'credit' && creditQuote && (
                <div className={styles.metaList}>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('checkout.orderTitle')}</span>
                    <span className={styles.metaVal}>
                      {t('checkout.creditsTitle', { count: creditQuote.quantity })}
                    </span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaKey}>{t('checkout.validity')}</span>
                    <span className={styles.metaVal}>
                      {t('checkout.creditsFeatures', { count: creditQuote.quantity })}
                    </span>
                  </div>
                  {!creditQuote.can_purchase && (
                    <div className={`${styles.banner} ${styles.bannerWarning}`}>
                      {t('checkout.creditLimitReached')}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Price Table */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <CreditCard size={16} className={styles.cardIcon} /> {t('checkout.priceTitle')}
                </h2>
              </div>

              {checkoutType === 'plan' && planQuote && (
                <div className={styles.priceTable}>
                  <div className={styles.priceRow}>
                    <span>{t('checkout.listedPrice')}</span>
                    <span className={styles.priceVal}>{formatVnd(planQuote.listed_price_vnd)}</span>
                  </div>

                  {planQuote.discount_vnd > 0 && (
                    <div className={styles.priceRow}>
                      <span>
                        {planQuote.discount_reason === 'coupon'
                          ? t('checkout.couponDiscount', { code: planQuote.coupon_code })
                          : planQuote.discount_reason === 'upgrade_proration'
                            ? t('checkout.upgradeDiscount')
                            : t('checkout.discount')}
                      </span>
                      <span className={styles.discountVal}>
                        -{formatVnd(planQuote.discount_vnd)}
                      </span>
                    </div>
                  )}

                  <div className={styles.totalRow}>
                    <span>{t('checkout.totalPayable')}</span>
                    <div>
                      <div className={styles.totalVal}>{formatVnd(planQuote.amount_vnd)}</div>
                      {planQuote.vat?.enabled && (
                        <div className={styles.vatSubtext}>
                          {t('checkout.vatIncluded', {
                            rate: planQuote.vat.rate_percent,
                            amount: formatVnd(planQuote.vat.vat_vnd),
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {checkoutType === 'credit' && creditQuote && (
                <div className={styles.priceTable}>
                  <div className={styles.priceRow}>
                    <span>{t('checkout.listedPrice')}</span>
                    <span className={styles.priceVal}>
                      {creditQuote.quantity} × {formatVnd(creditQuote.unit_price_vnd)}
                    </span>
                  </div>

                  <div className={styles.totalRow}>
                    <span>{t('checkout.totalPayable')}</span>
                    <div>
                      <div className={styles.totalVal}>{formatVnd(creditQuote.total_vnd)}</div>
                      {creditQuote.vat?.enabled && (
                        <div className={styles.vatSubtext}>
                          {t('checkout.vatIncluded', {
                            rate: creditQuote.vat.rate_percent,
                            amount: formatVnd(creditQuote.vat.vat_vnd),
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Gateway Selection */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>
                  <CreditCard size={16} className={styles.cardIcon} /> {t('checkout.paymentMethod')}
                </h2>
              </div>

              <div className={styles.gatewayOptions}>
                <label
                  className={`${styles.gatewayOption} ${gateway === 'payos' ? styles.gatewaySelected : ''}`}
                >
                  <input
                    type="radio"
                    name="gateway"
                    value="payos"
                    checked={gateway === 'payos'}
                    onChange={() => setGateway('payos')}
                    className={styles.gatewayRadio}
                  />
                  <span className={styles.gatewayLabel}>{t('checkout.payosLabel')}</span>
                </label>

                <label
                  className={`${styles.gatewayOption} ${gateway === 'momo' ? styles.gatewaySelected : ''} ${!momoEnabled ? styles.gatewayDisabled : ''}`}
                >
                  <input
                    type="radio"
                    name="gateway"
                    value="momo"
                    checked={gateway === 'momo'}
                    disabled={!momoEnabled}
                    onChange={() => setGateway('momo')}
                    className={styles.gatewayRadio}
                  />
                  <span className={styles.gatewayLabel}>
                    {t('checkout.momoLabel')} {!momoEnabled && `(${t('momo.soon')})`}
                  </span>
                </label>
              </div>
            </div>

            {/* Terms and Auto-renew Disclaimer */}
            <div className={styles.termsSection}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={termsAgreed}
                  onChange={(e) => setTermsAgreed(e.target.checked)}
                  className={styles.checkbox}
                />
                <span>
                  {t('checkout.termsAgree')}{' '}
                  <a
                    href="/terms"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.termsLink}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    {t('checkout.termsLink')}
                  </a>
                </span>
              </label>

              <p className={styles.disclaimer}>{t('checkout.noAutoRenew')}</p>
            </div>

            {/* Action Buttons */}
            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() => handleNavigate('/billing')}
                disabled={submitting}
              >
                <ArrowLeft size={16} />
                {t('checkout.back')}
              </button>

              <button
                type="button"
                className={styles.btnPrimary}
                disabled={
                  !termsAgreed ||
                  submitting ||
                  isAlreadyActive ||
                  (checkoutType === 'credit' && creditQuote?.can_purchase === false)
                }
                onClick={() => void handleConfirmPay()}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className={styles.spin} />
                    {t('checkout.processing')}
                  </>
                ) : (
                  t('checkout.confirmPay')
                )}
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
};

export default CheckoutReview;

import React, { useEffect, useMemo, useState } from 'react';
import { Check, X, HelpCircle } from 'lucide-react';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { AnimatedPrice } from '../../components/AnimatedPrice/AnimatedPrice';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import { api, type Plan } from '../../api/client';
import styles from './PricingPage.module.css';

interface PricingPageProps {
  navigate: (path: string) => void;
}

export const PricingPage: React.FC<PricingPageProps> = ({ navigate }) => {
  const [isAnnual, setIsAnnual] = useState(false);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState('');

  useEffect(() => {
    api.listPlans()
      .then(setPlans)
      .catch((caught) => setPlansError(caught instanceof Error ? caught.message : 'Unable to load plans.'));
  }, []);

  const visiblePlans = useMemo(() => {
    const cycle = isAnnual ? 'yearly' : 'monthly';
    return plans
      .filter((plan) => plan.billing_cycle === null || plan.billing_cycle === cycle)
      .sort((a, b) => a.price_vnd - b.price_vnd);
  }, [plans, isAnnual]);

  const comparisons = useMemo(() => [
    {
      name: 'Active Project Limit',
      values: visiblePlans.map((plan) => plan.max_projects === null ? 'Unlimited' : `${plan.max_projects} projects`),
    },
    {
      name: 'Monthly Export Limit',
      values: visiblePlans.map((plan) => plan.max_exports_per_month === null ? 'Unlimited' : `${plan.max_exports_per_month} exports`),
    },
    {
      name: 'File Export Formats',
      values: visiblePlans.map((plan) => plan.allowed_export_formats.map((item) => item.toUpperCase()).join(', ')),
    },
    {
      name: 'Bake Priority',
      values: visiblePlans.map((plan) => plan.bake_priority),
    },
    {
      name: 'Desktop Client Sync',
      values: visiblePlans.map(() => true),
    },
  ], [visiblePlans]);

  const faqs = [
    { q: 'How does the mobile scanning work?', a: 'You download our KusShoes app on iOS or Android, take 360° pictures of your sneaker, and the app uses the Kiri Engine API to stitch them into a high-poly 3D mesh automatically.' },
    { q: 'What is KusStudio?', a: 'KusStudio is our desktop customizer software. It syncs with your Cloud storage so you can easily paint, modify texture properties, and edit shoe layouts on a powerful PC environment.' },
    { q: 'Can I downgrade or cancel anytime?', a: 'Yes. You can manage your subscription directly inside your User Portal account. Cancelations take effect at the end of the current billing cycle.' },
  ];

  const formatPrice = (val: number) => {
    if (val === 0) return '0 VNĐ';
    return val.toLocaleString('vi-VN') + ' VNĐ';
  };

  const planName = (plan: Plan) => {
    const tier = plan.tier.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    if (!plan.billing_cycle) return `${tier} Starter`;
    return `${tier} ${plan.billing_cycle === 'yearly' ? 'Annual' : 'Monthly'}`;
  };

  const planDescription = (plan: Plan) => (
    plan.tier === 'free'
      ? 'Start with the default cloud workspace limits.'
      : `${plan.bake_priority} queue priority with database-backed billing limits.`
  );

  const planFeatures = (plan: Plan) => [
    plan.max_projects === null ? 'Unlimited active projects' : `${plan.max_projects} active projects`,
    plan.max_exports_per_month === null ? 'Unlimited monthly exports' : `${plan.max_exports_per_month} exports per month`,
    `Formats: ${plan.allowed_export_formats.map((item) => item.toUpperCase()).join(', ')}`,
    `${plan.bake_priority} bake priority`,
  ];

  return (
    <div className={styles.container}>
      {/* Interactive mouse particle grid */}
      <InteractiveParticleGrid />

      {/* Background ambient glowing lights */}
      <div className={styles.bgGlow1} />
      <div className={styles.bgGlow2} />
      <div className={styles.bgGlow3} />

      {/* Topographic Contour Waves */}
      <div className={styles.topoLeft}>
        <svg viewBox="0 0 400 800" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M-100,100 C100,150 200,50 300,200 C400,350 250,500 450,600" stroke="var(--grid-line-color)" strokeWidth="1.5" strokeDasharray="4 4" />
          <path d="M-100,150 C120,200 220,100 320,250 C420,400 270,550 470,650" stroke="var(--grid-line-color)" strokeWidth="1.5" />
          <path d="M-100,200 C140,250 240,150 340,300 C440,450 290,600 490,700" stroke="var(--grid-line-color)" strokeWidth="1.5" />
          <path d="M-100,250 C160,300 260,200 360,350 C460,500 310,650 510,750" stroke="var(--grid-line-color)" strokeWidth="1.5" strokeDasharray="4 4" />
          <path d="M-100,300 C180,350 280,250 380,400 C480,550 330,700 530,800" stroke="var(--grid-line-color)" strokeWidth="1.5" />
        </svg>
      </div>
      <div className={styles.topoRight}>
        <svg viewBox="0 0 400 800" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M500,100 C300,150 200,50 100,200 C0,350 150,500 -50,600" stroke="var(--grid-line-color)" strokeWidth="1.5" />
          <path d="M500,150 C280,200 180,100 80,250 C-20,400 130,550 -70,650" stroke="var(--grid-line-color)" strokeWidth="1.5" strokeDasharray="4 4" />
          <path d="M500,200 C260,250 160,150 60,300 C-40,450 110,600 -90,700" stroke="var(--grid-line-color)" strokeWidth="1.5" />
          <path d="M500,250 C240,300 140,200 40,350 C-60,500 90,650 -110,750" stroke="var(--grid-line-color)" strokeWidth="1.5" />
          <path d="M500,300 C220,350 120,250 20,400 C-80,550 70,700 -130,800" stroke="var(--grid-line-color)" strokeWidth="1.5" strokeDasharray="4 4" />
        </svg>
      </div>

      {/* Reusable Navbar */}
      <Navbar navigate={navigate} currentPage="pricing" />

      {/* Main Header */}
      <section className={styles.pricingHeader}>
        <span className={styles.badge}>TRANSPARENT PRICING</span>
        <h1 className={styles.title}>Flexible Plans for Every Creator</h1>
        <p className={styles.desc}>
          Start scanning for free, and upgrade as your shoe library grows. Sync seamlessly between KusShoes and KusStudio.
        </p>

        {/* Toggle billing */}
        <div className={styles.toggleContainer}>
          <span className={!isAnnual ? styles.activePeriod : ''}>Bill Monthly</span>
          <button 
            className={`${styles.toggleSwitch} ${isAnnual ? styles.switchActive : ''}`}
            onClick={() => setIsAnnual(!isAnnual)}
          >
            <div className={styles.switchKnob} />
          </button>
          <span className={isAnnual ? styles.activePeriod : ''}>Bill Annually</span>
        </div>
      </section>

      {/* Pricing Grid */}
      <section className={styles.pricingSection}>
        <div className={styles.pricingGrid}>
          {plansError && <p className={styles.desc}>{plansError}</p>}
          {!plansError && visiblePlans.length === 0 && <p className={styles.desc}>Loading plans from server...</p>}
          {visiblePlans.map((plan) => {
            const displayPrice = plan.price_vnd;
            const popular = plan.tier === 'creator';
            const cycleText = isAnnual ? '/ năm' : '/ tháng';
            
            return (
              <div 
                key={plan.id}
                className={`${styles.priceCard} ${popular ? styles.popularCard : ''} glass-panel`}
              >
                {popular && <span className={styles.popularBadge}>POPULAR</span>}
                <h3 className={styles.planName}>{planName(plan)}</h3>
                <p className={styles.planDescText}>{planDescription(plan)}</p>

                <div className={styles.priceInfo}>
                  <AnimatedPrice price={displayPrice} formatPrice={formatPrice} />
                  {displayPrice !== 0 && <span className={styles.priceCycle}>{cycleText}</span>}
                </div>

                <div className={styles.divider} />

                <ul className={styles.featuresList}>
                  {planFeatures(plan).map((f) => (
                    <li key={f} className={styles.featureItem}>
                      <Check size={14} className={styles.checkIcon} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button 
                  className={`${popular ? 'btn-neon-orange' : 'btn-outline'} ${styles.cardCta}`}
                  onClick={() => navigate('/login')}
                >
                  Get Started
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Detailed Feature Comparison */}
      <section className={styles.comparisonSection}>
        <h2 className={styles.compTitle}>Feature Comparison</h2>
        <div className={`${styles.tableWrapper} glass-panel`}>
          <table className={styles.compTable}>
            <thead>
              <tr>
                <th>Features</th>
                {visiblePlans.map((plan) => <th key={plan.id}>{planName(plan)}</th>)}
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row) => (
                <tr key={row.name}>
                  <td className={styles.featureName}>{row.name}</td>
                  {row.values.map((value, index) => (
                    <td key={`${row.name}-${visiblePlans[index]?.id ?? index}`}>
                      {typeof value === 'boolean' ? (
                        value ? <Check size={16} className={styles.check} /> : <X size={16} className={styles.cross} />
                      ) : (
                        value
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ Section */}
      <section className={styles.faqSection}>
        <h2 className={styles.compTitle}>Frequently Asked Questions</h2>
        <div className={styles.faqGrid}>
          {faqs.map((faq) => (
            <div key={faq.q} className={`${styles.faqCard} glass-panel`}>
              <div className={styles.faqHeader}>
                <HelpCircle size={18} className={styles.faqIcon} />
                <h4>{faq.q}</h4>
              </div>
              <p>{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Reusable Footer */}
      <Footer navigate={navigate} />
    </div>
  );
};

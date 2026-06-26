import React, { useState } from 'react';
import { CreditCard, HardDrive, Check, Calendar, ArrowUpRight, HelpCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './Billing.module.css';

interface Invoice {
  id: string;
  date: string;
  amount: string;
  status: 'Paid' | 'Pending' | 'Failed';
}

export const Billing: React.FC = () => {
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [invoices] = useState<Invoice[]>([
    { id: 'INV-8742', date: 'Jun 15, 2026', amount: '259.000 VNĐ', status: 'Paid' },
    { id: 'INV-8219', date: 'May 15, 2026', amount: '259.000 VNĐ', status: 'Paid' },
    { id: 'INV-7651', date: 'Apr 15, 2026', amount: '259.000 VNĐ', status: 'Paid' },
  ]);

  const pricingTiers = [
    {
      name: 'Free Starter',
      price: '0 VNĐ',
      period: 'mãi mãi',
      description: 'Test the mobile photogrammetry pipeline.',
      features: [
        '3 active projects',
        'Standard scan resolution',
        'Local saves only',
        'Community support',
      ],
      cta: 'Current Plan',
      popular: false,
    },
    {
      name: 'Basic Creator',
      price: '259.000 VNĐ',
      period: 'tháng',
      description: 'Perfect for custom sneaker designers.',
      features: [
        '10 active projects',
        'High-definition 3D meshes',
        '5GB Cloud scan storage',
        'Standard KusStudio sync',
      ],
      cta: 'Current Plan',
      popular: true,
    },
    {
      name: 'Pro Designer',
      price: '649.000 VNĐ',
      period: 'tháng',
      description: 'For professional sneaker workshops.',
      features: [
        '50 active projects',
        'Ultra-HD scan resolution',
        '50GB Cloud storage quota',
        'Priority rendering & sync',
        'OBJ, FBX, GLTF, USDZ exports',
      ],
      cta: 'Upgrade to Pro',
      popular: false,
    },
  ];

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
        {/* Left Side: Current Plan Info */}
        <div className={styles.leftCol}>
          {/* Active Plan Card */}
          <motion.div 
            className={`${styles.planCard} glass-panel`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className={styles.planHeader}>
              <div>
                <span className={styles.planBadge}>ACTIVE PLAN</span>
                <h2 className={styles.planName}>Basic Creator</h2>
              </div>
              <div className={styles.planPriceInfo}>
                <span className={styles.planPrice}>259.000 VNĐ</span>
                <span className={styles.planPeriod}>/ tháng</span>
              </div>
            </div>
            
            <p className={styles.planDesc}>
              You have full access to high-def shoe scans, instant cloud synchronization, and 3D web preview linkages.
            </p>

            <div className={styles.planMeta}>
              <div className={styles.metaItem}>
                <Calendar size={16} className={styles.metaIcon} />
                <span>Next billing date: <strong>July 15, 2026</strong></span>
              </div>
              <div className={styles.metaItem}>
                <CreditCard size={16} className={styles.metaIcon} />
                <span>Payment method: <strong>Visa ending in 4242</strong></span>
              </div>
            </div>

            <div className={styles.planActions}>
              <button className="btn-neon-orange" onClick={() => setShowUpgradeModal(true)}>
                Upgrade / Change Plan
              </button>
              <button className="btn-outline" onClick={() => alert('Cancel Subscription option requested')}>
                Cancel Plan
              </button>
            </div>
          </motion.div>

          {/* Cloud Quotas Card */}
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
                <span>Cloud Storage</span>
                <span>1.4 GB of 5.0 GB used (28%)</span>
              </div>
              <div className={styles.progressBarBg}>
                <div className={styles.progressBarFill} style={{ width: '28%' }} />
              </div>
            </div>

            <div className={styles.quotaInfoList}>
              <div className={styles.quotaInfoItem}>
                <span>Active Scans Sync Limit</span>
                <span>Unlimited (Pro benefit)</span>
              </div>
              <div className={styles.quotaInfoItem}>
                <span>Monthly Scan Processings</span>
                <span>38 / 100 scans</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Side: Invoice History */}
        <motion.div 
          className={`${styles.rightCol} glass-panel`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className={styles.invoiceHeader}>
            <h3 className={styles.invoiceTitle}>Invoice History</h3>
            <button className={styles.invoiceHelpBtn} onClick={() => alert('Support ticket link')}>
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
                    <button className={styles.downloadBtn} onClick={() => alert(`Downloading PDF for ${inv.id}`)}>
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                    key={tier.name} 
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
                      onClick={() => {
                        alert(`Selecting: ${tier.name}`);
                        setShowUpgradeModal(false);
                      }}
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
    </div>
  );
};

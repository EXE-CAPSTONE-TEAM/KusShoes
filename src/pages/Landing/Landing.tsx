import React, { useState } from 'react';
import { Smartphone, Monitor, Cloud, Sparkles, Send, Layout, CheckCircle2, Check, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { AnimatedPrice } from '../../components/AnimatedPrice/AnimatedPrice';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import styles from './Landing.module.css';

interface LandingProps {
  navigate: (path: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ navigate }) => {
  const [emailInput, setEmailInput] = useState('');
  const [submittedEmail, setSubmittedEmail] = useState(false);
  const [isAnnual, setIsAnnual] = useState(false);

  const handleNewsletterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (emailInput.trim()) {
      setSubmittedEmail(true);
      setTimeout(() => {
        setSubmittedEmail(false);
        setEmailInput('');
      }, 3000);
    }
  };

  const steps = [
    {
      num: '01',
      title: 'KusShoes Scanning',
      icon: Smartphone,
      description: 'Use your smartphone to capture pictures of your favorite shoe. Powered by Kiri Engine API, the images are instantly converted into detailed 3D models.'
    },
    {
      num: '02',
      title: 'Cloud Compilation',
      icon: Cloud,
      description: 'All 3D models are uploaded to our Cloud Vault. The cloud servers process mesh details and keep your files secure and accessible anywhere.'
    },
    {
      num: '03',
      title: 'KusStudio Customization',
      icon: Monitor,
      description: 'Sync your cloud assets directly into KusStudio, our desktop client. Customize colors, textures, and export print-ready formats.'
    }
  ];

  const features = [
    {
      title: 'Kiri Engine Photogrammetry',
      icon: Sparkles,
      desc: 'Top-tier 3D scan reconstruction API turns photos into professional-grade polygonal shoe assets with precise dimensions.'
    },
    {
      title: 'Secure Cloud Vault Sync',
      icon: Cloud,
      desc: 'Keep all your customized sneaker assets in one secure cloud workspace. Seamless synchronization between mobile scanner and desktop creator.'
    },
    {
      title: 'Smooth 3D Designer Engine',
      icon: Layout,
      desc: 'Hardware-accelerated environment inside KusStudio. Perform real-time colorway mapping and material editing without latency.'
    }
  ];

  const plans = [
    {
      name: 'Free Starter',
      priceMonthly: 0,
      priceAnnual: 0,
      desc: 'Test the mobile photogrammetry pipeline.',
      features: ['3 active projects', 'Standard scan resolution', 'Local client saves only'],
      popular: false,
    },
    {
      name: 'Basic Creator',
      priceMonthly: 259000,
      priceAnnual: 259000 * 12,
      desc: 'Perfect for custom sneaker designers.',
      features: ['10 active projects', 'High-definition 3D meshes', '5GB Cloud scan storage'],
      popular: true,
    },
    {
      name: 'Pro Designer',
      priceMonthly: 649000,
      priceAnnual: 649000 * 12,
      desc: 'For professional sneaker workshops.',
      features: ['50 active projects', 'Ultra-HD scan resolution', '50GB Cloud storage quota'],
      popular: false,
    },
  ];

  const formatPrice = (val: number) => {
    if (val === 0) return '0 VNĐ';
    return val.toLocaleString('vi-VN') + ' VNĐ';
  };

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
      <Navbar navigate={navigate} currentPage="landing" />

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <motion.div 
          className={styles.heroContent}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <span className={styles.heroBadge}>THE FUTURE OF SNEAKER CUSTOMIZATION</span>
          <h1 className={styles.heroTitle}>
            SCAN WITH <span className="text-gradient-orange">KUSSHOES</span>.<br />
            DESIGN IN <span className="text-gradient-orange">KUSSTUDIO</span>.
          </h1>
          <p className={styles.heroDesc}>
            A unified design ecosystem. Turn physical sneakers into interactive 3D models via photogrammetry, save them to the cloud, and build unique customs inside a responsive 3D design studio.
          </p>
          <div className={styles.heroActions}>
            <button className="btn-neon-orange" onClick={() => navigate('/login')} style={{ padding: '16px 36px', fontSize: '1.05rem' }}>
              Launch App Portal
            </button>
            <a href="#products" className="btn-outline" style={{ padding: '16px 36px', fontSize: '1.05rem', textDecoration: 'none' }}>
              Explore Products
            </a>
          </div>
        </motion.div>
        
        {/* Subtle decorative grid background overlay */}
        <div className={styles.heroGridOverlay} />
      </section>

      {/* Products Showcase Section */}
      <section id="products" className={styles.productsSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sneaker Flow Products</h2>
          <p className={styles.sectionSubtitle}>Seamlessly transition from mobile capture to full-fledged desktop design workspace.</p>
        </div>

        <div className={styles.productsGrid}>
          {/* KusShoes Mobile */}
          <motion.div 
            className={`${styles.productCard} glass-panel`}
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className={styles.productBadge}>MOBILE APP</div>
            <h3 className={styles.productTitle}>KusShoes</h3>
            <p className={styles.productDesc}>
              Our mobile scanning companion. Aim, shoot, and capture 360° photos of your footwear. Uploads images directly to the Kiri Engine API server for cloud 3D modeling.
            </p>
            {/* MVP screenshot placeholder */}
            <div className={styles.screenshotFrame}>
              <div className={styles.phoneMockup}>
                <div className={styles.phoneHeader}>
                  <div className={styles.phoneCamera} />
                </div>
                <div className={styles.phoneContent}>
                  <p className={styles.phoneAppTitle}>KusShoes Scan</p>
                  <div className={styles.phoneCameraView}>
                    <Smartphone size={32} className={styles.phoneIconPulse} />
                    <span>Point at sneaker</span>
                  </div>
                  <button className={styles.phoneBtn}>Capture Model</button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* KusStudio Desktop */}
          <motion.div 
            className={`${styles.productCard} glass-panel`}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className={styles.productBadge} style={{ background: 'rgba(230, 30, 67, 0.1)', color: 'var(--color-crimson)', borderColor: 'rgba(230, 30, 67, 0.2)' }}>DESKTOP ENGINE</div>
            <h3 className={styles.productTitle}>KusStudio</h3>
            <p className={styles.productDesc}>
              The creative workshop client. Downloads your reconstructed 3D shoe models from the Cloud Vault. Features advanced colorway editing, painting, and texture selection tools.
            </p>
            {/* MVP screenshot placeholder */}
            <div className={styles.screenshotFrame}>
              <div className={styles.desktopMockup}>
                <div className={styles.desktopHeader}>
                  <div className={styles.desktopWindowDots}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className={styles.desktopWindowTitle}>KusStudio Workspace</span>
                </div>
                <div className={styles.desktopContent}>
                  <div className={styles.desktopLayoutSidebar}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.desktopCanvas}>
                    <Monitor size={36} className={styles.desktopIcon} />
                    <span>3D Sneaker Canvas Grid</span>
                  </div>
                  <div className={styles.desktopToolPanel}>
                    <span className={styles.toolColorDot} style={{ background: '#FF5A36' }} />
                    <span className={styles.toolColorDot} style={{ background: '#E61E43' }} />
                    <span className={styles.toolColorDot} style={{ background: '#38BDF8' }} />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Workflow (3-step) Section */}
      <section id="workflow" className={styles.workflowSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>The Creation Workflow</h2>
          <p className={styles.sectionSubtitle}>Simple, automated process to digitize and personalize your sneakers.</p>
        </div>

        <div className={styles.stepsGrid}>
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div 
                key={step.num}
                className={`${styles.stepCard} glass-panel`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 * index }}
              >
                <div className={styles.stepNumHeader}>
                  <span className={styles.stepNum}>{step.num}</span>
                  <div className={styles.stepIconWrapper}>
                    <Icon size={20} className={styles.stepIcon} />
                  </div>
                </div>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepDesc}>{step.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className={styles.featuresSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Engine Features</h2>
          <p className={styles.sectionSubtitle}>Advanced backend integrations that make sneaker modeling fast and stable.</p>
        </div>

        <div className={styles.featuresGrid}>
          {features.map((feat, index) => {
            const Icon = feat.icon;
            return (
              <motion.div 
                key={feat.title}
                className={`${styles.featCard} glass-panel`}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.15 * index }}
              >
                <div className={styles.featIconBox}>
                  <Icon size={24} className={styles.featIcon} />
                </div>
                <h3 className={styles.featTitle}>{feat.title}</h3>
                <p className={styles.featDesc}>{feat.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Pricing Section (NEW) */}
      <section id="pricing" className={styles.pricingSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Sneaker Flow Pricing</h2>
          <p className={styles.sectionSubtitle}>Choose a plan to power your shoe scans. Annual plans are billed in full.</p>

          {/* Toggle billing */}
          <div className={styles.toggleContainer}>
            <span className={!isAnnual ? styles.activePeriod : ''}>Monthly</span>
            <button 
              className={`${styles.toggleSwitch} ${isAnnual ? styles.switchActive : ''}`}
              onClick={() => setIsAnnual(!isAnnual)}
            >
              <div className={styles.switchKnob} />
            </button>
            <span className={isAnnual ? styles.activePeriod : ''}>Annually</span>
          </div>
        </div>

        <div className={styles.pricingGrid}>
          {plans.map((plan) => {
            const displayPrice = isAnnual ? plan.priceAnnual : plan.priceMonthly;
            const cycleText = isAnnual ? '/ năm' : '/ tháng';
            
            return (
              <div 
                key={plan.name}
                className={`${styles.priceCard} ${plan.popular ? styles.popularCard : ''} glass-panel`}
              >
                {plan.popular && <span className={styles.popularBadge}>POPULAR</span>}
                <h3 className={styles.planName}>{plan.name}</h3>
                <p className={styles.planDescText}>{plan.desc}</p>

                <div className={styles.priceInfo}>
                  <AnimatedPrice price={displayPrice} formatPrice={formatPrice} />
                  {displayPrice !== 0 && <span className={styles.priceCycle}>{cycleText}</span>}
                </div>

                <div className={styles.divider} />

                <ul className={styles.featuresList}>
                  {plan.features.map((f) => (
                    <li key={f} className={styles.featureItem}>
                      <Check size={14} className={styles.checkIcon} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <button 
                  className={`${plan.popular ? 'btn-neon-orange' : 'btn-outline'} ${styles.cardCta}`}
                  onClick={() => navigate('/login')}
                >
                  Get Started
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <button 
            className="btn-outline" 
            onClick={() => navigate('/pricing')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span>View Full Feature Comparison</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* Beta Registration Newsletter Section */}
      <section className={styles.newsletterSection}>
        <motion.div 
          className={`${styles.newsletterBox} glass-panel`}
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2 className={styles.newsTitle}>Join the Sneaker Flow Beta</h2>
          <p className={styles.newsDesc}>
            Register your email today to receive download links for KusShoes & KusStudio once public testing starts. Get 50 free cloud scans upon launch!
          </p>

          <form onSubmit={handleNewsletterSubmit} className={styles.newsForm}>
            {submittedEmail ? (
              <div className={styles.successMessage}>
                <CheckCircle2 size={24} className={styles.successIcon} />
                <span>Thank you! We will email you beta credentials soon.</span>
              </div>
            ) : (
              <div className={styles.inputContainer}>
                <input
                  type="email"
                  placeholder="Enter your email address..."
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className={styles.newsInput}
                  required
                />
                <button type="submit" className="btn-neon-orange">
                  <span>Subscribe</span>
                  <Send size={14} />
                </button>
              </div>
            )}
          </form>
        </motion.div>
      </section>

      {/* Reusable Footer */}
      <Footer navigate={navigate} />
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Smartphone, Monitor, Cloud, Send, CheckCircle2, Check, ArrowRight, Plus, Minus, Star, StarHalf, Layers, ScanLine, UsersRound, TrendingUp, BadgeCheck, ArrowUpRight, Flame } from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { AnimatedPrice } from '../../components/AnimatedPrice/AnimatedPrice';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import { useTheme } from '../../context/ThemeContext';
import dashboardShowcase from '../../assets/showcase/dashboard-screenshot.png';
import projectsShowcase from '../../assets/showcase/projects-screenshot.png';
import styles from './Landing.module.css';

const showcaseTabs = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', img: dashboardShowcase },
  { key: 'projects', label: 'Projects', path: '/projects', img: projectsShowcase },
] as const;

type ShowcaseTabKey = typeof showcaseTabs[number]['key'];

const WebsiteShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ShowcaseTabKey>('dashboard');
  const active = showcaseTabs.find(t => t.key === activeTab)!;

  return (
    <section id="showcase" className={styles.showcaseSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>See It In Action</h2>
        <p className={styles.sectionSubtitle}>
          A real look at the KusShoes web portal — track your projects and manage your creations from any browser.
        </p>
      </div>

      <div className={styles.showcaseTabs}>
        {showcaseTabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            className={`${styles.showcaseTabBtn} ${activeTab === tab.key ? styles.showcaseTabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <motion.div
        className={styles.showcaseFrameWrapper}
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
      >
        <div className={styles.browserMockup}>
          <div className={styles.browserHeader}>
            <div className={styles.desktopWindowDots}>
              <span /><span /><span />
            </div>
            <div className={styles.browserUrlBar}>
              <span className={styles.browserUrlText}>kusshoes.app{active.path}</span>
            </div>
          </div>
          <div className={styles.browserContent}>
            <AnimatePresence mode="wait">
              <motion.img
                key={active.key}
                src={active.img}
                alt={`KusShoes ${active.label} screenshot`}
                className={styles.browserScreenshot}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
              />
            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </section>
  );
};

interface StatCounterProps {
  target: number;
  decimals?: number;
  suffix?: string;
}

const StatCounter: React.FC<StatCounterProps> = ({ target, decimals = 0, suffix = '' }) => {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    let start: number | null = null;
    const durationMs = 1400;
    let frame: number;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;
      const progress = Math.min((timestamp - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isInView, target]);

  const formatted = decimals > 0
    ? value.toFixed(decimals)
    : Math.round(value).toLocaleString('en-US');

  return <span ref={ref}>{formatted}{suffix}</span>;
};

const TypewriterHeadline: React.FC = () => {
  const [line1Done, setLine1Done] = useState(false);
  const [line2Done, setLine2Done] = useState(false);

  const container1 = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
      }
    }
  };

  const container2 = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.9,
        staggerChildren: 0.04,
      }
    }
  };

  const letter = {
    hidden: { opacity: 0, display: 'none' },
    visible: {
      opacity: 1,
      display: 'inline'
    }
  };

  return (
    <h1 className={styles.heroTitle}>
      {/* Line 1 */}
      <motion.div 
        className={styles.typewriterLine}
        variants={container1}
        initial="hidden"
        animate="visible"
        onAnimationComplete={() => setLine1Done(true)}
      >
        {"SCAN WITH ".split("").map((char, index) => (
          <motion.span key={index} variants={letter}>{char}</motion.span>
        ))}
        <span className="text-gradient-orange">
          {"KUSSHOES".split("").map((char, index) => (
            <motion.span key={index} variants={letter}>{char}</motion.span>
          ))}
        </span>
        <motion.span variants={letter}>.</motion.span>
        {!line1Done && <span className={styles.typingCursor} />}
      </motion.div>

      {/* Line 2 */}
      <motion.div 
        className={styles.typewriterLine}
        variants={container2}
        initial="hidden"
        animate="visible"
        onAnimationComplete={() => setLine2Done(true)}
      >
        {"DESIGN IN ".split("").map((char, index) => (
          <motion.span key={index} variants={letter}>{char}</motion.span>
        ))}
        <span className="text-gradient-orange">
          {"KUSSTUDIO".split("").map((char, index) => (
            <motion.span key={index} variants={letter}>{char}</motion.span>
          ))}
        </span>
        <motion.span variants={letter}>.</motion.span>
        {line1Done && !line2Done && <span className={styles.typingCursor} />}
      </motion.div>
    </h1>
  );
};

interface LandingProps {
  navigate: (path: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ navigate }) => {
  const { theme } = useTheme();
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
      description: 'Use your smartphone to capture pictures of your favorite shoe. Powered by Kiri Engine API, the images are instantly converted into detailed 3D models.',
      tags: ['Photogrammetry', 'Auto-Alignment', 'Kiri Engine API']
    },
    {
      num: '02',
      title: 'Cloud Compilation',
      icon: Cloud,
      description: 'All 3D models are uploaded to our Cloud Vault. The cloud servers process mesh details and keep your files secure and accessible anywhere.',
      tags: ['Cloud Mesh Processing', 'AES-256 Storage', 'Auto Retopology']
    },
    {
      num: '03',
      title: 'KusStudio Customization',
      icon: Monitor,
      description: 'Sync your cloud assets directly into KusStudio, our desktop client. Customize colors, textures, and export print-ready formats.',
      tags: ['Real-time PBR', 'Multi-Format Export', '3D Print Ready']
    }
  ];

  const communityTicker: Array<{ icon?: typeof Flame; label: string }> = [
    { icon: Flame, label: 'KUSSHOES COMMUNITY' },
    { label: 'DROP AFTER DROP' },
    { label: '12.4K+ CUSTOM BUILDS' },
    { label: 'STREET CRED VERIFIED' },
    { label: '3D KICKS REVOLUTION' },
    { label: 'LIDAR ACCURATE' },
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

  const faqs = [
    {
      q: 'What is KusShoes and how does it work?',
      a: 'Scan a real sneaker with your phone camera, let AI turn it into a 3D model, then customize it in KusStudio (web/desktop) and export a 3D file plus a reference pack to bring to an artisan for physical production. KusShoes doesn’t run manufacturing or take custom orders itself.',
    },
    {
      q: 'Do I need a powerful computer to use KusShoes?',
      a: 'The web app runs directly in your browser (Chrome, Safari, Edge) and offloads most processing to the cloud, so you don’t need a powerful machine to start designing. If you want KusStudio Desktop for full high-fidelity 3D rendering, paint mapping, and offline sync, your computer will need a reasonably capable graphics card to run it smoothly.',
    },
    {
      q: 'How does the AI background removal feature work?',
      a: 'Upload any image — a logo, a pattern, artwork — and our AI automatically detects and removes the background in seconds. Drop the transparent result straight onto the 3D shoe surface right away.',
    },
    {
      q: 'I don’t have a sneaker to scan — can I still design one?',
      a: 'Yes. Start right away with a preset shoe from our library — Free includes 3 base models, Basic/Pro unlock the entire library.',
    },
    {
      q: 'What do I need to scan a sneaker?',
      a: 'Use the KusShoes mobile app, record a video at 720p or higher, place the shoe inside the guide frame and rotate it a full 360°, up to 30 photos or a 60-second video (200MB total). Scanning is a Basic/Pro plan benefit — Free designs on preset models only.',
    },
    {
      q: 'What’s the difference between the plans?',
      a: 'Free is 0đ (3 preset shoes, no scanning, PNG export with watermark) · Basic is 259,000đ/month (1 scan per cycle, GLB export at 2K texture, 100 exports) · Pro is 649,000đ/month (more scans, GLB+OBJ export at 4K texture, no watermark). You can also buy extra scan credits for 49,000đ each while on Basic/Pro.',
    },
    {
      q: 'Do plans auto-renew or auto-charge?',
      a: 'No. We only remind you before your plan expires and give you a 3-day grace period where you can still view and edit designs (scanning and exporting are paused), after which your account moves to Free — your saved designs are never lost.',
    },
    {
      q: 'What do I get once my design is finished?',
      a: 'A 3D file (GLB, plus OBJ on Pro), high-quality render images, and a reference PDF pack with color codes, sizing, and sticker/text placement — ready to hand to an artisan for physical production.',
    },
    {
      q: 'What payment methods are supported, and are they safe?',
      a: 'We support VietQR (PayOS), MoMo, and VNPay. Card details are entered directly on the payment gateway’s page — KusShoes never stores your card or wallet info, and you’ll get a PDF receipt after every successful payment.',
    },
    {
      q: 'Is my data and account secure?',
      a: 'Passwords are encrypted, two-factor authentication (2FA) is supported, and you can view and revoke individual login devices anytime. You can also download all your data or permanently delete your account whenever you want.',
    },
  ];
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className={styles.container}>
      {/* Aurora gradient mesh — slow-drifting ambient background blobs */}
      <div className={styles.aurora} aria-hidden="true">
        <div className={`${styles.auroraBlob} ${styles.auroraBlob1}`} />
        <div className={`${styles.auroraBlob} ${styles.auroraBlob2}`} />
        <div className={`${styles.auroraBlob} ${styles.auroraBlob3}`} />
      </div>

      {/* Interactive mouse particle grid */}
      <InteractiveParticleGrid />

      {/* Vignette: darkens edges, focuses eye on center */}
      <div className={styles.vignette} />

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
          <TypewriterHeadline />
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
          <h2 className={styles.sectionTitle}>KusShoes Products</h2>
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
            <img
              src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
              alt="KusShoes"
              className={styles.productLogoImage}
            />
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

      {/* Real website screenshot showcase */}
      <WebsiteShowcase />

      {/* Workflow (3-step) Section */}
      <section id="workflow" className={styles.workflowSection}>
        <div className={styles.sectionHeader}>
          <div className={styles.pipelineBadge}>
            <span className={styles.pulseDotWrap}>
              <span className={styles.pulseRing} />
              <span className={styles.pulseDot} />
            </span>
            <span className={styles.pipelineBadgeLabel}>Photogrammetry Pipeline 3.0</span>
          </div>
          <h2 className={styles.sectionTitle}>The Creation <span className="text-gradient-orange">Workflow</span></h2>
          <p className={styles.sectionSubtitle}>Simple, automated process to digitize and personalize your sneakers.</p>
        </div>

        <div className={styles.stepsGridWrapper}>
          <div className={styles.stepsConnector} aria-hidden="true" />
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
                  <div className={styles.stepCardTop}>
                    <div className={styles.stepNumHeader}>
                      <span className={styles.stepNum}>{step.num}</span>
                      <div className={styles.stepIconWrapper}>
                        <Icon size={20} className={styles.stepIcon} />
                      </div>
                    </div>
                    <h3 className={styles.stepTitle}>{step.title}</h3>
                    <p className={styles.stepDesc}>{step.description}</p>
                  </div>
                  <div className={styles.stepTags}>
                    {step.tags.map(tag => (
                      <span key={tag} className={styles.stepTag}>
                        <span className={styles.stepTagDot} />
                        {tag}
                      </span>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        <motion.div
          className={`${styles.workflowCta} glass-panel`}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className={styles.workflowCtaText}>
            <h3>Ready to digitize your sneakers?</h3>
            <p>Get started with free 3D mobile capture in minutes.</p>
          </div>
          <div className={styles.workflowCtaActions}>
            <button className="btn-neon-orange" onClick={() => navigate('/login')}>
              <span>Start Free Scan</span>
              <ArrowRight size={16} />
            </button>
            <a href="#features" className="btn-outline" style={{ textDecoration: 'none' }}>
              Documentation
            </a>
          </div>
        </motion.div>
      </section>

      {/* Social Proof Section */}
      <section id="social-proof" className={styles.socialProofSection}>
        <div className={styles.proofMesh} aria-hidden="true" />

        <div className={styles.proofInner}>
          <header className={styles.proofHeader}>
            <div className={styles.proofBadgeRow}>
              <span className={styles.pulseDotWrap}>
                <span className={styles.pulseRing} />
                <span className={styles.pulseDot} />
              </span>
              <span className={styles.proofBadgeText}>Streetwear Verified Data</span>
              <span className={styles.proofBadgeLive}>LIVE CLOUD</span>
            </div>

            <h2 className={styles.proofHeadline}>
              Loved by a{' '}
              <span className={styles.proofHeadlineAccent}>
                Growing
                <svg className={styles.proofUnderline} viewBox="0 0 200 12" fill="none" preserveAspectRatio="none">
                  <path d="M2 9C58 2 142 2 198 9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>{' '}
              Community
            </h2>
            <p className={styles.proofSubtitle}>
              Real numbers from sneakerheads, streetwear creators, and 3D customizers already cooking heat on{' '}
              <span className={styles.proofSubtitleBrand}>KusShoes</span>.
            </p>
          </header>

          <div className={styles.bentoGrid}>
            {/* Card 1 — Designs Created */}
            <motion.div
              className={`${styles.bentoCard} ${styles.bentoCardWide} ${styles.bentoCardHero}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <span className={styles.cardWatermark} aria-hidden="true">DROP</span>
              <div className={styles.cardHalftone} aria-hidden="true" />

              <div className={styles.cardTopRow}>
                <div className={styles.cardIconLabelGroup}>
                  <div className={styles.cardIconBox}>
                    <Layers size={22} />
                  </div>
                  <div>
                    <span className={styles.cardMetaLabel}>Total Output</span>
                    <div>
                      <span className={styles.cardGrowthBadge}>+24% THIS WEEK</span>
                    </div>
                  </div>
                </div>
                <div className={styles.cardSticker}>#HEAT-DROPS</div>
              </div>

              <div className={styles.cardStatBlock}>
                <div className={styles.cardStatRow}>
                  <span className={styles.cardStatValueLg}>
                    <StatCounter target={12400} suffix="+" />
                  </span>
                  <span className={styles.cardStatBolt}>⚡</span>
                </div>
                <h3 className={styles.cardStatTitle}>Designs Created &amp; 3D Rendered</h3>
                <p className={styles.cardStatDesc}>
                  From retro high-tops to hyper-futuristic chunky outsoles — all crafted in real time inside KusStudio by creators worldwide.
                </p>
              </div>

              <div className={styles.cardFooterRow}>
                <div className={styles.trendingGroup}>
                  <span className={styles.trendingLabel}>Trending:</span>
                  <span className={styles.trendingPill}>Cyber Dunk '04</span>
                  <span className={`${styles.trendingPill} ${styles.trendingPillHideMobile}`}>Rust Orange AJ1</span>
                </div>
                <div className={styles.velocityBadge}>
                  <TrendingUp size={16} />
                  <span>High Velocity Render</span>
                </div>
              </div>
            </motion.div>

            {/* Card 2 — Sneakers Scanned */}
            <motion.div
              className={`${styles.bentoCard} ${styles.bentoCardNarrow}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <div className={styles.cardTopRow}>
                <div className={styles.cardIconBox}>
                  <ScanLine size={22} />
                </div>
                <span className={styles.techSpecTag}>LiDAR / Mobile 3D</span>
              </div>

              <div className={styles.cardStatBlock}>
                <span className={styles.cardStatValueMd}>
                  <StatCounter target={3150} suffix="+" />
                </span>
                <h3 className={styles.cardStatTitle}>Sneakers Scanned</h3>
                <p className={styles.cardStatDesc}>
                  Physical grails digitized with mm-level accuracy straight from mobile cameras.
                </p>
              </div>

              <div className={styles.techSpecRow}>
                <span className={styles.techSpecCheck}>
                  <Check size={15} />
                  Mesh Quality 4K RAW
                </span>
                <span className={styles.techSpecLatency}>0.02s LATENCY</span>
              </div>
            </motion.div>

            {/* Card 3 — Active Creators */}
            <motion.div
              className={`${styles.bentoCard} ${styles.bentoCardNarrow}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <div className={styles.cardTopRow}>
                <div className={styles.cardIconBox}>
                  <UsersRound size={22} />
                </div>
                <div className={styles.liveIndicator}>
                  <span className={styles.liveIndicatorDot} />
                  <span>142 Live Cooking</span>
                </div>
              </div>

              <div className={styles.cardStatBlock}>
                <span className={styles.cardStatValueMd}>
                  <StatCounter target={980} suffix="+" />
                </span>
                <h3 className={styles.cardStatTitle}>Active Creators</h3>
                <p className={styles.cardStatDesc}>
                  Indie customizers, sneakerheads and streetwear designers sharing presets daily.
                </p>
              </div>

              <div className={styles.avatarRow}>
                <div className={styles.avatarStack}>
                  <span className={`${styles.avatarCircle} ${styles.avatarSlate}`}>VN</span>
                  <span className={`${styles.avatarCircle} ${styles.avatarOrange}`}>DR</span>
                  <span className={`${styles.avatarCircle} ${styles.avatarAmber}`}>SL</span>
                  <span className={`${styles.avatarCircle} ${styles.avatarGhost}`}>+98</span>
                </div>
                <span className={styles.avatarHandle}>@driplab3d &amp; crew</span>
              </div>
            </motion.div>

            {/* Card 4 — Rating & Testimonial */}
            <motion.div
              className={`${styles.bentoCard} ${styles.bentoCardWide}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <div className={styles.cardTopRow}>
                <div className={styles.cardIconLabelGroup}>
                  <div className={styles.cardIconBox}>
                    <Star size={20} fill="currentColor" />
                  </div>
                  <div>
                    <span className={styles.cardMetaLabel}>Sneakerhead Satisfaction</span>
                    <div className={styles.ratingStars}>
                      {[0, 1, 2, 3].map((i) => (
                        <Star key={i} size={14} fill="currentColor" />
                      ))}
                      <StarHalf size={14} fill="currentColor" />
                      <span className={styles.ratingStarsValue}>4.84</span>
                    </div>
                  </div>
                </div>
                <div className={styles.verifiedStamp}>
                  <BadgeCheck size={16} />
                  <span>2,400+ VERIFIED REVIEWS</span>
                </div>
              </div>

              <div className={styles.quoteBox}>
                <p className={styles.quoteText}>
                  "KusShoes turns any wild design concept into an interactive 3D model in seconds. Easiest sneaker customizer for Dunk &amp; Jordan samples out there."
                </p>
                <div className={styles.quoteAuthorRow}>
                  <div className={styles.quoteAuthorIdentity}>
                    <span className={styles.quoteAvatar}>MT</span>
                    <div className={styles.quoteAuthorNames}>
                      <span className={styles.quoteAuthorName}>Minh Trần</span>
                      <span className={styles.quoteAuthor}>@minh.kicks</span>
                    </div>
                  </div>
                  <span className={styles.quoteAuthorMeta}>Custom Sneaker Studio · Verified</span>
                </div>
              </div>

              <div className={styles.ratingCallout}>
                <div className={styles.ratingBig}>
                  <span className={styles.ratingBigValue}>4.8 / 5.0</span>
                  <span className={styles.ratingBigLabel}>Average Rating</span>
                </div>
                <a href="#showcase" className={styles.readReviewsLink}>
                  <span>Read Reviews</span>
                  <ArrowUpRight size={16} />
                </a>
              </div>
            </motion.div>
          </div>

          {/* Scrolling ticker */}
          <div className={styles.tickerStrip}>
            <div className={styles.tickerTrack}>
              {[0, 1].map((groupIndex) => (
                <div key={groupIndex} className={styles.tickerGroup} aria-hidden={groupIndex === 1}>
                  {communityTicker.map((item, i) => (
                    <React.Fragment key={i}>
                      <span className={styles.tickerItem}>
                        {item.icon && <item.icon size={14} fill="currentColor" />}
                        {item.label}
                      </span>
                      <span className={styles.tickerDot}>•</span>
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Footnote CTA */}
          <div className={styles.proofFootnote}>
            <div className={styles.proofFootnoteLeft}>
              <span className={styles.proofFootnoteDot} />
              <span>Open creator cloud sync · Free tier available for solo sneakerheads</span>
            </div>
            <a href="#showcase" className={styles.proofFootnoteLink}>
              <span>Explore The App</span>
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Pricing Section (NEW) */}
      <section id="pricing" className={styles.pricingSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>KusShoes Pricing</h2>
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

      {/* FAQ Section */}
      <section id="faq" className={styles.faqSection}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Frequently Asked Questions</h2>
          <p className={styles.sectionSubtitle}>Everything you need to know before you start scanning.</p>
        </div>

        <div className={styles.faqList}>
          {faqs.map((faq, index) => {
            const isOpen = openFaqIndex === index;
            return (
              <motion.div
                key={faq.q}
                className={`${styles.faqItem} glass-panel`}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <button
                  type="button"
                  className={styles.faqQuestion}
                  onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.faqQuestionText}>{faq.q}</span>
                  <span className={styles.faqIconBox}>
                    {isOpen ? <Minus size={16} /> : <Plus size={16} />}
                  </span>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden' }}
                    >
                      <p className={styles.faqAnswer}>{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
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
          <h2 className={styles.newsTitle}>Join the KusShoes Beta</h2>
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

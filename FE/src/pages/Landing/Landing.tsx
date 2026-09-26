import React, { useState, useRef, useEffect } from 'react';
import {
  Monitor,
  Send,
  CheckCircle2,
  Check,
  ArrowRight,
  Plus,
  Minus,
  Star,
  StarHalf,
  Layers,
  ScanLine,
  UsersRound,
  TrendingUp,
  BadgeCheck,
  Flame,
  Clock,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { AnimatedPrice } from '../../components/AnimatedPrice/AnimatedPrice';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import { EdgeArt } from '../../components/EdgeArt/EdgeArt';
import dashboardShowcase from '../../assets/showcase/dashboard-screenshot.png';
import projectsShowcase from '../../assets/showcase/projects-screenshot.png';
import mobileOnboarding from '../../assets/showcase/mobile-onboarding.png';
import mobileScan from '../../assets/showcase/mobile-scan.png';
import mobileExplore from '../../assets/showcase/mobile-explore.png';
import mobileProfile from '../../assets/showcase/mobile-profile.png';
import mobileAppIcon from '../../assets/kusshoes-mobile-app-icon.jpeg';
import sneakerHero from '../../assets/sneaker-hero.png';
import galleryClassicOrange from '../../assets/gallery/classic-orange-studio.png';
import galleryInvertedBlock from '../../assets/gallery/inverted-block-studio.png';
import galleryStreetGraffiti from '../../assets/gallery/street-graffiti-skate.png';
import galleryNeonAlley from '../../assets/gallery/neon-alley-rain.png';
import galleryWebCrimson from '../../assets/gallery/web-crimson-dark.png';
import galleryCourtNavy from '../../assets/gallery/court-navy-outdoor.png';
import galleryCoquettePink from '../../assets/gallery/coquette-pink-bedroom.png';
import gallerySweetheartBow from '../../assets/gallery/sweetheart-bow-desk.png';
import gallerySkyDreamer from '../../assets/gallery/sky-dreamer-clouds.png';
import galleryFlameNavy from '../../assets/gallery/flame-navy-skate.png';
import gallerySignatureDuo from '../../assets/gallery/signature-duo-box.png';
import gallerySplashStreet from '../../assets/gallery/splash-street-wall.png';
import galleryStudioClassic from '../../assets/gallery/studio-classic-angle.png';
import galleryBlockEdition from '../../assets/gallery/block-edition-single.png';
import galleryDetailFocus from '../../assets/gallery/detail-focus-single.png';
import galleryTagDetail from '../../assets/gallery/tag-detail-pair.png';
import styles from './Landing.module.css';

const showcaseTabs = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', img: dashboardShowcase },
  { key: 'projects', label: 'Projects', path: '/projects', img: projectsShowcase },
] as const;

type ShowcaseTabKey = (typeof showcaseTabs)[number]['key'];

const mobileShowcaseScreens = [
  { key: 'onboarding', label: 'Đăng nhập', img: mobileOnboarding },
  { key: 'scan', label: 'Quét AI', img: mobileScan },
  { key: 'explore', label: 'Khám phá', img: mobileExplore },
  { key: 'profile', label: 'Cá nhân', img: mobileProfile },
] as const;

type MobileScreenKey = (typeof mobileShowcaseScreens)[number]['key'];

// Placeholder avatar photos (pravatar.cc — a stock placeholder-avatar service) standing in
// for real creator/reviewer photos until there's a public reviews endpoint.
const trustAvatars = [
  'https://i.pravatar.cc/80?img=12',
  'https://i.pravatar.cc/80?img=32',
  'https://i.pravatar.cc/80?img=5',
  'https://i.pravatar.cc/80?img=48',
  'https://i.pravatar.cc/80?img=65',
];

const testimonials = [
  {
    quote:
      'KusShoes turns any wild design concept into an interactive 3D model in seconds. Easiest sneaker customizer for Dunk & Jordan samples out there.',
    name: 'Minh Trần',
    handle: '@minh.kicks',
    avatar: 'https://i.pravatar.cc/80?img=11',
  },
  {
    quote:
      'Scanned my grails in an afternoon and had GLB files ready for my 3D printer by dinner. Insane workflow.',
    name: 'Alex Rivera',
    handle: '@rivera3d',
    avatar: 'https://i.pravatar.cc/80?img=33',
  },
  {
    quote:
      'The colorway editor alone is worth it — I ship a new drop for my Discord every week now.',
    name: 'Yuki Sato',
    handle: '@yukicustoms',
    avatar: 'https://i.pravatar.cc/80?img=47',
  },
] as const;

// Real KusShoes custom colorway renders (from the design team's shoe-photo drop), standing in
// for a live community gallery until there's a public gallery endpoint (see
// docs/SRS_Implementation_Checklist.md — SC-34 has no FE page yet).
// Each tile cycles through its own small set so the section keeps feeling alive.
const galleryTiles = [
  {
    size: 'tall',
    frames: [
      { tag: 'Classic Orange', img: galleryClassicOrange },
      { tag: 'Inverted Block', img: galleryInvertedBlock },
    ],
  },
  {
    size: 'wide',
    frames: [
      { tag: 'Street Graffiti', img: galleryStreetGraffiti },
      { tag: 'Neon Alley', img: galleryNeonAlley },
    ],
  },
  {
    size: 'square',
    frames: [
      { tag: 'Web Crimson', img: galleryWebCrimson },
      { tag: 'Court Navy', img: galleryCourtNavy },
    ],
  },
  {
    size: 'square',
    frames: [
      { tag: 'Coquette Pink', img: galleryCoquettePink },
      { tag: 'Sweetheart Bow', img: gallerySweetheartBow },
    ],
  },
  {
    size: 'wide',
    frames: [
      { tag: 'Sky Dreamer', img: gallerySkyDreamer },
      { tag: 'Flame Navy', img: galleryFlameNavy },
    ],
  },
  {
    size: 'square',
    frames: [
      { tag: 'Signature Duo', img: gallerySignatureDuo },
      { tag: 'Splash Street', img: gallerySplashStreet },
    ],
  },
  {
    size: 'tall',
    frames: [
      { tag: 'Studio Classic', img: galleryStudioClassic },
      { tag: 'Block Edition', img: galleryBlockEdition },
    ],
  },
  {
    size: 'square',
    frames: [
      { tag: 'Detail Focus', img: galleryDetailFocus },
      { tag: 'Tag Detail', img: galleryTagDetail },
    ],
  },
] as const;

const GALLERY_CYCLE_BASE_MS = 3200;

const GalleryTile: React.FC<{
  size: string;
  frames: readonly { tag: string; img: string }[];
  index: number;
}> = ({ size, frames, index }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (frames.length <= 1) return;
    // Slightly different period per tile so they drift out of sync instead of flipping in unison.
    const timer = setInterval(
      () => {
        setFrameIndex((current) => (current + 1) % frames.length);
      },
      GALLERY_CYCLE_BASE_MS + index * 350,
    );
    return () => clearInterval(timer);
  }, [frames.length, index]);

  const current = frames[frameIndex];

  return (
    <motion.div
      className={`${styles.galleryItem} ${styles[size]}`}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, delay: (index % 4) * 0.08 }}
    >
      <AnimatePresence>
        <motion.img
          key={current.img}
          src={current.img}
          alt={current.tag}
          className={styles.galleryImage}
          loading="lazy"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeInOut' }}
        />
      </AnimatePresence>
      <div className={styles.galleryOverlay}>
        <AnimatePresence mode="wait">
          <motion.span
            key={current.tag}
            className={styles.galleryTag}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          >
            {current.tag}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const WebsiteShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ShowcaseTabKey>('dashboard');
  const active = showcaseTabs.find((t) => t.key === activeTab)!;

  return (
    <section id="showcase" className={styles.showcaseSection}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>See It In Action</h2>
        <p className={styles.sectionSubtitle}>
          A real look at the KusShoes web portal — track your projects and manage your creations
          from any browser.
        </p>
      </div>

      <div className={styles.showcaseTabs}>
        {showcaseTabs.map((tab) => (
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
              <span />
              <span />
              <span />
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

const MobileAppShowcase: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<MobileScreenKey>('scan');
  const active = mobileShowcaseScreens.find((s) => s.key === activeScreen)!;

  return (
    <div className={styles.mobileShowcaseWrap}>
      <div className={styles.phoneMockup}>
        <span className={styles.phoneButtonMute} />
        <span className={styles.phoneButtonVolUp} />
        <span className={styles.phoneButtonVolDown} />
        <span className={styles.phoneButtonPower} />
        <div className={styles.phoneScreenWindow}>
          <div className={styles.phoneDynamicIsland} />
          <AnimatePresence mode="wait">
            <motion.img
              key={active.key}
              src={active.img}
              alt={`KusShoes mobile app — ${active.label}`}
              className={styles.phoneScreenshot}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            />
          </AnimatePresence>
          <div className={styles.phoneHomeIndicator} />
        </div>
      </div>
      <div className={styles.phoneShadow} aria-hidden="true" />
      <div className={styles.phoneTabs}>
        {mobileShowcaseScreens.map((screen) => (
          <button
            key={screen.key}
            type="button"
            className={`${styles.phoneTabBtn} ${activeScreen === screen.key ? styles.phoneTabBtnActive : ''}`}
            onClick={() => setActiveScreen(screen.key)}
          >
            {screen.label}
          </button>
        ))}
      </div>
    </div>
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

  const formatted =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString('en-US');

  return (
    <span ref={ref}>
      {formatted}
      {suffix}
    </span>
  );
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
      },
    },
  };

  const container2 = {
    hidden: { opacity: 1 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 0.9,
        staggerChildren: 0.04,
      },
    },
  };

  const letter = {
    hidden: { opacity: 0, display: 'none' },
    visible: {
      opacity: 1,
      display: 'inline',
    },
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
        {'SCAN WITH '.split('').map((char, index) => (
          <motion.span key={index} variants={letter}>
            {char}
          </motion.span>
        ))}
        <span className="text-gradient-orange">
          {'KUSSHOES'.split('').map((char, index) => (
            <motion.span key={index} variants={letter}>
              {char}
            </motion.span>
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
        {'DESIGN IN '.split('').map((char, index) => (
          <motion.span key={index} variants={letter}>
            {char}
          </motion.span>
        ))}
        <span className="text-gradient-orange">
          {'KUSSTUDIO'.split('').map((char, index) => (
            <motion.span key={index} variants={letter}>
              {char}
            </motion.span>
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
      title: 'Scan with your phone',
      description: 'Walk around your sneaker and snap photos. No special gear needed.',
      image: mobileScan,
      imageAlt: 'Scanning a sneaker with AI 3D capture in the KusShoes mobile app',
      cornerBadge: '4 angles captured',
      MetaIcon: Clock,
      metaText: 'About 3 minutes',
    },
    {
      num: '02',
      title: 'We build the 3D model',
      description: 'Your photos turn into a detailed 3D model in the cloud, automatically.',
      image: dashboardShowcase,
      imageAlt: 'Cloud dashboard syncing and processing a scan',
      cornerBadge: 'Cloud sync active',
      tagText: 'cloud pipeline',
      dashed: true,
      MetaIcon: Sparkles,
      metaText: 'Automatic · no action needed',
    },
    {
      num: '03',
      title: 'Make it yours in KusStudio',
      description: 'Recolor, swap materials, and export for 3D printing.',
      image: sneakerHero,
      imageAlt: 'Finished 3D sneaker customized in KusStudio',
      cornerBadge: 'KusStudio',
      swatches: true,
      MetaIcon: Monitor,
      metaText: 'Desktop app · Windows & macOS',
    },
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

      {/* Reusable Navbar */}
      <Navbar navigate={navigate} currentPage="landing" />

      {/* Hero Section */}
      <section className={styles.heroSection}>
        <EdgeArt variant="hero" />
        <motion.div
          className={styles.heroContent}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <span className={styles.heroBadge}>THE FUTURE OF SNEAKER CUSTOMIZATION</span>
          <TypewriterHeadline />
          <p className={styles.heroDesc}>
            A unified design ecosystem. Turn physical sneakers into interactive 3D models via
            photogrammetry, save them to the cloud, and build unique customs inside a responsive 3D
            design studio.
          </p>
          <div className={styles.heroActions}>
            <button
              className="btn-neon-orange"
              onClick={() => navigate('/login')}
              style={{ padding: '16px 36px', fontSize: '1.05rem' }}
            >
              Launch App Portal
            </button>
            <a
              href="#products"
              className="btn-outline"
              style={{ padding: '16px 36px', fontSize: '1.05rem', textDecoration: 'none' }}
            >
              Explore Products
            </a>
          </div>
        </motion.div>

        {/* Subtle decorative grid background overlay */}
        <div className={styles.heroGridOverlay} />
      </section>

      {/* Products Showcase Section */}
      <section id="products" className={styles.productsSection}>
        <EdgeArt variant="products" />
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>KusShoes Products</h2>
          <p className={styles.sectionSubtitle}>
            Seamlessly transition from mobile capture to full-fledged desktop design workspace.
          </p>
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
            <div className={styles.productLogoFrame}>
              <img
                src={mobileAppIcon}
                alt="KusShoes Mobile app icon"
                className={styles.productLogoImage}
              />
            </div>
            <p className={styles.productDesc}>
              Our mobile scanning companion. Aim, shoot, and capture 360° photos of your footwear.
              Uploads images directly to the Kiri Engine API server for cloud 3D modeling.
            </p>
            <MobileAppShowcase />
          </motion.div>

          {/* KusStudio Desktop */}
          <motion.div
            className={`${styles.productCard} glass-panel`}
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div
              className={styles.productBadge}
              style={{
                background: 'rgba(230, 30, 67, 0.1)',
                color: 'var(--color-crimson)',
                borderColor: 'rgba(230, 30, 67, 0.2)',
              }}
            >
              DESKTOP ENGINE
            </div>
            <h3 className={styles.productTitle}>KusStudio</h3>
            <p className={styles.productDesc}>
              The creative workshop client. Downloads your reconstructed 3D shoe models from the
              Cloud Vault. Features advanced colorway editing, painting, and texture selection
              tools.
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

      {/* Gallery Section — visual proof of what you can create */}
      <section id="gallery" className={styles.gallerySection}>
        <EdgeArt variant="gallery" />
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>One Base Shoe, Infinite Styles</h2>
          <p className={styles.sectionSubtitle}>
            Scan a sneaker once, then remix colorways, materials and graphics as many times as you
            want. Here&apos;s a taste of what customization looks like.
          </p>
        </div>

        <div className={styles.galleryGrid}>
          {galleryTiles.map((tile, index) => (
            <GalleryTile key={index} size={tile.size} frames={tile.frames} index={index} />
          ))}
        </div>
      </section>

      {/* Real website screenshot showcase */}
      <WebsiteShowcase />

      {/* Workflow (3-step) Section */}
      <section id="workflow" className={styles.workflowSection}>
        <EdgeArt variant="workflow" />
        <div className={styles.sectionHeader}>
          <span className={styles.sectionEyebrow}>How it works</span>
          <h2 className={styles.sectionTitle}>From your shelf to your screen in minutes</h2>
          <p className={styles.sectionSubtitle}>
            Scan a real sneaker with your phone. We handle the 3D. You make it yours.
          </p>
        </div>

        <div className={styles.stepsGridWrapper}>
          <div className={`${styles.stepConnector} ${styles.stepConnectorOne}`} aria-hidden="true">
            <span className={styles.stepConnectorLine} />
            <ChevronRight size={14} className={styles.stepConnectorArrow} />
          </div>
          <div className={`${styles.stepConnector} ${styles.stepConnectorTwo}`} aria-hidden="true">
            <span className={styles.stepConnectorLine} />
            <ChevronRight size={14} className={styles.stepConnectorArrow} />
          </div>

          <div className={styles.stepsGrid}>
            {steps.map((step, index) => {
              const MetaIcon = step.MetaIcon;
              return (
                <React.Fragment key={step.num}>
                  <motion.div
                    className={`${styles.stepCard} ${step.dashed ? styles.stepCardDashed : ''}`}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: 0.1 * index }}
                  >
                    <div
                      className={`${styles.stepVisual} ${step.dashed ? styles.stepVisualDashed : ''}`}
                    >
                      <img src={step.image} alt={step.imageAlt} className={styles.stepImage} />
                      <span
                        className={`${styles.stepCornerBadge} ${step.swatches ? styles.stepCornerBadgeAccent : ''}`}
                      >
                        {step.cornerBadge}
                      </span>
                      {step.swatches && (
                        <div className={styles.stepSwatches}>
                          <span
                            className={`${styles.swatchDot} ${styles.swatchWhite}`}
                            title="White"
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchFog}`}
                            title="Light Fog"
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchAccent}`}
                            title="Sole Amber Glow"
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchDark}`}
                            title="Obsidian"
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchGum}`}
                            title="Gum Rubber"
                          />
                          <span className={styles.swatchLabel}>Colorway</span>
                        </div>
                      )}
                    </div>

                    <div className={styles.stepBody}>
                      <div className={styles.stepMetaRow}>
                        <span className={styles.stepEyebrowLabel}>Step {index + 1}</span>
                        {step.tagText && <span className={styles.stepTagText}>{step.tagText}</span>}
                      </div>
                      <h3 className={styles.stepTitle}>{step.title}</h3>
                      <p className={styles.stepDesc}>{step.description}</p>
                      <div className={styles.stepFooter}>
                        <MetaIcon size={14} className={styles.stepFooterIcon} />
                        <span>{step.metaText}</span>
                      </div>
                    </div>
                  </motion.div>

                  {index < steps.length - 1 && (
                    <div className={styles.stepConnectorMobile} aria-hidden="true">
                      <span className={styles.stepConnectorMobileLine} />
                      <ChevronRight size={14} className={styles.stepConnectorMobileArrow} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className={styles.workflowQuietRow}>
          <p className={styles.workflowQuietText}>
            Secure cloud storage · Print-ready exports · Real-time material preview
          </p>
          <button className={styles.workflowQuietBtn} onClick={() => navigate('/login')}>
            Start Free Scan
          </button>
        </div>
      </section>

      {/* Social Proof Section */}
      <section id="social-proof" className={styles.socialProofSection}>
        <div className={styles.proofMesh} aria-hidden="true" />

        <div className={styles.proofInner}>
          <header className={styles.proofHeader}>
            <h2 className={styles.proofHeadline}>
              Loved by a{' '}
              <span className={styles.proofHeadlineAccent}>
                Growing
                <svg
                  className={styles.proofUnderline}
                  viewBox="0 0 200 12"
                  fill="none"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 9C58 2 142 2 198 9"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                </svg>
              </span>{' '}
              Community
            </h2>
            <p className={styles.proofSubtitle}>
              Real numbers from sneakerheads, streetwear creators, and 3D customizers already
              cooking heat on <span className={styles.proofSubtitleBrand}>KusShoes</span>.
            </p>
          </header>

          {/* Trust bar — real avatar photos + rating, one compact line */}
          <motion.div
            className={styles.trustBar}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <div className={styles.trustAvatars}>
              {trustAvatars.map((src, i) => (
                <img key={i} src={src} alt="" className={styles.trustAvatarImg} />
              ))}
              <span className={styles.trustAvatarMore}>+980</span>
            </div>
            <span className={styles.trustDivider} aria-hidden="true" />
            <div className={styles.trustRating}>
              <span className={styles.ratingStarsSmall}>
                {[0, 1, 2, 3].map((i) => (
                  <Star key={i} size={13} fill="currentColor" />
                ))}
                <StarHalf size={13} fill="currentColor" />
              </span>
              <span className={styles.trustRatingValue}>4.8</span>
              <span className={styles.trustRatingCount}>
                <BadgeCheck size={13} /> 2,400+ verified reviews
              </span>
            </div>
          </motion.div>

          {/* Compact stat tiles */}
          <div className={styles.statTileGrid}>
            <motion.div
              className={styles.statTile}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
            >
              <Layers size={18} className={styles.statTileIcon} />
              <span className={styles.statTileValue}>
                <StatCounter target={12400} suffix="+" />
              </span>
              <span className={styles.statTileLabel}>Designs Created</span>
            </motion.div>
            <motion.div
              className={styles.statTile}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.05 }}
            >
              <ScanLine size={18} className={styles.statTileIcon} />
              <span className={styles.statTileValue}>
                <StatCounter target={3150} suffix="+" />
              </span>
              <span className={styles.statTileLabel}>Sneakers Scanned</span>
            </motion.div>
            <motion.div
              className={styles.statTile}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <UsersRound size={18} className={styles.statTileIcon} />
              <span className={styles.statTileValue}>
                <StatCounter target={980} suffix="+" />
              </span>
              <span className={styles.statTileLabel}>Active Creators</span>
            </motion.div>
            <motion.div
              className={styles.statTile}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: 0.15 }}
            >
              <TrendingUp size={18} className={styles.statTileIcon} />
              <span className={styles.statTileValue}>+24%</span>
              <span className={styles.statTileLabel}>Output This Week</span>
            </motion.div>
          </div>

          {/* Compact testimonials — real avatar photos, short quotes */}
          <div className={styles.testimonialRow}>
            {testimonials.map((t, i) => (
              <motion.div
                key={t.handle}
                className={styles.testimonialCard}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <p className={styles.testimonialQuote}>&ldquo;{t.quote}&rdquo;</p>
                <div className={styles.testimonialAuthor}>
                  <img src={t.avatar} alt={t.name} className={styles.testimonialAvatar} />
                  <div className={styles.testimonialAuthorText}>
                    <span className={styles.testimonialName}>{t.name}</span>
                    <span className={styles.testimonialHandle}>{t.handle}</span>
                  </div>
                </div>
              </motion.div>
            ))}
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
          <p className={styles.sectionSubtitle}>
            Choose a plan to power your shoe scans. Annual plans are billed in full.
          </p>

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
          <p className={styles.sectionSubtitle}>
            Everything you need to know before you start scanning.
          </p>
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
            Register your email today to receive download links for KusShoes & KusStudio once public
            testing starts. Get 50 free cloud scans upon launch!
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

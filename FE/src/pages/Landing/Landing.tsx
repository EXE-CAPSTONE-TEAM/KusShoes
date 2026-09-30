import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import {
  Monitor,
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
import { Trans, useTranslation } from 'react-i18next';
import { useTheme } from '../../context/ThemeContext';
import { Navbar } from '../../components/Navbar/Navbar';
import { Footer } from '../../components/Footer/Footer';
import { AnimatedPrice } from '../../components/AnimatedPrice/AnimatedPrice';
import { InteractiveParticleGrid } from '../../components/InteractiveParticleGrid/InteractiveParticleGrid';
import { EdgeArt } from '../../components/EdgeArt/EdgeArt';
import { ShoeHeroExperience } from '../../components/ShoeHeroExperience/ShoeHeroExperience';
import { api, type Plan } from '../../api/client';
import dashboardShowcase from '../../assets/showcase/dashboard-screenshot.png';
import projectsShowcase from '../../assets/showcase/projects-screenshot.png';
import mobileScan from '../../assets/showcase/mobile-scan.png';
import mobileMockup from '../../assets/kusshoes-mobile-mockup.jpg';
import sneakerHero from '../../assets/sneaker-hero.png';
import heroEdgeLeft from '../../assets/edge-art/hero-left.png';
import heroEdgeLeftDark from '../../assets/edge-art/hero-left-dark.png';
import heroEdgeRight from '../../assets/edge-art/hero-right.png';
import heroEdgeRightDark from '../../assets/edge-art/hero-right-dark.png';
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
import { addBootTask, preloadImage } from '../../boot/boot';
import { useBootDone } from '../../boot/useBootDone';
import styles from './Landing.module.css';

// Scroll-triggered reveal: headings stay hidden (blurred, offset, transparent) until they
// scroll into view, then ease into place — nothing on the page is fully drawn before the
// visitor scrolls to it.
const REVEAL_EASE = [0.16, 1, 0.3, 1] as const;

const revealUp = {
  initial: { opacity: 0, y: 24, filter: 'blur(6px)' },
  whileInView: { opacity: 1, y: 0, filter: 'blur(0px)' },
  viewport: { once: true, amount: 0.4 },
  transition: { duration: 0.7, ease: REVEAL_EASE },
} as const;

/** Headline reveal where each word eases in on its own beat — a standout moment, used once. */
const RevealWords: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <motion.h2
    className={className}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, amount: 0.4 }}
  >
    {text.split(' ').map((word, i) => (
      <motion.span
        key={i}
        style={{ display: 'inline-block', marginRight: '0.28em' }}
        variants={{
          hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
          visible: {
            opacity: 1,
            y: 0,
            filter: 'blur(0px)',
            transition: { duration: 0.5, ease: REVEAL_EASE, delay: i * 0.06 },
          },
        }}
      >
        {word}
      </motion.span>
    ))}
  </motion.h2>
);

const SHOWCASE_TAB_META = [
  { key: 'dashboard', path: '/dashboard', img: dashboardShowcase },
  { key: 'projects', path: '/projects', img: projectsShowcase },
] as const;

type ShowcaseTabKey = (typeof SHOWCASE_TAB_META)[number]['key'];

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
    frames: [
      { tag: 'Classic Orange', img: galleryClassicOrange },
      { tag: 'Inverted Block', img: galleryInvertedBlock },
    ],
  },
  {
    frames: [
      { tag: 'Street Graffiti', img: galleryStreetGraffiti },
      { tag: 'Neon Alley', img: galleryNeonAlley },
    ],
  },
  {
    frames: [
      { tag: 'Web Crimson', img: galleryWebCrimson },
      { tag: 'Court Navy', img: galleryCourtNavy },
    ],
  },
  {
    frames: [
      { tag: 'Coquette Pink', img: galleryCoquettePink },
      { tag: 'Sweetheart Bow', img: gallerySweetheartBow },
    ],
  },
  {
    frames: [
      { tag: 'Sky Dreamer', img: gallerySkyDreamer },
      { tag: 'Flame Navy', img: galleryFlameNavy },
    ],
  },
  {
    frames: [
      { tag: 'Signature Duo', img: gallerySignatureDuo },
      { tag: 'Splash Street', img: gallerySplashStreet },
    ],
  },
  {
    frames: [
      { tag: 'Studio Classic', img: galleryStudioClassic },
      { tag: 'Block Edition', img: galleryBlockEdition },
    ],
  },
  {
    frames: [
      { tag: 'Detail Focus', img: galleryDetailFocus },
      { tag: 'Tag Detail', img: galleryTagDetail },
    ],
  },
] as const;

const GALLERY_CYCLE_BASE_MS = 3200;

const GalleryTile: React.FC<{
  frames: readonly { tag: string; img: string }[];
  index: number;
}> = ({ frames, index }) => {
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
      className={styles.galleryItem}
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
  const { t } = useTranslation('landing');
  const [activeTab, setActiveTab] = useState<ShowcaseTabKey>('dashboard');
  const showcaseTabs = SHOWCASE_TAB_META.map((tab) => ({
    ...tab,
    label: tab.key === 'dashboard' ? t('showcase.dashboardTab') : t('showcase.projectsTab'),
  }));
  const active = showcaseTabs.find((tab) => tab.key === activeTab)!;

  return (
    <section id="showcase" className={styles.showcaseSection}>
      <div className={styles.sectionHeader}>
        <motion.h2 className={styles.sectionTitle} {...revealUp}>{t('showcase.title')}</motion.h2>
        <motion.p
          className={styles.sectionSubtitle}
          {...revealUp}
          transition={{ ...revealUp.transition, delay: 0.12 }}
        >
          {t('showcase.subtitle')}
        </motion.p>
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
                alt={t('showcase.screenshotAlt', { label: active.label })}
                className={styles.browserScreenshot}
                loading="lazy"
                decoding="async"
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

  const formatted =
    decimals > 0 ? value.toFixed(decimals) : Math.round(value).toLocaleString('en-US');

  return (
    <span ref={ref}>
      {formatted}
      {suffix}
    </span>
  );
};

interface LandingProps {
  navigate: (path: string) => void;
}

export const Landing: React.FC<LandingProps> = ({ navigate }) => {
  const { t } = useTranslation('landing');
  const { theme } = useTheme();
  useBootDone();

  // First-screen assets the boot loader waits for: the current theme's hero edge art (hidden
  // below 1100px, so skipped there) and the navbar logo. Failures resolve, never block.
  useLayoutEffect(() => {
    const logo =
      theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png';
    addBootTask(preloadImage(logo));
    if (window.matchMedia?.('(min-width: 1101px)').matches) {
      const dark = theme === 'dark';
      addBootTask(preloadImage(dark ? heroEdgeLeftDark : heroEdgeLeft));
      addBootTask(preloadImage(dark ? heroEdgeRightDark : heroEdgeRight));
    }
    // Registered once for the theme the page first renders with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isAnnual, setIsAnnual] = useState(false);
  const { t: tPricing } = useTranslation('pricing');
  const [apiPlans, setApiPlans] = useState<Plan[] | null>(null);
  const [plansError, setPlansError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .listPlans()
      .then((result) => {
        if (!cancelled) setApiPlans(result);
      })
      .catch((caught) => {
        if (!cancelled) setPlansError(caught instanceof Error ? caught.message : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.title = 'KusShoes: Shape your shoes, show your style';
  }, []);

  const steps = [
    {
      num: '01',
      title: t('workflow.step1.title'),
      description: t('workflow.step1.description'),
      image: mobileScan,
      imageAlt: t('workflow.step1.imageAlt'),
      cornerBadge: t('workflow.step1.cornerBadge'),
      MetaIcon: Clock,
      metaText: t('workflow.step1.metaText'),
    },
    {
      num: '02',
      title: t('workflow.step2.title'),
      description: t('workflow.step2.description'),
      image: dashboardShowcase,
      imageAlt: t('workflow.step2.imageAlt'),
      cornerBadge: t('workflow.step2.cornerBadge'),
      tagText: 'cloud pipeline',
      dashed: true,
      MetaIcon: Sparkles,
      metaText: t('workflow.step2.metaText'),
    },
    {
      num: '03',
      title: t('workflow.step3.title'),
      description: t('workflow.step3.description'),
      image: sneakerHero,
      imageAlt: t('workflow.step3.imageAlt'),
      cornerBadge: t('workflow.step3.cornerBadge'),
      swatches: true,
      MetaIcon: Monitor,
      metaText: t('workflow.step3.metaText'),
    },
  ];

  const communityTicker: Array<{ icon?: typeof Flame; label: string }> = [
    { icon: Flame, label: t('socialProof.tickerCommunity') },
    { label: t('socialProof.tickerDrop') },
    { label: t('socialProof.tickerBuilds') },
    { label: t('socialProof.tickerStreetCred') },
    { label: t('socialProof.tickerRevolution') },
    { label: t('socialProof.tickerLidar') },
  ];

  // Yearly plans exist in the backend but can be deactivated for a given term (BR-93) —
  // only offer the toggle when there's an active yearly plan to actually switch to, otherwise
  // paid tiers would vanish from the grid with nothing left to pick from.
  const hasAnnualPlans = useMemo(
    () => (apiPlans ?? []).some((plan) => plan.billing_cycle === 'yearly'),
    [apiPlans],
  );

  // Prices and limits come from /api/v1/plans; only the marketing name/blurb per tier is copy.
  const plans = useMemo(() => {
    const cycle = isAnnual && hasAnnualPlans ? 'yearly' : 'monthly';
    const copyTiers = ['free', 'basic', 'pro'];
    return (apiPlans ?? [])
      .filter((plan) => plan.billing_cycle === null || plan.billing_cycle === cycle)
      .sort((a, b) => a.price_vnd - b.price_vnd)
      .map((plan) => {
        const hasCopy = copyTiers.includes(plan.tier);
        return {
          id: plan.id,
          name: hasCopy
            ? t(`pricingSection.plans.${plan.tier}.name`)
            : plan.tier.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
          desc: hasCopy ? t(`pricingSection.plans.${plan.tier}.desc`) : '',
          price: plan.price_vnd,
          features: [
            plan.max_projects === null
              ? tPricing('unlimitedActiveProjects')
              : tPricing('activeProjectsCount', { count: plan.max_projects }),
            plan.max_exports_per_month === null
              ? tPricing('unlimitedMonthlyExports')
              : tPricing('monthlyExportsCount', { count: plan.max_exports_per_month }),
            tPricing('formatsLabel', {
              formats: plan.allowed_export_formats.map((item) => item.toUpperCase()).join(', '),
            }),
          ],
          popular: plan.tier === 'basic',
        };
      });
  }, [apiPlans, isAnnual, hasAnnualPlans, t, tPricing]);

  const formatPrice = (val: number) => {
    if (val === 0) return '0 VNĐ';
    return val.toLocaleString('vi-VN') + ' VNĐ';
  };

  // t(..., { returnObjects: true }) can hand back the raw key string instead of the array on
  // the very first render, before i18next's async language detection has resolved — guard it so
  // that race doesn't crash the whole page with "X.map is not a function".
  const rawFaqs = t('faqSection.items', { returnObjects: true });
  const faqs = Array.isArray(rawFaqs) ? (rawFaqs as Array<{ q: string; a: string }>) : [];
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className={styles.container}>
      {/* Interactive mouse particle grid */}
      <InteractiveParticleGrid />

      {/* Vignette: darkens edges, focuses eye on center */}
      <div className={styles.vignette} />

      {/* Reusable Navbar */}
      <Navbar navigate={navigate} currentPage="landing" />

      {/* 3D Sneaker Storytelling Hero Experience with GSAP ScrollTrigger */}
      <ShoeHeroExperience
        navigate={navigate}
        onExploreProducts={() => {
          const el = document.getElementById('products');
          el?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      {/* Products Showcase Section */}
      <section id="products" className={styles.productsSection}>
        <EdgeArt variant="products" />
        <div className={styles.sectionHeader}>
          <motion.h2 className={styles.sectionTitle} {...revealUp}>{t('products.title')}</motion.h2>
          <motion.p
            className={styles.sectionSubtitle}
            {...revealUp}
            transition={{ ...revealUp.transition, delay: 0.12 }}
          >
            {t('products.subtitle')}
          </motion.p>
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
            <div className={styles.productBadge}>{t('products.mobileBadge')}</div>
            <div className={styles.productTitleRow}>
              <div className={styles.productLogoFrame}>
                <img
                  src={theme === 'dark' ? '/KusShoes_Logo_Dark_Mode_cropped.png' : '/KusShoes_Logo_cropped.png'}
                  alt={t('products.mobileIconAlt')}
                  className={styles.productLogoImage}
                  loading="lazy"
                />
              </div>
              <h3 className={styles.productTitle}>{t('products.mobileTitle')}</h3>
            </div>
            <p className={styles.productDesc}>{t('products.mobileDesc')}</p>
            <div className={styles.screenshotFrame}>
              <img
                src={mobileMockup}
                alt={t('products.mobileScreenshotAlt')}
                className={styles.mobileProductImage}
                loading="lazy"
                decoding="async"
              />
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
            <div
              className={styles.productBadge}
              style={{
                background: 'rgba(230, 30, 67, 0.1)',
                color: 'var(--color-crimson)',
                borderColor: 'rgba(230, 30, 67, 0.2)',
              }}
            >
              {t('products.desktopBadge')}
            </div>
            <h3 className={styles.productTitle}>{t('products.desktopTitle')}</h3>
            <p className={styles.productDesc}>{t('products.desktopDesc')}</p>
            {/* MVP screenshot placeholder */}
            <div className={styles.screenshotFrame}>
              <div className={styles.desktopMockup}>
                <div className={styles.desktopHeader}>
                  <div className={styles.desktopWindowDots}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className={styles.desktopWindowTitle}>{t('products.desktopWorkspaceTitle')}</span>
                </div>
                <div className={styles.desktopContent}>
                  <div className={styles.desktopLayoutSidebar}>
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className={styles.desktopCanvas}>
                    <Monitor size={36} className={styles.desktopIcon} />
                    <span>{t('products.desktopCanvasLabel')}</span>
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
          <motion.h2 className={styles.sectionTitle} {...revealUp}>{t('gallery.title')}</motion.h2>
          <motion.p
            className={styles.sectionSubtitle}
            {...revealUp}
            transition={{ ...revealUp.transition, delay: 0.12 }}
          >
            {t('gallery.subtitle')}
          </motion.p>
        </div>

        <div className={styles.galleryGrid}>
          {galleryTiles.map((tile, index) => (
            <GalleryTile key={index} frames={tile.frames} index={index} />
          ))}
        </div>
      </section>

      {/* Real website screenshot showcase */}
      <WebsiteShowcase />

      {/* Workflow (3-step) Section */}
      <section id="workflow" className={styles.workflowSection}>
        <EdgeArt variant="workflow" />
        <div className={styles.sectionHeader}>
          <motion.span className={styles.sectionEyebrow} {...revealUp}>{t('workflow.eyebrow')}</motion.span>
          <RevealWords className={styles.sectionTitle} text={t('workflow.title')} />
          <motion.p
            className={styles.sectionSubtitle}
            {...revealUp}
            transition={{ ...revealUp.transition, delay: 0.3 }}
          >
            {t('workflow.subtitle')}
          </motion.p>
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
                      <img
                        src={step.image}
                        alt={step.imageAlt}
                        className={styles.stepImage}
                        loading="lazy"
                        decoding="async"
                      />
                      <span
                        className={`${styles.stepCornerBadge} ${step.swatches ? styles.stepCornerBadgeAccent : ''}`}
                      >
                        {step.cornerBadge}
                      </span>
                      {step.swatches && (
                        <div className={styles.stepSwatches}>
                          <span
                            className={`${styles.swatchDot} ${styles.swatchWhite}`}
                            title={t('workflow.swatchWhite')}
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchFog}`}
                            title={t('workflow.swatchFog')}
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchAccent}`}
                            title={t('workflow.swatchAccent')}
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchDark}`}
                            title={t('workflow.swatchDark')}
                          />
                          <span
                            className={`${styles.swatchDot} ${styles.swatchGum}`}
                            title={t('workflow.swatchGum')}
                          />
                          <span className={styles.swatchLabel}>{t('workflow.colorway')}</span>
                        </div>
                      )}
                    </div>

                    <div className={styles.stepBody}>
                      <div className={styles.stepMetaRow}>
                        <span className={styles.stepEyebrowLabel}>{t('workflow.stepLabel', { number: index + 1 })}</span>
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
          <p className={styles.workflowQuietText}>{t('workflow.footerText')}</p>
          <button className={styles.workflowQuietBtn} onClick={() => navigate('/login')}>
            {t('workflow.startFreeScan')}
          </button>
        </div>
      </section>

      {/* Social Proof Section */}
      <section id="social-proof" className={styles.socialProofSection}>
        <div className={styles.proofMesh} aria-hidden="true" />

        <div className={styles.proofInner}>
          <header className={styles.proofHeader}>
            <motion.h2 className={styles.proofHeadline} {...revealUp}>
              {t('socialProof.headlinePrefix')}{' '}
              <span className={styles.proofHeadlineAccent}>
                {t('socialProof.headlineAccent')}
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
              {t('socialProof.headlineSuffix')}
            </motion.h2>
            <motion.p
              className={styles.proofSubtitle}
              {...revealUp}
              transition={{ ...revealUp.transition, delay: 0.12 }}
            >
              <Trans
                i18nKey="socialProof.subtitle"
                t={t}
                components={{ brand: <span className={styles.proofSubtitleBrand} /> }}
              />
            </motion.p>
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
                <img key={i} src={src} alt="" className={styles.trustAvatarImg} loading="lazy" />
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
                <BadgeCheck size={13} /> {t('socialProof.reviewsCount')}
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
              <span className={styles.statTileLabel}>{t('socialProof.statDesigns')}</span>
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
              <span className={styles.statTileLabel}>{t('socialProof.statScanned')}</span>
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
              <span className={styles.statTileLabel}>{t('socialProof.statCreators')}</span>
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
              <span className={styles.statTileLabel}>{t('socialProof.statOutput')}</span>
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
                  <img
                    src={t.avatar}
                    alt={t.name}
                    className={styles.testimonialAvatar}
                    loading="lazy"
                  />
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
              <span>{t('socialProof.footnoteText')}</span>
            </div>
            <a href="#showcase" className={styles.proofFootnoteLink}>
              <span>{t('socialProof.exploreApp')}</span>
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

      {/* Pricing Section (NEW) */}
      <section id="pricing" className={styles.pricingSection}>
        <div className={styles.sectionHeader}>
          <motion.h2 className={styles.sectionTitle} {...revealUp}>{t('pricingSection.title')}</motion.h2>
          <motion.p
            className={styles.sectionSubtitle}
            {...revealUp}
            transition={{ ...revealUp.transition, delay: 0.12 }}
          >
            {t('pricingSection.subtitle')}
          </motion.p>

          {/* Toggle billing — only shown when yearly plans are actually on sale */}
          {hasAnnualPlans && (
            <div className={styles.toggleContainer}>
              <span className={!isAnnual ? styles.activePeriod : ''}>{t('pricingSection.monthly')}</span>
              <button
                className={`${styles.toggleSwitch} ${isAnnual ? styles.switchActive : ''}`}
                onClick={() => setIsAnnual(!isAnnual)}
              >
                <div className={styles.switchKnob} />
              </button>
              <span className={isAnnual ? styles.activePeriod : ''}>{t('pricingSection.annually')}</span>
            </div>
          )}
        </div>

        <div className={styles.pricingGrid}>
          {plansError && <p className={styles.planDescText}>{tPricing('loadPlansError')}</p>}
          {!plansError && apiPlans === null && (
            <p className={styles.planDescText}>{tPricing('loadingPlans')}</p>
          )}
          {plans.map((plan, planIndex) => {
            const displayPrice = plan.price;
            const cycleText = isAnnual ? t('pricingSection.perYear') : t('pricingSection.perMonth');

            return (
              <motion.div
                key={plan.id}
                className={`${styles.priceCard} ${plan.popular ? styles.popularCard : ''} glass-panel`}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.5, ease: REVEAL_EASE, delay: planIndex * 0.1 }}
              >
                {plan.popular && <span className={styles.popularBadge}>{t('pricingSection.popularBadge')}</span>}
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
                  {t('pricingSection.getStarted')}
                </button>
              </motion.div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <button
            className="btn-outline"
            onClick={() => navigate('/pricing')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <span>{t('pricingSection.viewComparison')}</span>
            <ArrowRight size={16} />
          </button>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className={styles.faqSection}>
        <div className={styles.sectionHeader}>
          <motion.h2 className={styles.sectionTitle} {...revealUp}>{t('faqSection.title')}</motion.h2>
          <motion.p
            className={styles.sectionSubtitle}
            {...revealUp}
            transition={{ ...revealUp.transition, delay: 0.12 }}
          >
            {t('faqSection.subtitle')}
          </motion.p>
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

      {/* Reusable Footer */}
      <Footer navigate={navigate} />
    </div>
  );
};

import React, { useRef, useState } from 'react';
import { ArrowRight, Cloud, Monitor, Move3d, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import heroSneakerNoBg from '../../assets/hero-sneaker-nobg.webp';
import heroSneakerAltNoBg from '../../assets/hero-sneaker-alt-nobg.webp';
import classicOrangeNoBg from '../../assets/classic-orange-nobg.webp';
import streetGraffitiNoBg from '../../assets/street-graffiti-nobg.webp';
import neonAlleyNoBg from '../../assets/neon-alley-nobg.webp';
import webCrimsonNoBg from '../../assets/web-crimson-nobg.webp';
import mobileAppIcon from '../../assets/kusshoes-mobile-app-icon.webp';
import { EdgeArt } from '../EdgeArt/EdgeArt';
import { TypingText } from '../TypingText/TypingText';
import styles from './ShoeHeroExperience.module.css';

gsap.registerPlugin(ScrollTrigger, useGSAP);

interface ShoeHeroExperienceProps {
  navigate: (path: string) => void;
  onExploreProducts?: () => void;
}

const COLORWAYS = [
  { id: 'orange', name: 'Classic Orange', color: '#FF5A36', img: classicOrangeNoBg },
  { id: 'graffiti', name: 'Street Graffiti', color: '#E61E43', img: streetGraffitiNoBg },
  { id: 'neon', name: 'Neon Alley', color: '#38BDF8', img: neonAlleyNoBg },
  { id: 'crimson', name: 'Web Crimson', color: '#8B5CF6', img: webCrimsonNoBg },
] as const;

export const ShoeHeroExperience: React.FC<ShoeHeroExperienceProps> = ({
  navigate,
  onExploreProducts,
}) => {
  const { t } = useTranslation('landing');
  const containerRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const shoeWrapperRef = useRef<HTMLDivElement>(null);
  const shoeImgRef = useRef<HTMLImageElement>(null);
  const shoeAltImgRef = useRef<HTMLImageElement>(null);
  const floorShadowRef = useRef<HTMLDivElement>(null);

  const beat1Ref = useRef<HTMLDivElement>(null);
  const beat2Ref = useRef<HTMLDivElement>(null);
  const beat3Ref = useRef<HTMLDivElement>(null);
  const beat4Ref = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  // Which step card is on screen (0 = none); drives the typing animation
  const [activeStep, setActiveStep] = useState(0);
  const [activeColorway, setActiveColorway] = useState<string>('orange');
  const [selectedImg, setSelectedImg] = useState<string>(heroSneakerAltNoBg);

  // Set up GSAP ScrollTrigger timeline and quickTo mouse tilt
  useGSAP(
    (_, contextSafe) => {
      if (!containerRef.current || !viewportRef.current || !shoeWrapperRef.current) return;

      const isMobile = window.innerWidth <= 900;
      const shoeEl = shoeWrapperRef.current;
      const shadowEl = floorShadowRef.current;

      // QuickTo tweens for buttery smooth 60fps mouse 3D tilt (as per gsap-performance)
      const tiltXTo = gsap.quickTo(shoeEl, 'rotationY', { duration: 0.5, ease: 'power3.out' });
      const tiltYTo = gsap.quickTo(shoeEl, 'rotationX', { duration: 0.5, ease: 'power3.out' });
      const shadowXTo = shadowEl
        ? gsap.quickTo(shadowEl, 'x', { duration: 0.5, ease: 'power3.out' })
        : null;

      // Safe mousemove handler wrapped in contextSafe
      const handleMouseMove = contextSafe?.((e: MouseEvent) => {
        if (isMobile) return;
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;

        const normX = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
        const normY = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);

        // Subtly tilt within +/- 10 degrees based on pointer
        tiltXTo(normX * 12);
        tiltYTo(-normY * 10);
        shadowXTo?.(normX * -20);
      });

      if (handleMouseMove) {
        window.addEventListener('mousemove', handleMouseMove);
      }

      // Initial layout settings
      // Above 1100px the edge art is visible and the copy column moves in to clear it (see the
      // min-width: 1101px rule in the CSS), so the sneaker sits further right to keep clear of it.
      const hasEdgeArt = window.innerWidth > 1100;
      const beat1X = isMobile ? 0 : hasEdgeArt ? 300 : 180;
      const beat1Y = isMobile ? -30 : 0;
      const beat2X = isMobile ? 0 : -220;
      const beat3X = isMobile ? 0 : 200;

      gsap.set(shoeEl, {
        x: beat1X,
        y: beat1Y,
        scale: isMobile ? 0.95 : hasEdgeArt ? 1 : 1.08,
        rotationZ: isMobile ? 0 : 3,
        transformPerspective: 1200,
      });

      gsap.set(beat1Ref.current, { opacity: 1, y: 0 });
      gsap.set(beat2Ref.current, { opacity: 0, y: 40 });
      gsap.set(beat3Ref.current, { opacity: 0, y: 40 });
      gsap.set(beat4Ref.current, { opacity: 0, y: 40 });

      // Master Timeline with ScrollTrigger Pinned Scrub
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: '+=1800',
          scrub: 1,
          pin: true,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      // --- BEAT 1 (Hero Profile 45deg) ---
      tl.addLabel('beat1', 0)
        .to(
          beat1Ref.current,
          { opacity: 0, y: -30, duration: 0.35, ease: 'power2.in' },
          'beat1+=0.15'
        )
        .to(
          indicatorRef.current,
          { opacity: 0, duration: 0.2 },
          'beat1+=0.1'
        )

        // --- BEAT 2 (Zoom In on Leather & Stitching) ---
        .to(
          shoeEl,
          {
            x: beat2X,
            y: isMobile ? 30 : -20,
            scale: isMobile ? 1.45 : 1.78,
            rotationZ: -4,
            duration: 0.8,
            ease: 'power2.inOut',
          },
          'beat1+=0.2'
        )
        .to(
          shadowEl,
          {
            scaleX: 1.4,
            opacity: 0.45,
            x: isMobile ? 0 : -80,
            duration: 0.8,
            ease: 'power2.inOut',
          },
          'beat1+=0.2'
        )
        .to(
          beat2Ref.current,
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
          'beat1+=0.55'
        )
        .addLabel('beat2')

        // --- BEAT 3 (Cloud step: crossfade to the studio angle) ---
        .to(
          beat2Ref.current,
          { opacity: 0, y: -30, duration: 0.35, ease: 'power2.in' },
          'beat2+=0.3'
        )
        .to(
          shoeEl,
          {
            x: beat3X,
            y: isMobile ? 20 : 10,
            scale: isMobile ? 1.25 : 1.45,
            rotationZ: 6,
            duration: 0.8,
            ease: 'power2.inOut',
          },
          'beat2+=0.35'
        )
        // Crossfade to studio classic angle view showing back & outsole grip
        .to(
          shoeImgRef.current,
          { opacity: 0, duration: 0.45, ease: 'power1.inOut' },
          'beat2+=0.4'
        )
        .to(
          shoeAltImgRef.current,
          { opacity: 1, duration: 0.45, ease: 'power1.inOut' },
          'beat2+=0.4'
        )
        .to(
          shadowEl,
          {
            scaleX: 1.1,
            opacity: 0.7,
            x: isMobile ? 0 : 90,
            duration: 0.8,
            ease: 'power2.inOut',
          },
          'beat2+=0.35'
        )
        .to(
          beat3Ref.current,
          { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
          'beat2+=0.65'
        )
        .addLabel('beat3')

        // --- BEAT 4 (The complete pair & KusStudio) ---
        .to(
          beat3Ref.current,
          { opacity: 0, y: -30, duration: 0.35, ease: 'power2.in' },
          'beat3+=0.3'
        )
        .to(
          shoeEl,
          {
            x: 0,
            y: isMobile ? -60 : -110,
            scale: isMobile ? 1.05 : 1.1,
            rotationZ: 0,
            duration: 0.8,
            ease: 'power2.inOut',
          },
          'beat3+=0.35'
        )
        .to(
          shadowEl,
          {
            scaleX: 1.25,
            opacity: 0.85,
            x: 0,
            duration: 0.8,
            ease: 'power2.inOut',
          },
          'beat3+=0.35'
        )
        .to(
          beat4Ref.current,
          { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' },
          'beat3+=0.7'
        )
        .addLabel('beat4');

      // A step's text types out while its card is visible, and replays when scrolling back to it
      const stepFor = (time: number) => {
        const { beat1, beat2, beat3 } = tl.labels;
        if (time >= beat3 + 0.7) return 3;
        if (time >= beat2 + 0.65 && time < beat3 + 0.3) return 2;
        if (time >= beat1 + 0.55 && time < beat2 + 0.3) return 1;
        return 0;
      };
      tl.eventCallback('onUpdate', () => setActiveStep(stepFor(tl.time())));

      const refreshTimer = setTimeout(() => {
        ScrollTrigger.refresh();
      }, 100);

      return () => {
        clearTimeout(refreshTimer);
        if (handleMouseMove) {
          window.removeEventListener('mousemove', handleMouseMove);
        }
      };
    },
    { scope: containerRef }
  );

  const handleSelectColorway = (cw: (typeof COLORWAYS)[number]) => {
    setActiveColorway(cw.id);
    setSelectedImg(cw.img);
  };

  return (
    <section ref={containerRef} className={styles.storySection}>
      {/* Decorative line art on the viewport edges — the hero is the one place it carries the
          orange accent (docs/DESIGN.md 6.4). Hidden <= 1100px by EdgeArt itself. */}
      <EdgeArt variant="hero" />

      <div ref={viewportRef} className={styles.stickyViewport}>

        {/* 3D Perspective Stage */}
        <div ref={stageRef} className={styles.stage3D}>
          <div ref={shoeWrapperRef} className={styles.shoeTransformWrapper}>
            {/* Flat ground ring under the shoe */}
            <div ref={floorShadowRef} className={styles.floorShadow} aria-hidden="true" />

            {/* Primary sneaker image (beats 1–2) */}
            <img
              ref={shoeImgRef}
              src={heroSneakerNoBg}
              alt={t('hero.imageAlt')}
              className={styles.shoeImageLayer}
              loading="eager"
              fetchPriority="high"
              width={900}
              height={900}
              draggable={false}
            />

            {/* Alternate angle (beats 3–4, swaps to the selected colorway) */}
            <img
              ref={shoeAltImgRef}
              src={selectedImg || heroSneakerAltNoBg}
              alt=""
              aria-hidden="true"
              className={styles.shoeAltImageLayer}
              loading="eager"
              fetchPriority="low"
              width={900}
              height={900}
              draggable={false}
            />
          </div>
        </div>

        {/* Copy synced with the GSAP ScrollTrigger beats */}
        <div className={styles.storyOverlays}>
          {/* Beat 1: pitch */}
          <div ref={beat1Ref} className={styles.beat1Hero}>
            <p className={styles.eyebrow}>{t('hero.eyebrow')}</p>
            <h1 className={styles.heroTitle}>{t('hero.title')}</h1>
            <p className={styles.heroSubtitle}>{t('hero.subtitle')}</p>
            <div className={styles.heroActions}>
              <button type="button" className="btn-neon-orange" onClick={() => navigate('/login')}>
                {t('hero.launchApp')} <ArrowRight size={16} />
              </button>
              <button type="button" className="btn-outline" onClick={onExploreProducts}>
                {t('hero.exploreProducts')}
              </button>
            </div>
          </div>

          {/* Beat 2: scan */}
          <div ref={beat2Ref} className={styles.beat2Card}>
            <div className={styles.card}>
              <div className={styles.stepHead}>
                <img className={styles.appLogo} src={mobileAppIcon} alt="KusShoes Mobile" />
                <p className={`${styles.eyebrow} ${styles.stepEyebrow}`}>
                  {t('workflow.stepLabel', { number: 1 })}
                </p>
              </div>
              <h2 className={styles.cardTitle}>
                <TypingText text={t('workflow.step1.title')} active={activeStep === 1} />
              </h2>
              <p className={styles.cardDesc}>
                <TypingText
                  text={t('workflow.step1.description')}
                  active={activeStep === 1}
                  delay={t('workflow.step1.title').length * 28 + 150}
                  speed={16}
                />
              </p>
              <p className={styles.cardMeta}>
                <Smartphone size={14} aria-hidden="true" className={styles.metaIcon} />
                {t('workflow.step1.metaText')}
              </p>
            </div>
          </div>

          {/* Beat 3: cloud */}
          <div ref={beat3Ref} className={styles.beat3Card}>
            <div className={styles.card}>
              <div className={styles.stepHead}>
                <p className={`${styles.eyebrow} ${styles.stepEyebrow}`}>
                  {t('workflow.stepLabel', { number: 2 })}
                </p>
              </div>
              <h2 className={styles.cardTitle}>
                <TypingText text={t('workflow.step2.title')} active={activeStep === 2} />
              </h2>
              <p className={styles.cardDesc}>
                <TypingText
                  text={t('workflow.step2.description')}
                  active={activeStep === 2}
                  delay={t('workflow.step2.title').length * 28 + 150}
                  speed={16}
                />
              </p>
              <p className={styles.cardMeta}>
                <Cloud size={14} aria-hidden="true" className={styles.metaIcon} />
                {t('workflow.step2.metaText')}
              </p>
            </div>
          </div>

          {/* Beat 4: KusStudio + colorways */}
          <div ref={beat4Ref} className={styles.beat4Card}>
            <div className={styles.card}>
              <div className={styles.stepHead}>
                <p className={`${styles.eyebrow} ${styles.stepEyebrow}`}>
                  {t('workflow.stepLabel', { number: 3 })}
                </p>
              </div>
              <h2 className={styles.cardTitle}>
                <TypingText text={t('workflow.step3.title')} active={activeStep === 3} />
              </h2>
              <p className={styles.cardDesc}>
                <TypingText
                  text={t('workflow.step3.description')}
                  active={activeStep === 3}
                  delay={t('workflow.step3.title').length * 28 + 150}
                  speed={16}
                />
              </p>

              <div className={styles.swatchRow}>
                <span className={styles.swatchLabel}>{t('workflow.colorway')}</span>
                {COLORWAYS.map((cw) => (
                  <button
                    key={cw.id}
                    type="button"
                    title={cw.name}
                    aria-label={t('hero.colorwayAria', { name: cw.name })}
                    aria-pressed={activeColorway === cw.id}
                    className={`${styles.swatchBtn} ${activeColorway === cw.id ? styles.swatchBtnActive : ''}`}
                    style={{ background: cw.color }}
                    onClick={() => handleSelectColorway(cw)}
                  />
                ))}
              </div>

              <div className={styles.beat4Actions}>
                <button type="button" className="btn-neon-orange" onClick={() => navigate('/login')}>
                  {t('workflow.startFreeScan')} <ArrowRight size={16} />
                </button>
                <button type="button" className="btn-outline" onClick={onExploreProducts}>
                  {t('hero.exploreProducts')}
                </button>
              </div>
              <p className={styles.cardMeta}>
                <Monitor size={14} aria-hidden="true" className={styles.metaIcon} />
                {t('workflow.step3.metaText')}
              </p>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div ref={indicatorRef} className={styles.scrollIndicator} aria-hidden="true">
          <span className={styles.scrollLabel}>{t('hero.scrollHint')}</span>
          <div className={styles.scrollBar}>
            <div className={styles.scrollThumb} />
          </div>
        </div>

        {/* Pointer tilt hint (desktop only) */}
        <div className={styles.tiltHint} aria-hidden="true">
          <Move3d size={14} />
          <span>{t('hero.tiltHint')}</span>
        </div>
      </div>
    </section>
  );
};

import React, { useRef, useState } from 'react';
import { ArrowRight, Sparkles, Layers, ShieldCheck, Compass, Move3d, Palette } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import heroSneakerNoBg from '../../assets/hero-sneaker-nobg.png';
import heroSneakerAltNoBg from '../../assets/hero-sneaker-alt-nobg.png';
import classicOrangeNoBg from '../../assets/classic-orange-nobg.png';
import streetGraffitiNoBg from '../../assets/street-graffiti-nobg.png';
import neonAlleyNoBg from '../../assets/neon-alley-nobg.png';
import webCrimsonNoBg from '../../assets/web-crimson-nobg.png';
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
  const pin1Ref = useRef<HTMLDivElement>(null);
  const pin2Ref = useRef<HTMLDivElement>(null);
  const pin3Ref = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

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
      const beat1X = isMobile ? 0 : 180;
      const beat1Y = isMobile ? -30 : 0;
      const beat2X = isMobile ? 0 : -220;
      const beat3X = isMobile ? 0 : 200;

      gsap.set(shoeEl, {
        x: beat1X,
        y: beat1Y,
        scale: isMobile ? 0.95 : 1.08,
        rotationZ: isMobile ? 0 : 3,
        transformPerspective: 1200,
      });

      gsap.set(beat1Ref.current, { opacity: 1, y: 0 });
      gsap.set(beat2Ref.current, { opacity: 0, y: 40 });
      gsap.set(beat3Ref.current, { opacity: 0, y: 40 });
      gsap.set(beat4Ref.current, { opacity: 0, y: 40 });

      // Hotspots initial state
      gsap.set([pin1Ref.current, pin2Ref.current, pin3Ref.current], {
        opacity: 0,
        scale: 0.6,
      });

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
        // Stagger in leather callout pins
        .to(
          [pin1Ref.current, pin2Ref.current],
          { opacity: 1, scale: 1, stagger: 0.15, duration: 0.4, ease: 'back.out(1.7)' },
          'beat1+=0.6'
        )
        .addLabel('beat2')

        // --- BEAT 3 (Traction & Outsole Profile Transition) ---
        .to(
          [pin1Ref.current, pin2Ref.current],
          { opacity: 0, scale: 0.5, duration: 0.25 },
          'beat2+=0.25'
        )
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
        .to(
          pin3Ref.current,
          { opacity: 1, scale: 1, duration: 0.4, ease: 'back.out(1.7)' },
          'beat2+=0.7'
        )
        .addLabel('beat3')

        // --- BEAT 4 (The Complete Pair & Customizer Studio) ---
        .to(
          pin3Ref.current,
          { opacity: 0, scale: 0.5, duration: 0.25 },
          'beat3+=0.25'
        )
        .to(
          beat3Ref.current,
          { opacity: 0, y: -30, duration: 0.35, ease: 'power2.in' },
          'beat3+=0.3'
        )
        .to(
          shoeEl,
          {
            x: 0,
            y: isMobile ? -60 : -45,
            scale: isMobile ? 1.05 : 1.2,
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
      <div ref={viewportRef} className={styles.stickyViewport}>
        <div className={styles.gridOverlay} />

        {/* 3D Perspective Stage */}
        <div ref={stageRef} className={styles.stage3D}>
          <div ref={shoeWrapperRef} className={styles.shoeTransformWrapper}>
            {/* Ambient Ground Shadow */}
            <div ref={floorShadowRef} className={styles.floorShadow} />

            {/* Primary Sneaker Image (Beat 1 & 2: heroSneakerNoBg) */}
            <img
              ref={shoeImgRef}
              src={heroSneakerNoBg}
              alt="KusShoes Sneaker Craftsmanship"
              className={styles.shoeImageLayer}
              loading="eager"
            />

            {/* Alternate Sneaker Image (Beat 3 & 4: heroSneakerAltNoBg or selected colorway) */}
            <img
              ref={shoeAltImgRef}
              src={selectedImg || heroSneakerAltNoBg}
              alt="KusShoes Studio Sneaker Angle"
              className={styles.shoeAltImageLayer}
              loading="eager"
            />

            {/* 3D Hotspot Annotations */}
            <div className={styles.hotspotLayer}>
              {/* Pin 1: Toe Vamp */}
              <div
                ref={pin1Ref}
                className={styles.hotspotPin}
                style={{ top: '65%', left: '26%' }}
              >
                <div className={styles.pinBeacon}>
                  <span className={styles.pinWave} />
                  <span className={styles.pinCore} />
                </div>
                <div className={styles.pinLabelCard}>
                  <span className={styles.pinLabelTitle}>01 // FULL-GRAIN LEATHER</span>
                  <span className={styles.pinLabelDesc}>Mũi da đục lỗ thoáng khí gia công tỉ mỉ</span>
                </div>
              </div>

              {/* Pin 2: KusShoes K-Emblem */}
              <div
                ref={pin2Ref}
                className={styles.hotspotPin}
                style={{ top: '35%', left: '46%' }}
              >
                <div className={styles.pinBeacon}>
                  <span className={styles.pinWave} />
                  <span className={styles.pinCore} />
                </div>
                <div className={styles.pinLabelCard}>
                  <span className={styles.pinLabelTitle}>02 // EMBOSSED K-EMBLEM</span>
                  <span className={styles.pinLabelDesc}>Logo chữ K ép nhiệt viền cam phản quang</span>
                </div>
              </div>

              {/* Pin 3: Grip-Tech Outsole */}
              <div
                ref={pin3Ref}
                className={styles.hotspotPin}
                style={{ top: '75%', right: '28%' }}
              >
                <div className={styles.pinBeacon}>
                  <span className={styles.pinWave} />
                  <span className={styles.pinCore} />
                </div>
                <div className={styles.pinLabelCard}>
                  <span className={styles.pinLabelTitle}>03 // DUAL-DENSITY OUTSOLE</span>
                  <span className={styles.pinLabelDesc}>Đế cao su lưu hóa đa hướng chống trượt</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Narrative Overlays synced with GSAP ScrollTrigger beats */}
        <div className={styles.storyOverlays}>
          {/* Beat 1: Hero Main Pitch */}
          <div ref={beat1Ref} className={styles.beat1Hero}>
            <span className={styles.badge}>
              <Sparkles size={14} />
              Văn Hóa Giày Streetwear Đỉnh Cao
            </span>
            <h1 className={styles.heroTitle}>
              Cảm Nhận <span className={styles.titleGradient}>Chất Giày</span> Chuẩn Từng Đường Nét.
            </h1>
            <p className={styles.heroSubtitle}>
              Khám phá cấu tạo sneaker thực thụ từ lớp da thuộc tuyển chọn,
              đường may kép gia cố đến rãnh đế cao su công nghệ cao sẵn sàng cho mọi bản phối cá nhân.
            </p>
            <div className={styles.heroActions}>
              <button
                type="button"
                className="btn-neon-orange"
                onClick={() => navigate('/login')}
                style={{ padding: '16px 36px', fontSize: '1.05rem' }}
              >
                Khởi chạy KusStudio <ArrowRight size={18} style={{ marginLeft: 6 }} />
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={onExploreProducts}
                style={{ padding: '16px 32px', fontSize: '1.05rem' }}
              >
                Khám phá sản phẩm
              </button>
            </div>
          </div>

          {/* Beat 2: Craftsmanship & Upper Leather */}
          <div ref={beat2Ref} className={styles.beat2Card}>
            <div className={styles.hudCard}>
              <div className={styles.hudHeader}>
                <span className={styles.hudIndex}>01 // CRAFTSMANSHIP & LEATHER</span>
                <span className={styles.hudLiveDot} />
              </div>
              <h2 className={styles.hudTitle}>Da Thuộc Tuyển Chọn</h2>
              <p className={styles.hudDesc}>
                Bề mặt da mềm mại tự nhiên với lỗ đục thoáng khí và đường chỉ may kép gia cường.
                Độ hoàn thiện tinh xảo giúp giữ form dáng hoàn hảo qua thời gian sử dụng.
              </p>
              <div className={styles.hudTagRow}>
                <span className={styles.hudTag}>
                  <Layers size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
                  Full-Grain Leather
                </span>
                <span className={styles.hudTag}>
                  <ShieldCheck size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
                  Reinforced Stitching
                </span>
              </div>
            </div>
          </div>

          {/* Beat 3: Traction & Outsole Geometry */}
          <div ref={beat3Ref} className={styles.beat3Card}>
            <div className={styles.hudCard}>
              <div className={styles.hudHeader}>
                <span className={styles.hudIndex}>02 // TRACTION & SOLE GEOMETRY</span>
                <span className={styles.hudLiveDot} />
              </div>
              <h2 className={styles.hudTitle}>Đế Cao Su Đa Hướng</h2>
              <p className={styles.hudDesc}>
                Rãnh gai bám đường được thiết kế đa khối giúp tăng cường ma sát tối đa.
                Lớp đệm gót hấp thụ xung lực mang đến bước đi vững vàng và êm ái trên từng góc phố.
              </p>
              <div className={styles.hudTagRow}>
                <span className={styles.hudTag}>
                  <Compass size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
                  Grip-Tech Sole
                </span>
                <span className={styles.hudTag}>Impact Cushioning</span>
              </div>
            </div>
          </div>

          {/* Beat 4: Colorway Showcase & Studio CTA */}
          <div ref={beat4Ref} className={styles.beat4Card}>
            <div className={styles.hudCard} style={{ borderLeft: 'none', borderTop: '3px solid var(--color-orange)' }}>
              <span className={styles.badge} style={{ marginBottom: 12 }}>
                <Palette size={14} />
                Bản Phối Sẵn Sàng Sáng Tạo
              </span>
              <h2 className={styles.beat4Title}>
                Tự Tay Tạo Nên <span className={styles.titleGradient}>Dấu Ấn Của Riêng Bạn</span>
              </h2>
              <p className={styles.beat4Desc}>
                Chọn phối màu thử nghiệm hoặc truy cập KusStudio để tùy biến từng mảng màu,
                chất liệu da và tag cá nhân hóa.
              </p>

              {/* Interactive Colorway Switcher */}
              <div className={styles.swatchRow}>
                <span className={styles.swatchLabel}>Colorways:</span>
                {COLORWAYS.map((cw) => (
                  <button
                    key={cw.id}
                    type="button"
                    title={cw.name}
                    className={`${styles.swatchBtn} ${activeColorway === cw.id ? styles.swatchBtnActive : ''}`}
                    style={{ background: cw.color }}
                    onClick={() => handleSelectColorway(cw)}
                  />
                ))}
              </div>

              <div className={styles.beat4Actions}>
                <button
                  type="button"
                  className="btn-neon-orange"
                  onClick={() => navigate('/login')}
                  style={{ padding: '16px 40px', fontSize: '1.1rem' }}
                >
                  Bắt Đầu Custom Trong 3D Studio <ArrowRight size={18} style={{ marginLeft: 6 }} />
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={onExploreProducts}
                  style={{ padding: '16px 32px' }}
                >
                  Xem thêm sản phẩm
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll down indicator */}
        <div ref={indicatorRef} className={styles.scrollIndicator}>
          <span className={styles.scrollLabel}>Cuộn để khám phá</span>
          <div className={styles.scrollBar}>
            <div className={styles.scrollThumb} />
          </div>
        </div>

        {/* Mouse 3D Tilt Tip */}
        <div className={styles.tiltHint}>
          <Move3d size={14} />
          <span>Rê chuột để cảm nhận 3D Depth</span>
        </div>
      </div>
    </section>
  );
};

import { Play, Sparkles } from "lucide-react";
import sneakerHero from "@/assets/sneaker-hero.png";
import { useMouseParallax } from "@/hooks/use-mouse-parallax";
import { FloatingGeometry } from "./FloatingGeometry";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion } from "framer-motion";

export function Hero({ onOpenStudio }: { onOpenStudio?: () => void }) {
  const { t } = useLanguage();
  const { ref, pos } = useMouseParallax<HTMLDivElement>();

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-screen overflow-hidden pt-32 pb-20"
    >
      <FloatingGeometry />

      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center">
        {/* Copy */}
        <div className="relative z-10">
          <motion.span 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.1 }}
            className="inline-flex items-center gap-2 rounded-none border-2 border-primary bg-primary/10 px-3 py-1 text-xs font-bold font-mono text-primary uppercase"
          >
            <Sparkles className="h-3.5 w-3.5" /> {t.hero.badge}
          </motion.span>
          <motion.h1 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.2, duration: 0.8, delay: 0.2 }}
            className="mt-6 text-6xl md:text-7xl lg:text-8xl font-heading tracking-tight leading-[1.1]"
          >
            {t.hero.titleLine1}
            <br />
            <span className="text-primary text-glow">
              {t.hero.titleLine2}
            </span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="mt-6 max-w-xl text-lg text-muted-foreground font-medium"
          >
            {t.hero.desc}
          </motion.p>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0.4, delay: 0.5 }}
            className="mt-10 flex flex-wrap gap-4"
          >
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-2 rounded-none border-2 border-primary bg-primary px-8 py-4 text-sm font-bold uppercase text-primary-foreground glow-orange-lg hover:scale-105 transition-transform"
            >
              {t.hero.freeTrial}
            </button>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-none border-2 border-foreground px-8 py-4 text-sm font-bold uppercase text-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              <Play className="h-4 w-4" /> {t.hero.watchDemo}
            </a>
          </motion.div>

          <motion.dl 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.6 }}
            className="mt-12 grid grid-cols-2 gap-6 max-w-sm font-mono border-t-2 border-border pt-6"
          >
            {[
              { k: "115+", v: t.hero.stats.users },
              { k: "65%", v: t.hero.stats.pay },
            ].map((s) => (
              <div key={s.v}>
                <dt className="text-3xl font-bold text-foreground">{s.k}</dt>
                <dd className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{s.v}</dd>
              </div>
            ))}
          </motion.dl>
        </div>

        {/* 3D sneaker stage */}
        <div className="relative h-[520px] lg:h-[640px]" style={{ perspective: "1200px" }}>
          {/* Rotating studio ring */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-[420px] w-[420px] lg:h-[520px] lg:w-[520px]">
              <div className="absolute inset-0 bg-radial-orange rounded-full opacity-40 blur-3xl" />
              <div
                className="absolute inset-0 rounded-full border border-primary/30 animate-spin-ring"
                style={{ transformStyle: "preserve-3d" }}
              />
              <div
                className="absolute inset-8 rounded-full border border-primary/25 animate-spin-ring"
                style={{
                  transformStyle: "preserve-3d",
                  animationDirection: "reverse",
                  animationDuration: "26s",
                }}
              />
              <div
                className="absolute inset-16 rounded-full border border-primary/15"
                style={{ transform: "rotateX(75deg)" }}
              />
            </div>
          </div>

          {/* Sneaker */}
          <div
            className="absolute inset-0 grid place-items-center transition-transform duration-300 ease-out"
            style={{
              transform: `rotateY(${pos.x * 18}deg) rotateX(${pos.y * -10}deg) translateZ(0)`,
              transformStyle: "preserve-3d",
            }}
          >
            <img
              src={sneakerHero}
              alt="Mô hình 3D giày trắng KusShoes đang xoay trên sân khấu cam phát sáng"
              width={1024}
              height={1024}
              className="relative z-10 w-[88%] max-w-[560px] drop-shadow-[0_30px_60px_rgba(255,90,30,0.35)]"
            />
          </div>

          {/* Floating labels */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", bounce: 0.5, delay: 0.8 }}
            className="hidden sm:block absolute top-16 left-2 z-20 border-2 border-foreground bg-background px-3 py-2 text-xs font-mono animate-float-slow shadow-[4px_4px_0_oklch(0.15_0_0)]"
          >
            <div className="text-primary font-bold uppercase">● {t.hero.tags.material}</div>
            <div className="text-foreground">{t.hero.tags.materialDesc}</div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: "spring", bounce: 0.5, delay: 1 }}
            className="hidden sm:block absolute bottom-20 right-0 z-20 border-2 border-foreground bg-background px-3 py-2 text-xs font-mono animate-float-slow shadow-[4px_4px_0_oklch(0.15_0_0)]"
          >
            <div className="text-primary font-medium">● {t.hero.tags.export}</div>
            <div className="text-muted-foreground">{t.hero.tags.exportDesc}</div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

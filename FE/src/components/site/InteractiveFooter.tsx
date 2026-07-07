import { useState } from "react";
import { ArrowRight } from "lucide-react";
import sneakerFooter from "@/assets/sneaker-footer.png";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion } from "framer-motion";

type Swatch = { name: string; color: string; filter: string };

const swatches: Swatch[] = [
  { name: "Pure", color: "#FFFFFF", filter: "none" },
  { name: "Ember", color: "#FF5A1F", filter: "sepia(1) saturate(6) hue-rotate(-15deg) brightness(0.95)" },
  { name: "Noir", color: "#0A0A0A", filter: "brightness(0.35) contrast(1.2)" },
  { name: "Dusk", color: "#A0522D", filter: "sepia(0.6) saturate(2) hue-rotate(-10deg) brightness(0.85)" },
  { name: "Pulse", color: "#FFB347", filter: "sepia(0.8) saturate(4) hue-rotate(-20deg) brightness(1.05)" },
];

export function InteractiveFooter({ onOpenStudio }: { onOpenStudio?: () => void }) {
  const { t } = useLanguage();
  const [active, setActive] = useState(0);

  return (
    <section id="studio" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 50 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ type: "spring", bounce: 0.3, duration: 0.8 }}
          className="relative overflow-hidden border-4 border-foreground bg-card p-10 lg:p-16 shadow-[16px_16px_0_oklch(0.15_0_0)]"
        >
          <div className="absolute inset-0 tech-grid opacity-30" />
          <div className="absolute -top-32 -right-32 h-96 w-96 bg-primary/20 blur-3xl" />

          <div className="relative grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
                {t.interactiveFooter.tag}
              </span>
              <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
                {t.interactiveFooter.titleLine1}
                <br />
                <span className="text-primary">{t.interactiveFooter.titleLine2}</span>
              </h2>
              <p className="mt-6 max-w-md text-foreground font-medium">
                {t.interactiveFooter.desc}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {swatches.map((s, i) => (
                  <button
                    key={s.name}
                    onClick={() => setActive(i)}
                    className={`group flex items-center gap-2 border-2 px-4 py-2 text-xs font-bold uppercase transition-all ${
                      active === i
                        ? "border-foreground bg-primary text-primary-foreground shadow-[4px_4px_0_oklch(0.15_0_0)] translate-x-[-2px] translate-y-[-2px]"
                        : "border-foreground bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    <span
                      className="h-4 w-4 border-2 border-foreground"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </button>
                ))}
              </div>

              <div className="mt-12 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={onOpenStudio}
                  className="inline-flex items-center gap-2 border-2 border-foreground bg-primary px-8 py-4 text-base font-bold uppercase text-primary-foreground shadow-[8px_8px_0_oklch(0.15_0_0)] hover:translate-x-1 hover:translate-y-1 transition-transform w-fit"
                >
                  {t.interactiveFooter.cta}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <span className="text-xs font-mono text-muted-foreground">
                  {t.interactiveFooter.note}
                </span>
              </div>
            </div>

            {/* Mini studio */}
            <div
              className="relative h-[420px] border-2 border-foreground bg-background/60 overflow-hidden shadow-[8px_8px_0_oklch(0.15_0_0)]"
              style={{ perspective: "1200px" }}
            >
              <div className="absolute inset-0 bg-radial-orange opacity-70" />
              <div className="absolute inset-0 grid place-items-center">
                <div
                  className="h-40 w-40 border-2 border-primary/30 animate-spin-ring"
                  style={{ transformStyle: "preserve-3d" }}
                />
              </div>
              <div className="absolute inset-0 grid place-items-center">
                <img
                  src={sneakerFooter}
                  alt={`Sneaker mini-studio — color ${swatches[active].name}`}
                  width={1024}
                  height={1024}
                  loading="lazy"
                  className="w-[78%] max-w-[360px] transition-all duration-500 drop-shadow-[15px_15px_0_rgba(255,90,30,0.25)]"
                  style={{ filter: swatches[active].filter }}
                />
              </div>
              <div className="absolute bottom-4 left-4 border-2 border-foreground bg-background/70 backdrop-blur px-3 py-1.5 text-[10px] font-mono font-bold uppercase text-foreground shadow-[4px_4px_0_oklch(0.15_0_0)]">
                {t.interactiveFooter.colorLabel} · <span className="text-primary">{swatches[active].name.toLowerCase()}</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

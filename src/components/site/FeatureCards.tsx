import { Globe, Sparkles, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";

type Card = {
  tag: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  visual: React.ReactNode;
};

import { useLanguage } from "@/i18n/LanguageContext";

export function FeatureCards() {
  const { t } = useLanguage();

  const cards: Card[] = [
    {
      tag: t.features.card1Tag,
      title: t.features.card1Title,
      desc: t.features.card1Desc,
      icon: RotateCcw,
      visual: (
        <div className="relative h-full w-full overflow-hidden border-2 border-foreground bg-background group-hover:border-primary transition-colors">
          <div className="absolute inset-0 tech-grid opacity-30" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-20 h-20 group-hover:scale-110 transition-transform duration-500">
              {/* Pseudo isometric cube effect */}
              <div className="absolute w-full h-full border-2 border-foreground bg-primary/10 transform rotate-45 translate-y-3 translate-x-3" />
              <div className="absolute w-full h-full border-2 border-foreground bg-primary/30 transform rotate-45 translate-y-1.5 translate-x-1.5" />
              <div className="absolute w-full h-full border-2 border-foreground bg-primary transform rotate-45 flex items-center justify-center shadow-[4px_4px_0_oklch(0.15_0_0)]">
                <span className="text-primary-foreground font-heading font-black text-2xl -rotate-45">3D</span>
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 inset-x-0 border-t-2 border-foreground bg-card/90 px-3 py-2 flex justify-between items-center">
            <span className="font-mono text-[10px] text-foreground font-bold">RENDER</span>
            <div className="flex items-center gap-1.5">
               <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
               <span className="font-mono text-[10px] font-bold text-primary">60 FPS</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      tag: t.features.card2Tag,
      title: t.features.card2Title,
      desc: t.features.card2Desc,
      icon: Sparkles,
      visual: (
        <div className="relative h-full w-full overflow-hidden border-2 border-foreground bg-background flex group-hover:border-primary transition-colors">
          {/* Before / After split */}
          <div className="w-1/2 h-full bg-foreground/5 bg-[radial-gradient(#111_1px,transparent_1px)] [background-size:8px_8px] relative">
            <div className="absolute top-2 left-2 bg-background border-2 border-foreground px-2 py-0.5 text-[9px] font-mono font-bold shadow-[2px_2px_0_oklch(0.15_0_0)]">RAW</div>
          </div>
          <div className="w-1/2 h-full bg-background relative overflow-hidden border-l-2 border-dashed border-foreground/30">
            <div className="absolute inset-0 orange-grid opacity-30" />
            <div className="absolute bottom-2 right-2 bg-primary border-2 border-foreground px-2 py-0.5 text-[9px] font-mono font-bold text-primary-foreground shadow-[2px_2px_0_oklch(0.15_0_0)]">CLEAN</div>
          </div>
          
          {/* Magic wand icon */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 bg-background border-2 border-foreground flex items-center justify-center rotate-12 group-hover:rotate-0 group-hover:scale-110 transition-transform duration-300 shadow-[4px_4px_0_oklch(0.15_0_0)]">
             <Sparkles className="h-6 w-6 text-primary animate-pulse" />
          </div>
        </div>
      ),
    },
    {
      tag: t.features.card3Tag,
      title: t.features.card3Title,
      desc: t.features.card3Desc,
      icon: Globe,
      visual: (
        <div className="relative h-full w-full overflow-hidden border-2 border-foreground bg-primary/10 p-3 flex flex-col group-hover:bg-primary/20 transition-colors">
          {/* Browser header mock */}
          <div className="border-2 border-foreground bg-background flex items-center px-2 py-1.5 gap-1.5 mb-3 shadow-[2px_2px_0_oklch(0.15_0_0)] relative z-10">
             <div className="w-2.5 h-2.5 border border-foreground bg-muted" />
             <div className="w-2.5 h-2.5 border border-foreground bg-muted" />
             <div className="w-2.5 h-2.5 border border-foreground bg-primary" />
             <div className="ml-2 bg-muted/10 border border-foreground px-2 py-0.5 text-[9px] font-mono flex-1 text-center truncate">kus.studio/run</div>
          </div>
          
          {/* Browser content */}
          <div className="flex-1 border-2 border-foreground bg-background relative overflow-hidden flex flex-col items-center justify-center shadow-[4px_4px_0_oklch(0.15_0_0)] group-hover:-translate-y-1 transition-transform duration-300">
            <div className="absolute inset-0 tech-grid opacity-20" />
            <div className="relative z-10 text-center px-2">
              <div className="font-heading font-black text-2xl text-foreground uppercase tracking-wider">
                Ready
              </div>
              <div className="font-mono text-[9px] font-bold text-primary mt-1 bg-primary/10 px-2 py-0.5 border border-primary/20">
                NO INSTALL REQUIRED
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <section id="features" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            {t.features.tag}
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            {t.features.titleLine1}
            <br />
            <span className="text-primary">{t.features.titleLine2}</span>
          </h2>
        </motion.div>

        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            visible: { transition: { staggerChildren: 0.15 } },
          }}
          className="mt-16 grid md:grid-cols-3 gap-6"
        >
          {cards.map((c) => (
            <FeatureCard key={c.title} card={c} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function FeatureCard({ card }: { card: Card }) {
  const [hovered, setHovered] = useState(false);
  
  const variants = {
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, bounce: 0.4 } },
  };

  return (
    <motion.article
      variants={variants}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`group relative border-2 border-foreground bg-card p-6 transition-all duration-300 ${
        hovered ? "shadow-[8px_8px_0_oklch(0.15_0_0)] -translate-y-1" : "shadow-[4px_4px_0_oklch(0.15_0_0)]"
      }`}
      style={{
        transform: hovered ? "translateY(-4px) translateX(-4px)" : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold text-foreground uppercase">{card.tag}</span>
        <div className="flex h-9 w-9 items-center justify-center border-2 border-foreground bg-primary/10 text-primary">
          <card.icon className="h-4 w-4" />
        </div>
      </div>

      <div className="mt-5 h-44 w-full">{card.visual}</div>

      <h3 className="mt-6 text-2xl font-bold uppercase tracking-tight">{card.title}</h3>
      <p className="mt-2 text-sm text-foreground/80 font-medium">{card.desc}</p>
    </motion.article>
  );
}

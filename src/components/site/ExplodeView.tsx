import { Layers, MousePointerClick, Send } from "lucide-react";
import { motion } from "framer-motion";

import { useLanguage } from "@/i18n/LanguageContext";

export function ExplodeView() {
  const { t } = useLanguage();

  const steps = [
    {
      icon: MousePointerClick,
      stepLabel: t.explode.step1,
      title: t.explode.step1Title,
      desc: t.explode.step1Desc,
    },
    {
      icon: Layers,
      stepLabel: t.explode.step2,
      title: t.explode.step2Title,
      desc: t.explode.step2Desc,
    },
    {
      icon: Send,
      stepLabel: t.explode.step3,
      title: t.explode.step3Title,
      desc: t.explode.step3Desc,
    },
  ];
  return (
    <section className="relative py-32 overflow-visible bg-background">
      <div className="absolute inset-0 tech-grid opacity-20" />
      
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-[1fr_1.5fr] gap-16 items-start">
          
          {/* Left: Sticky Header */}
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="sticky top-32 lg:pb-32 z-10"
          >
            <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary bg-background/80 backdrop-blur-sm px-2 py-1 -ml-2">
              {t.explode.tag}
            </span>
            <h2 className="mt-6 text-5xl md:text-6xl lg:text-7xl font-heading tracking-tight leading-[0.9]">
              {t.explode.titleLine1}
              <br />
              <span className="text-primary">{t.explode.titleLine2}</span>
            </h2>
            <p className="mt-6 text-foreground/80 font-medium max-w-md text-lg leading-relaxed bg-background/80 backdrop-blur-sm">
              {t.explode.desc}
            </p>
            
            {/* Decorative brutalist element */}
            <div className="hidden lg:flex mt-12 h-32 w-32 border-2 border-foreground bg-primary/5 rounded-full items-center justify-center animate-spin-slow shadow-[4px_4px_0_oklch(0.15_0_0)]">
              <div className="h-12 w-12 border-2 border-foreground bg-primary rotate-45 flex items-center justify-center">
                <div className="h-3 w-3 bg-background rounded-full" />
              </div>
            </div>
          </motion.div>

          {/* Right: Scrolling Stacked Cards */}
          <div className="flex flex-col gap-8 pb-32">
            {steps.map((s, i) => (
              <motion.div
                key={s.title}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ type: "spring", bounce: 0.4, delay: i * 0.1 }}
                className="group sticky border-2 border-foreground bg-card p-8 md:p-12 shadow-[8px_8px_0_oklch(0.15_0_0)] transition-all duration-500 hover:shadow-[12px_12px_0_oklch(0.65_0.25_35)]"
                style={{ top: `calc(8rem + ${i * 1.5}rem)` }}
              >
                {/* Background Number */}
                <div className="absolute top-4 right-6 text-8xl md:text-9xl font-heading font-black text-foreground/[0.03] select-none transition-colors duration-500 group-hover:text-primary/10 pointer-events-none">
                  0{i + 1}
                </div>
                
                <div className="relative z-10">
                  <div className="flex h-16 w-16 items-center justify-center border-2 border-foreground bg-primary text-primary-foreground mb-8 shadow-[4px_4px_0_oklch(0.15_0_0)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:-translate-x-1 group-hover:shadow-[6px_6px_0_oklch(0.15_0_0)]">
                    <s.icon className="h-8 w-8" strokeWidth={2} />
                  </div>
                  
                  <div className="flex items-center gap-4 mb-4">
                    <span className="text-sm font-mono font-bold text-primary">{s.stepLabel}</span>
                    <div className="h-px bg-border flex-1 opacity-50" />
                  </div>
                  
                  <h3 className="font-heading font-bold uppercase text-2xl md:text-3xl mb-4 text-foreground">
                    {s.title}
                  </h3>
                  
                  <p className="text-lg text-foreground/70 leading-relaxed font-medium max-w-md">
                    {s.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}

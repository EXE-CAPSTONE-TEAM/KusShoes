import { ArrowRight, Users } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion } from "framer-motion";

export function AboutPreview() {
  const { t } = useLanguage();

  return (
    <section id="about" className="relative py-32 bg-foreground text-background overflow-hidden">
      <div className="absolute inset-0 tech-grid opacity-10" />
      <div className="absolute top-0 right-0 h-96 w-96 bg-primary/20 blur-3xl rounded-full" />
      
      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
        <motion.div
          initial={{ opacity: 0, x: -50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            {t.aboutPreview.tag}
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            {t.aboutPreview.titleLine1}
            <br />
            <span className="text-primary">{t.aboutPreview.titleLine2}</span>
          </h2>
          <p className="mt-6 max-w-lg text-background/80 font-medium text-lg leading-relaxed">
            {t.aboutPreview.desc}
          </p>

          <a
            href="/about"
            className="mt-10 inline-flex items-center gap-2 border-2 border-primary bg-primary px-8 py-4 text-sm font-bold uppercase text-primary-foreground hover:bg-transparent hover:text-primary transition-colors shadow-[4px_4px_0_oklch(0.15_0_0)]"
          >
            {t.aboutPreview.cta} <ArrowRight className="h-4 w-4" />
          </a>
        </motion.div>

        {/* Abstract Team Visual */}
        <motion.div 
          initial={{ opacity: 0, x: 50 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="relative h-[400px] border-2 border-primary bg-background overflow-hidden shadow-[8px_8px_0_oklch(0.72_0.22_45)] flex items-center justify-center group"
        >
          <div className="absolute inset-0 orange-grid opacity-20" />
          
          <div className="relative z-10 flex flex-col items-center gap-6 group-hover:scale-110 transition-transform duration-700">
             <div className="h-24 w-24 border-2 border-foreground bg-primary flex items-center justify-center rotate-12 shadow-[4px_4px_0_oklch(0.15_0_0)]">
                <Users className="h-10 w-10 text-primary-foreground" />
             </div>
             <div className="font-heading text-4xl font-black text-foreground uppercase tracking-widest bg-primary/10 px-4 py-1 border-2 border-foreground">
                Vietstride
             </div>
          </div>
          
          {/* Decorative floating elements */}
          <div className="absolute top-10 left-10 w-8 h-8 border-2 border-foreground bg-muted animate-spin-slow" />
          <div className="absolute bottom-12 right-12 w-12 h-12 border-2 border-foreground rounded-full bg-primary/20 animate-pulse" />
        </motion.div>
      </div>
    </section>
  );
}

import { Target, Zap, Heart } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion } from "framer-motion";

export function About() {
  const { t } = useLanguage();

  const values = [
    { icon: Zap, title: t.aboutPage.value1 },
    { icon: Target, title: t.aboutPage.value2 },
    { icon: Heart, title: t.aboutPage.value3 },
  ];

  return (
    <section className="relative py-32 bg-background">
      <div className="absolute inset-0 tech-grid opacity-10" />
      
      <div className="relative mx-auto max-w-4xl px-6">
        {/* Header */}
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", bounce: 0.4 }}
          className="text-center mb-24"
        >
          <span className="inline-block bg-primary/10 border-2 border-primary text-primary px-3 py-1 font-mono text-sm font-bold tracking-widest uppercase mb-6">
            {t.aboutPage.tag}
          </span>
          <h1 className="text-6xl md:text-8xl font-heading tracking-tight leading-[0.9]">
            {t.aboutPage.titleLine1}
            <br />
            <span className="text-primary">{t.aboutPage.titleLine2}</span>
          </h1>
        </motion.div>

        {/* Content Blocks */}
        <div className="space-y-24">
          
          {/* Mission */}
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ type: "spring", bounce: 0.4 }}
            className="border-2 border-foreground bg-card p-10 md:p-16 shadow-[12px_12px_0_oklch(0.15_0_0)] relative"
          >
            <div className="absolute -top-6 -left-6 h-12 w-12 border-2 border-foreground bg-primary" />
            <h2 className="text-3xl md:text-4xl font-heading font-bold uppercase mb-6">
              {t.aboutPage.missionTitle}
            </h2>
            <p className="text-xl md:text-2xl text-foreground/80 leading-relaxed font-medium">
              {t.aboutPage.missionDesc}
            </p>
          </motion.div>



          {/* Core Values */}
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ type: "spring", bounce: 0.4 }}
          >
            <h2 className="text-3xl md:text-4xl font-heading font-bold uppercase mb-10 text-center">
              {t.aboutPage.valuesTitle}
            </h2>
            <div className="grid sm:grid-cols-3 gap-6">
              {values.map((v, i) => (
                <div key={i} className="border-2 border-foreground bg-card p-6 flex flex-col items-center text-center shadow-[6px_6px_0_oklch(0.15_0_0)] hover:-translate-y-1 transition-transform">
                  <div className="h-16 w-16 border-2 border-foreground bg-primary flex items-center justify-center mb-6 shadow-[3px_3px_0_oklch(0.15_0_0)]">
                    <v.icon className="h-8 w-8 text-primary-foreground" />
                  </div>
                  <h3 className="font-bold text-lg leading-snug">{v.title}</h3>
                </div>
              ))}
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

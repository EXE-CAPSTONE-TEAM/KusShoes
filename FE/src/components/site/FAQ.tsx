import { useState } from "react";
import { Plus, Minus } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { motion, AnimatePresence } from "framer-motion";

export function FAQ() {
  const { t } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    { q: t.faq.q1, a: t.faq.a1 },
    { q: t.faq.q2, a: t.faq.a2 },
    { q: t.faq.q3, a: t.faq.a3 },
  ];

  return (
    <section className="relative py-32 bg-background">
      <div className="absolute inset-0 tech-grid opacity-10" />
      <div className="relative mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            {t.faq.tag}
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            {t.faq.titleLine1}
            <br />
            <span className="text-primary">{t.faq.titleLine2}</span>
          </h2>
        </motion.div>

        <div className="space-y-4">
          {faqs.map((faq, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                key={i}
                className="border-2 border-foreground bg-card"
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="w-full flex items-center justify-between p-6 text-left focus:outline-none focus:bg-muted/50 hover:bg-muted/50 transition-colors"
                >
                  <span className="text-lg md:text-xl font-bold font-heading pr-4">
                    {faq.q}
                  </span>
                  <div className="h-8 w-8 shrink-0 flex items-center justify-center border-2 border-foreground bg-primary/10 text-primary">
                    {isOpen ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                  </div>
                </button>
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="p-6 pt-0 text-foreground/80 font-medium leading-relaxed border-t-2 border-foreground/10 mt-2">
                        {faq.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

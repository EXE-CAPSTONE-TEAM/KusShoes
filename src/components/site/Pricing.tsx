import { useState } from "react";
import { Check } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import type { Dictionary } from "@/i18n/dictionaries";
import { motion } from "framer-motion";

type Plan = {
  name: string;
  badge?: string;
  priceMonthly: number;
  priceYearly: number;
  highlight: boolean;
  features: string[];
  cta: string;
  ctaHref: string;
};

const getPlans = (t: Dictionary): Plan[] => [
  {
    name: t.pricing.plans.free.name,
    priceMonthly: 0,
    priceYearly: 0,
    highlight: false,
    features: [
      t.pricing.plans.free.f1,
      t.pricing.plans.free.f2,
      t.pricing.plans.free.f3,
      t.pricing.plans.free.f4,
    ],
    cta: t.pricing.plans.free.cta,
    ctaHref: "#studio",
  },
  {
    name: t.pricing.plans.basic.name,
    badge: t.pricing.popular,
    priceMonthly: 199000,
    priceYearly: 1500000,
    highlight: true,
    features: [
      t.pricing.plans.basic.f1,
      t.pricing.plans.basic.f2,
      t.pricing.plans.basic.f3,
      t.pricing.plans.basic.f4,
    ],
    cta: t.pricing.plans.basic.cta,
    ctaHref: "#studio",
  },
  {
    name: t.pricing.plans.pro.name,
    priceMonthly: 499000,
    priceYearly: 3990000,
    highlight: false,
    features: [
      t.pricing.plans.pro.f1,
      t.pricing.plans.pro.f2,
      t.pricing.plans.pro.f3,
      t.pricing.plans.pro.f4,
    ],
    cta: t.pricing.plans.pro.cta,
    ctaHref: "#studio",
  },
];

function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
}

export function Pricing() {
  const { t } = useLanguage();
  const [yearly, setYearly] = useState(true);
  const plans = getPlans(t);

  return (
    <section id="pricing" className="relative py-32">
      <div className="absolute inset-0 tech-grid opacity-10" />
      <div className="relative mx-auto max-w-7xl px-6">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
          className="max-w-2xl"
        >
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            {t.pricing.tag}
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            {t.pricing.titleLine1}
            <br />
            <span className="text-primary">{t.pricing.titleLine2}</span>
          </h2>
        </motion.div>

        {/* Toggle */}
        <div className="mt-10 flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={`text-sm font-bold uppercase font-mono transition-colors ${
              !yearly ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.pricing.month}
          </button>
          <button
            type="button"
            onClick={() => setYearly((v) => !v)}
            className="relative h-7 w-14 border-2 border-foreground bg-background shadow-[3px_3px_0_oklch(0.15_0_0)] flex items-center px-1"
            aria-label="Toggle"
          >
            <span
              className={`h-4 w-5 bg-primary transition-transform duration-300 ${
                yearly ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={`text-sm font-bold uppercase font-mono transition-colors ${
              yearly ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.pricing.year}
          </button>
          {yearly && (
            <span className="border-2 border-primary bg-primary/10 px-2 py-0.5 text-[10px] font-bold font-mono text-primary uppercase">
              {t.pricing.save}
            </span>
          )}
        </div>

        {/* Plan cards */}
        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          variants={{
            visible: { transition: { staggerChildren: 0.15 } },
          }}
          className="mt-12 grid md:grid-cols-3 gap-6 items-start"
        >
          {plans.map((plan, i) => (
            <PricingCard key={i} plan={plan} yearly={yearly} />
          ))}
        </motion.div>

        <p className="mt-8 text-center text-xs font-mono text-muted-foreground">
          {t.pricing.needTeam}{" "}
          <a href="#contact" className="text-primary hover:underline">
            {t.pricing.teamLink}
          </a>
        </p>
      </div>
    </section>
  );
}

function PricingCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const { t } = useLanguage();
  const isFree = plan.priceMonthly === 0;
  const price = isFree
    ? t.pricing.freeLabel
    : yearly
    ? formatPrice(plan.priceYearly)
    : formatPrice(plan.priceMonthly);
  const unit = isFree ? null : yearly ? t.pricing.perYear : t.pricing.perMonth;

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 50 },
        visible: { opacity: 1, y: 0, transition: { type: "spring", bounce: 0.4 } },
      }}
      className={`relative border-2 p-8 ${
        plan.highlight
          ? "border-primary bg-card shadow-[8px_8px_0_oklch(0.72_0.22_45)] -translate-y-2"
          : "border-foreground bg-card shadow-[4px_4px_0_oklch(0.15_0_0)]"
      }`}
    >
      {plan.badge && (
        <div className="absolute -top-3.5 left-6 bg-primary px-3 py-0.5 text-[10px] font-bold font-mono text-primary-foreground uppercase shadow-[3px_3px_0_oklch(0.15_0_0)] border-2 border-foreground">
          {plan.badge}
        </div>
      )}

      <div className="text-xs font-mono font-bold text-primary uppercase tracking-wider">
        {plan.name}
      </div>

      <div className="mt-4 flex items-end gap-1 flex-wrap">
        <span className="text-4xl font-heading font-bold leading-none">{price}</span>
        {unit && (
          <span className="mb-1 text-sm text-muted-foreground font-mono">{unit}</span>
        )}
      </div>

      {!isFree && yearly && (
        <div className="mt-1 text-xs font-mono text-muted-foreground">
          {t.pricing.equivalent} {formatPrice(Math.round(plan.priceYearly / 12))} {t.pricing.perMonth}
        </div>
      )}

      <ul className="mt-8 space-y-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm">
            <span
              className={`mt-0.5 h-4 w-4 shrink-0 border-2 grid place-items-center ${
                plan.highlight
                  ? "border-primary bg-primary/20"
                  : "border-foreground bg-muted"
              }`}
            >
              <Check className="h-2.5 w-2.5" strokeWidth={3} />
            </span>
            <span className={plan.highlight ? "text-foreground" : "text-foreground/80"}>
              {f}
            </span>
          </li>
        ))}
      </ul>

      <a
        href={plan.ctaHref}
        className={`mt-10 block text-center border-2 px-6 py-3 text-sm font-bold uppercase transition-all hover:-translate-y-0.5 ${
          plan.highlight
            ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90 shadow-[4px_4px_0_oklch(0.15_0_0)]"
            : "border-foreground bg-background text-foreground hover:bg-muted shadow-[4px_4px_0_oklch(0.15_0_0)]"
        }`}
      >
        {plan.cta}
      </a>
    </motion.div>
  );
}

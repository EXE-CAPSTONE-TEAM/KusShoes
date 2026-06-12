import { useState } from "react";
import { Check } from "lucide-react";

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

const plans: Plan[] = [
  {
    name: "Miễn phí",
    priceMonthly: 0,
    priceYearly: 0,
    highlight: false,
    features: [
      "3 mẫu giày 3D có sẵn",
      "Công cụ thiết kế cơ bản",
      "Export có watermark",
      "Lưu tối đa 3 thiết kế",
    ],
    cta: "Bắt đầu miễn phí",
    ctaHref: "#studio",
  },
  {
    name: "Basic",
    badge: "Phổ biến nhất",
    priceMonthly: 199000,
    priceYearly: 1500000,
    highlight: true,
    features: [
      "Toàn bộ thư viện mẫu giày",
      "AI tách nền không giới hạn",
      "Export sạch không watermark",
      "Lưu tối đa 20 thiết kế",
    ],
    cta: "Đăng ký ngay",
    ctaHref: "#studio",
  },
  {
    name: "Pro",
    priceMonthly: 499000,
    priceYearly: 3990000,
    highlight: false,
    features: [
      "Tất cả tính năng Basic",
      "Export độ phân giải cao",
      "Lưu thiết kế không giới hạn",
      "Truy cập sớm tính năng mới",
    ],
    cta: "Bắt đầu Pro",
    ctaHref: "#studio",
  },
];

function formatPrice(price: number): string {
  return new Intl.NumberFormat("vi-VN").format(price) + "đ";
}

export function Pricing() {
  const [yearly, setYearly] = useState(true);

  return (
    <section id="pricing" className="relative py-32">
      <div className="absolute inset-0 tech-grid opacity-10" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            05 · Gói dịch vụ · Giá
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            Bắt đầu miễn phí.
            <br />
            <span className="text-primary">Nâng cấp khi cần.</span>
          </h2>
        </div>

        {/* Toggle */}
        <div className="mt-10 flex items-center gap-4 flex-wrap">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={`text-sm font-bold uppercase font-mono transition-colors ${
              !yearly ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Tháng
          </button>
          <button
            type="button"
            onClick={() => setYearly((v) => !v)}
            className="relative h-7 w-14 border-2 border-foreground bg-background shadow-[3px_3px_0_oklch(0.15_0_0)] flex items-center px-1"
            aria-label="Chuyển đổi thanh toán theo năm / tháng"
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
            Năm
          </button>
          {yearly && (
            <span className="border-2 border-primary bg-primary/10 px-2 py-0.5 text-[10px] font-bold font-mono text-primary uppercase">
              Tiết kiệm đến 33%
            </span>
          )}
        </div>

        {/* Plan cards */}
        <div className="mt-12 grid md:grid-cols-3 gap-6 items-start">
          {plans.map((plan) => (
            <PricingCard key={plan.name} plan={plan} yearly={yearly} />
          ))}
        </div>

        <p className="mt-8 text-center text-xs font-mono text-muted-foreground">
          Cần workspace nhóm?{" "}
          <a href="#contact" className="text-primary hover:underline">
            Xem gói Team — 299.000đ/người/tháng
          </a>
        </p>
      </div>
    </section>
  );
}

function PricingCard({ plan, yearly }: { plan: Plan; yearly: boolean }) {
  const isFree = plan.priceMonthly === 0;
  const price = isFree
    ? "Miễn phí"
    : yearly
    ? formatPrice(plan.priceYearly)
    : formatPrice(plan.priceMonthly);
  const unit = isFree ? null : yearly ? "/ năm" : "/ tháng";

  return (
    <div
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
          tương đương {formatPrice(Math.round(plan.priceYearly / 12))} / tháng
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
    </div>
  );
}

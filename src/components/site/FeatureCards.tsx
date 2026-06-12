import { Globe, Sparkles, RotateCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState } from "react";

type Card = {
  tag: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  visual: React.ReactNode;
};

const cards: Card[] = [
  {
    tag: "01 · 3D real-time",
    title: "Thấy ngay trong 3D",
    desc: "Ý tưởng đến không suy đoán: thiết kế hiện lên trực tiếp trên mô hình 3D, không cần chờ render, không cần phần mềm khác.",
    icon: RotateCcw,
    visual: (
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,#FF5A1F,#FF8A3D,#0a0a0a,#FF5A1F)] opacity-70 animate-spin-slow" />
        <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />
        <div className="absolute inset-x-4 bottom-4 border-2 border-foreground bg-background px-3 py-2 font-mono text-xs shadow-[4px_4px_0_oklch(0.15_0_0)]">
          <span className="text-muted-foreground">render &gt;</span>{" "}
          <span className="text-primary">real-time · 60fps</span>
          <span className="ml-1 inline-block h-3 w-1.5 align-middle bg-primary animate-pulse" />
        </div>
      </div>
    ),
  },
  {
    tag: "02 · AI một click",
    title: "AI tách nền tức thì",
    desc: "Upload ảnh bất kỳ, AI loại nền trong vài giây. Dán họa tiết, hình vẽ, pattern lên giày chỉ với 1 click.",
    icon: Sparkles,
    visual: (
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-background">
        <div className="absolute inset-0 tech-grid opacity-50" />
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {["#FFFFFF", "#FF5A1F", "#0A0A0A", "#A1A1A1"].map((c) => (
            <span
              key={c}
              className="h-5 w-5 border-2 border-foreground"
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="absolute right-3 top-3 space-y-1.5 text-[10px] font-mono text-muted-foreground">
          <div className="border-2 border-foreground bg-background px-2 py-1 shadow-[2px_2px_0_oklch(0.15_0_0)]">Input · Ảnh gốc</div>
          <div className="border-2 border-primary bg-primary/10 text-primary px-2 py-1 shadow-[2px_2px_0_oklch(0.15_0_0)]">AI · Tách nền</div>
          <div className="border-2 border-foreground bg-background px-2 py-1 shadow-[2px_2px_0_oklch(0.15_0_0)]">Output · Giày 3D</div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-12 border-t border-border bg-card/60 backdrop-blur grid grid-cols-4 text-[10px] text-muted-foreground">
          {["Upload", "Remove", "Apply", "Done"].map((t, i) => (
            <div
              key={t}
              className={`flex items-center justify-center ${
                i === 2 ? "text-primary" : ""
              }`}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    tag: "03 · Zero setup",
    title: "Mở trình duyệt. Dùng luôn.",
    desc: "Không download, không cài đặt, không account phức tạp. Mở Chrome hay Safari lên là thiết kế được luôn.",
    icon: Globe,
    visual: (
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-background">
        <div className="absolute inset-0 orange-grid opacity-60" />
        {/* Browser chrome mock */}
        <div className="absolute top-4 inset-x-4 border-2 border-foreground bg-background shadow-[4px_4px_0_oklch(0.15_0_0)]">
          <div className="flex items-center gap-1.5 border-b border-border px-2 py-1.5">
            <span className="h-2 w-2 border border-foreground bg-primary/50" />
            <span className="h-2 w-2 border border-foreground bg-muted" />
            <span className="h-2 w-2 border border-foreground bg-muted" />
            <div className="ml-2 flex-1 h-4 border border-border bg-muted/30 px-1 flex items-center">
              <span className="text-[8px] font-mono text-muted-foreground">kus.studio</span>
            </div>
          </div>
          <div className="px-3 py-2 text-[9px] font-mono text-muted-foreground">
            <span className="text-primary">✓</span> No download required
          </div>
        </div>
        <div className="absolute right-4 bottom-4 border-2 border-foreground bg-primary px-2.5 py-1 text-[10px] font-bold font-mono text-primary-foreground shadow-[2px_2px_0_oklch(0.15_0_0)] uppercase">
          READY IN BROWSER
        </div>
      </div>
    ),
  },
];

export function FeatureCards() {
  return (
    <section id="features" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            03 · Lợi thế · So sánh
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            3 điểm khác biệt,
            <br />
            <span className="text-primary">3 rào cản bị xóa.</span>
          </h2>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-6">
          {cards.map((c) => (
            <FeatureCard key={c.title} card={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ card }: { card: Card }) {
  const [hovered, setHovered] = useState(false);
  return (
    <article
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
    </article>
  );
}

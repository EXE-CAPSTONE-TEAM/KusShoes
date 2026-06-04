import { Brush, Factory, Sparkles } from "lucide-react";
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
    tag: "01 · AI Speed",
    title: "AI Prompt-to-Texture",
    desc: "Type a prompt — 'Cyberpunk Neon', 'Vintage Denim' — and AI generates a full-coverage texture in seconds.",
    icon: Sparkles,
    visual: (
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        <div className="absolute inset-0 bg-[conic-gradient(from_0deg_at_50%_50%,#FF5A1F,#FF8A3D,#0a0a0a,#FF5A1F)] opacity-70 animate-spin-slow" />
        <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />
        <div className="absolute inset-x-4 bottom-4 border-2 border-foreground bg-background px-3 py-2 font-mono text-xs shadow-[4px_4px_0_oklch(0.15_0_0)]">
          <span className="text-muted-foreground">prompt &gt;</span>{" "}
          <span className="text-primary">cyberpunk neon glow</span>
          <span className="ml-1 inline-block h-3 w-1.5 align-middle bg-primary animate-pulse" />
        </div>
      </div>
    ),
  },
  {
    tag: "02 · Pro Studio",
    title: "Manual Studio",
    desc: "A pro toolset with layers, color picker, and material editor. Feels just as familiar as Photoshop.",
    icon: Brush,
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
          <div className="border-2 border-foreground bg-background px-2 py-1 shadow-[2px_2px_0_oklch(0.15_0_0)]">Layer · Upper</div>
          <div className="border-2 border-primary bg-primary/10 text-primary px-2 py-1 shadow-[2px_2px_0_oklch(0.15_0_0)]">Layer · Sole</div>
          <div className="border-2 border-foreground bg-background px-2 py-1 shadow-[2px_2px_0_oklch(0.15_0_0)]">Layer · Laces</div>
        </div>
        <div className="absolute inset-x-0 bottom-0 h-12 border-t border-border bg-card/60 backdrop-blur grid grid-cols-4 text-[10px] text-muted-foreground">
          {["Move", "Paint", "Mask", "Material"].map((t, i) => (
            <div
              key={t}
              className={`flex items-center justify-center ${
                i === 1 ? "text-primary" : ""
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
    tag: "03 · Production",
    title: "Pro Connect",
    desc: "Send the marked-up 3D file straight to manufacturing with sizing and materials included. One click.",
    icon: Factory,
    visual: (
      <div className="relative h-full w-full overflow-hidden rounded-xl bg-background">
        <div className="absolute inset-0 orange-grid opacity-60" />
        <svg viewBox="0 0 200 120" className="absolute inset-0 h-full w-full p-6">
          <path
            d="M20 80 Q60 30 110 50 T180 70"
            stroke="oklch(0.72 0.22 45)"
            strokeWidth="1.5"
            fill="none"
            strokeDasharray="4 4"
          />
          {[
            { x: 50, y: 65, l: "A" },
            { x: 110, y: 50, l: "B" },
            { x: 165, y: 72, l: "C" },
          ].map((p) => (
            <g key={p.l}>
              <circle cx={p.x} cy={p.y} r="6" fill="oklch(0.72 0.22 45)" />
              <circle cx={p.x} cy={p.y} r="11" stroke="oklch(0.72 0.22 45)" fill="none" opacity="0.4" />
              <text
                x={p.x + 10}
                y={p.y + 3}
                fontSize="7"
                fill="oklch(0.985 0 0)"
                fontFamily="ui-monospace"
              >
                Pin {p.l}
              </text>
            </g>
          ))}
        </svg>
        <div className="absolute right-3 bottom-3 border-2 border-foreground bg-primary px-2.5 py-1 text-[10px] font-bold font-mono text-primary-foreground shadow-[2px_2px_0_oklch(0.15_0_0)] uppercase">
          READY TO SHIP
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
            03 — How It Works
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            Three Paths, One
            <br />
            <span className="text-primary">Unique Sneaker.</span>
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

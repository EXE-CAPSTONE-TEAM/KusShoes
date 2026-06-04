import { Users } from "lucide-react";
import sneakerHero from "@/assets/sneaker-hero.png";

const cursors = [
  { name: "User A", color: "oklch(0.72 0.22 45)", top: "22%", left: "30%", delay: "0s" },
  { name: "User B", color: "oklch(0.985 0 0)", top: "58%", left: "62%", delay: "1.2s" },
  { name: "User C", color: "oklch(0.78 0.21 55)", top: "70%", left: "22%", delay: "2.4s" },
];

export function Collaboration() {
  return (
    <section id="team" className="relative py-32">
      <div className="mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">
            04 — Real-time
          </span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            The Whole Team
            <br />
            On <span className="text-primary">One Canvas.</span>
          </h2>
          <p className="mt-6 max-w-lg text-foreground font-medium">
            Invite designers, brand leads, and manufacturers into a single workspace. Every change syncs instantly — no exports, no emails, no lost versions.
          </p>

          <ul className="mt-8 space-y-3 text-sm">
            {[
              "Live cursors + 3D spatial comments",
              "Infinite version history & rollback",
              "Roles & permissions for Team / Enterprise",
            ].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="text-muted-foreground">{t}</span>
              </li>
            ))}
          </ul>

          <a
            href="#contact"
            className="mt-10 inline-flex items-center gap-2 border-2 border-foreground bg-primary/10 px-6 py-3 text-sm font-bold uppercase text-foreground hover:bg-primary/20 transition-colors shadow-[4px_4px_0_oklch(0.15_0_0)]"
          >
            <Users className="h-4 w-4" /> For Teams / Enterprise
          </a>
        </div>

        {/* Canvas mock */}
        <div className="relative h-[520px] border-2 border-foreground bg-card overflow-hidden shadow-[8px_8px_0_oklch(0.15_0_0)]">
          <div className="absolute inset-0 tech-grid opacity-60" />
          <div className="absolute inset-0 bg-radial-orange opacity-50" />

          {/* Top toolbar */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between border-b border-border bg-background/40 backdrop-blur px-4 py-2.5 text-xs">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-muted-foreground font-mono">project · sneaker-v07</span>
            </div>
            <div className="flex -space-x-2">
              {cursors.map((c) => (
                <span
                  key={c.name}
                  className="h-6 w-6 border-2 border-foreground text-[10px] font-bold font-mono grid place-items-center"
                  style={{ backgroundColor: c.color, color: "#0a0a0a" }}
                >
                  {c.name.slice(-1)}
                </span>
              ))}
            </div>
          </div>

          {/* Sneaker */}
          <div className="absolute inset-0 grid place-items-center pt-8">
            <img
              src={sneakerHero}
              alt="Real-time collaboration mock on a 3D sneaker canvas"
              width={1024}
              height={1024}
              loading="lazy"
              className="w-[70%] max-w-[420px] drop-shadow-[0_20px_50px_rgba(255,90,30,0.3)]"
            />
          </div>

          {/* Cursors */}
          {cursors.map((c) => (
            <div
              key={c.name}
              className="absolute z-10 animate-float-slow"
              style={{ top: c.top, left: c.left, animationDelay: c.delay }}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path
                  d="M3 3L19 11L11 13L9 19L3 3Z"
                  fill={c.color}
                  stroke="oklch(0.12 0 0)"
                  strokeWidth="1"
                />
              </svg>
              <span
                className="ml-3 mt-1 inline-block border-2 border-foreground px-2 py-0.5 text-[10px] font-bold font-mono shadow-[2px_2px_0_oklch(0.15_0_0)] uppercase"
                style={{ backgroundColor: c.color, color: "#0a0a0a" }}
              >
                {c.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

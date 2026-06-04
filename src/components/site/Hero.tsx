import { Play, Sparkles } from "lucide-react";
import sneakerHero from "@/assets/sneaker-hero.png";
import { useMouseParallax } from "@/hooks/use-mouse-parallax";
import { FloatingGeometry } from "./FloatingGeometry";

export function Hero({ onOpenStudio }: { onOpenStudio?: () => void }) {
  const { ref, pos } = useMouseParallax<HTMLDivElement>();

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-screen overflow-hidden pt-32 pb-20"
    >
      <FloatingGeometry />

      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-12 items-center">
        {/* Copy */}
        <div className="relative z-10 animate-fade-up">
          <span className="inline-flex items-center gap-2 rounded-none border-2 border-primary bg-primary/10 px-3 py-1 text-xs font-bold font-mono text-primary uppercase">
            <Sparkles className="h-3.5 w-3.5" /> AI + 3D Sneaker Studio
          </span>
          <h1 className="mt-6 text-6xl md:text-7xl lg:text-8xl font-heading tracking-tight leading-[0.9]">
            Shape Your Shoes
            <br />
            <span className="text-primary text-glow">
              Show Your Style
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground font-medium">
            Scan real photos, customize in 3D space, and connect directly
            with manufacturing lines.
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            <button
              type="button"
              onClick={onOpenStudio}
              className="inline-flex items-center gap-2 rounded-none border-2 border-primary bg-primary px-8 py-4 text-sm font-bold uppercase text-primary-foreground glow-orange-lg hover:scale-105 transition-transform"
            >
              Launch Studio
            </button>
            <a
              href="#features"
              className="inline-flex items-center gap-2 rounded-none border-2 border-foreground px-8 py-4 text-sm font-bold uppercase text-foreground hover:bg-foreground hover:text-background transition-colors"
            >
              <Play className="h-4 w-4" /> Watch Demo
            </a>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 max-w-md font-mono border-t-2 border-border pt-6">
            {[
              { k: "12k+", v: "Scanned models" },
              { k: "98%", v: "Accuracy" },
              { k: "48h", v: "To factory" },
            ].map((s) => (
              <div key={s.v}>
                <dt className="text-3xl font-bold text-foreground">{s.k}</dt>
                <dd className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">{s.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 3D sneaker stage */}
        <div className="relative h-[520px] lg:h-[640px]" style={{ perspective: "1200px" }}>
          {/* Rotating studio ring */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-[420px] w-[420px] lg:h-[520px] lg:w-[520px]">
              <div className="absolute inset-0 bg-radial-orange rounded-full opacity-40 blur-3xl" />
              <div
                className="absolute inset-0 rounded-full border border-primary/30 animate-spin-slow"
                style={{ transformStyle: "preserve-3d", transform: "rotateX(75deg)" }}
              />
              <div
                className="absolute inset-8 rounded-full border border-primary/25 animate-spin-slow"
                style={{
                  transformStyle: "preserve-3d",
                  transform: "rotateX(75deg)",
                  animationDirection: "reverse",
                  animationDuration: "26s",
                }}
              />
              <div
                className="absolute inset-16 rounded-full border border-primary/15"
                style={{ transform: "rotateX(75deg)" }}
              />
            </div>
          </div>

          {/* Sneaker */}
          <div
            className="absolute inset-0 grid place-items-center transition-transform duration-300 ease-out"
            style={{
              transform: `rotateY(${pos.x * 18}deg) rotateX(${pos.y * -10}deg) translateZ(0)`,
              transformStyle: "preserve-3d",
            }}
          >
            <img
              src={sneakerHero}
              alt="3D white sneaker model KusShoes on glowing orange rotating stage"
              width={1024}
              height={1024}
              className="relative z-10 w-[88%] max-w-[560px] drop-shadow-[0_30px_60px_rgba(255,90,30,0.35)]"
            />
          </div>

          {/* Floating labels */}
          <div
            className="hidden sm:block absolute top-16 left-2 z-20 border-2 border-foreground bg-background px-3 py-2 text-xs font-mono animate-float-slow shadow-[4px_4px_0_oklch(0.15_0_0)]"
            style={{ animationDelay: "0.5s" }}
          >
            <div className="text-primary font-bold uppercase">● Material</div>
            <div className="text-foreground">Premium Leather</div>
          </div>
          <div
            className="hidden sm:block absolute bottom-20 right-0 z-20 border-2 border-foreground bg-background px-3 py-2 text-xs font-mono animate-float-slow shadow-[4px_4px_0_oklch(0.15_0_0)]"
            style={{ animationDelay: "2.2s" }}
          >
            <div className="text-primary font-medium">● Scan ready</div>
            <div className="text-muted-foreground">.glb · 2.4MB</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function FloatingGeometry() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Glow blobs - toned down for brutalist */}
      <div className="absolute -top-32 -left-32 h-96 w-96 bg-primary/10 blur-3xl animate-pulse-glow" />
      <div className="absolute top-1/2 -right-40 h-[28rem] w-[28rem] bg-primary-glow/10 blur-3xl animate-pulse-glow" style={{ animationDelay: "1.5s" }} />
      <div className="absolute bottom-0 left-1/3 h-72 w-72 bg-primary/5 blur-3xl animate-pulse-glow" style={{ animationDelay: "3s" }} />

      {/* Floating geometric brutalist shapes */}
      <div className="absolute top-24 right-[12%] h-16 w-16 rotate-12 border-2 border-foreground bg-primary/10 animate-float-slow shadow-[4px_4px_0_oklch(0.15_0_0)]" />
      <div className="absolute bottom-32 left-[8%] h-10 w-10 border-2 border-foreground bg-background animate-float-slow shadow-[2px_2px_0_oklch(0.15_0_0)]" style={{ animationDelay: "2s", transform: "rotate(45deg)" }} />
      <div className="absolute top-1/3 left-[15%] h-4 w-4 bg-primary border-2 border-foreground animate-float-slow shadow-[2px_2px_0_oklch(0.15_0_0)]" style={{ animationDelay: "4s" }} />
      <div className="absolute bottom-1/4 right-[20%] h-4 w-24 border-2 border-foreground bg-primary animate-float-slow shadow-[2px_2px_0_oklch(0.15_0_0)]" style={{ animationDelay: "1s" }} />
    </div>
  );
}

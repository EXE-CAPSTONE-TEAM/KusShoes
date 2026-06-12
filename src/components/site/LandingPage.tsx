import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { ExplodeView } from "./ExplodeView";
import { FeatureCards } from "./FeatureCards";
import { Collaboration } from "./Collaboration";
import { Pricing } from "./Pricing";
import { InteractiveFooter } from "./InteractiveFooter";
import { Footer } from "./Footer";
import "../../landing.css";

/**
 * KusShoes landing page. Self-contained under the `.kus-landing` scope so its
 * Tailwind/brutalist styles never leak into the customizer app.
 * `onOpenStudio` is fired by the "Open Kus Studio" / "Launch Studio" CTAs to
 * hand off to the main customizer (which shows the login screen).
 */
export function LandingPage({ onOpenStudio }: { onOpenStudio: () => void }) {
  return (
    <div className="kus-landing relative bg-background text-foreground">
      <Nav onOpenStudio={onOpenStudio} />
      <Hero onOpenStudio={onOpenStudio} />
      <ExplodeView />
      <FeatureCards />
      <Collaboration />
      <Pricing />
      <InteractiveFooter onOpenStudio={onOpenStudio} />
      <Footer />
    </div>
  );
}

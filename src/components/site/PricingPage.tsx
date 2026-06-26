import { Nav } from "./Nav";
import { Pricing } from "./Pricing";
import { Footer } from "./Footer";
import "../../landing.css";

export function PricingPage({
  onOpenStudio,
  onLogin,
  onRegister,
}: {
  onOpenStudio: () => void;
  onLogin?: () => void;
  onRegister?: () => void;
}) {
  return (
    <div className="kus-landing relative bg-background text-foreground min-h-screen flex flex-col">
      <Nav
        onOpenStudio={onOpenStudio}
        onLogin={onLogin}
        onRegister={onRegister}
      />
      <main className="flex-1 mt-24">
        <Pricing />
      </main>
      <Footer />
    </div>
  );
}

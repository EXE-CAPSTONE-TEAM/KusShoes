import { Nav } from "./Nav";
import { About } from "./About";
import { Footer } from "./Footer";
import "../../landing.css";

export function AboutPage({
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
        <About />
      </main>
      <Footer />
    </div>
  );
}

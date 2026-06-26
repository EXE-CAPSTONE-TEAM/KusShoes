import { useEffect, useState } from "react";

import { App } from "./App";
import { LandingPage } from "./components/site/LandingPage";
import { PricingPage } from "./components/site/PricingPage";
import { AboutPage } from "./components/site/AboutPage";

export type AppRoute = "login" | "register" | "studio";
type View = "landing" | "pricing" | "about" | AppRoute;

function viewFromLocation(): View {
  const path = window.location.pathname;
  if (path === "/login") return "login";
  if (path === "/register") return "register";
  if (path === "/studio") return "studio";
  if (path === "/pricing") return "pricing";
  if (path === "/about") return "about";
  // Shared design deep links (?scanId=...) open the studio directly.
  if (new URLSearchParams(window.location.search).has("scanId")) return "studio";
  return "landing";
}

/** Lightweight History-API navigation (no router dependency — matches the
 *  app's existing ?scanId= URL handling). Pushing a route notifies <Root/>. */
export function navigate(path: string) {
  if (window.location.pathname === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

import { LanguageProvider } from "./i18n/LanguageContext";

/**
 * Top-level router:
 *   /          → KusShoes landing page
 *   /login     → customizer login form
 *   /register  → customizer register form
 *   /studio    → authenticated customizer (also where you land after auth)
 */
export function Root() {
  const [view, setView] = useState<View>(viewFromLocation);

  useEffect(() => {
    const onPopState = () => setView(viewFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return (
    <LanguageProvider>
      {(() => {
        if (view === "landing") {
          return (
            <LandingPage
              onLogin={() => navigate("/login")}
              onRegister={() => navigate("/register")}
              onOpenStudio={() => navigate("/login")}
            />
          );
        }
        if (view === "pricing") {
          return (
            <PricingPage
              onLogin={() => navigate("/login")}
              onRegister={() => navigate("/register")}
              onOpenStudio={() => navigate("/login")}
            />
          );
        }
        if (view === "about") {
          return (
            <AboutPage
              onLogin={() => navigate("/login")}
              onRegister={() => navigate("/register")}
              onOpenStudio={() => navigate("/login")}
            />
          );
        }
        return <App route={view} onNavigate={navigate} />;
      })()}
    </LanguageProvider>
  );
}

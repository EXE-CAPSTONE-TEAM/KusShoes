import { useEffect, useState } from "react";

import { App } from "./App";
import { LandingPage } from "./components/site/LandingPage";

export type AppRoute = "login" | "register" | "studio";
type View = "landing" | AppRoute;

function viewFromLocation(): View {
  const path = window.location.pathname;
  if (path === "/login") return "login";
  if (path === "/register") return "register";
  if (path === "/studio") return "studio";
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

  if (view === "landing") {
    return <LandingPage onOpenStudio={() => navigate("/login")} />;
  }
  return <App route={view} onNavigate={navigate} />;
}

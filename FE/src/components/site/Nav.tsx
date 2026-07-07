import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { motion } from "framer-motion";
import logo from "@/assets/logo.png";
import { useLanguage } from "@/i18n/LanguageContext";

export function Nav({ onOpenStudio, onLogin, onRegister }: { onOpenStudio?: () => void, onLogin?: () => void, onRegister?: () => void }) {
  const { t } = useLanguage();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navLinks = [
    { href: "/#studio", label: t.nav.studio },
    { href: "/#features", label: t.nav.features },
    { href: "/pricing", label: t.nav.pricing },
    { href: "/about", label: t.nav.about },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleLogin = () => {
    setMenuOpen(false);
    onLogin ? onLogin() : onOpenStudio?.();
  };

  const handleRegister = () => {
    setMenuOpen(false);
    onRegister ? onRegister() : onOpenStudio?.();
  };

  const handleLinkClick = () => setMenuOpen(false);

  return (
    <motion.header
      initial={{ y: "-100%" }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled || menuOpen
          ? "backdrop-blur-xl bg-background/90 border-b-2 border-foreground"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2" onClick={handleLinkClick}>
          <img
            src={logo}
            alt="Kus Shoes"
            className="-my-16 h-[120px] md:h-[160px] w-auto object-contain relative z-10"
          />
        </a>

        {/* Desktop nav links */}
        <ul className="hidden md:flex items-center gap-10 text-sm text-muted-foreground">
          {navLinks.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="px-2 py-1 hover:text-foreground transition-colors">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop CTA + mobile menu toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleLogin}
            className="hidden sm:inline-flex items-center rounded-none border-2 border-foreground bg-transparent px-7 py-2.5 text-sm font-bold text-foreground hover:bg-foreground hover:text-background transition-all"
          >
            {t.nav.login}
          </button>
          <button
            type="button"
            onClick={handleRegister}
            className="hidden sm:inline-flex items-center rounded-none border-2 border-primary bg-primary px-7 py-2.5 text-sm font-bold text-primary-foreground glow-orange hover:bg-primary-glow transition-all"
          >
            {t.nav.register}
          </button>

          {/* Hamburger — mobile only */}
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Đóng menu" : "Mở menu"}
            aria-expanded={menuOpen}
            className="md:hidden flex items-center justify-center h-10 w-10 border-2 border-foreground bg-background shadow-[2px_2px_0_oklch(0.15_0_0)]"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t-2 border-foreground bg-background/95 backdrop-blur-xl">
          <ul className="mx-auto max-w-7xl px-6 py-4 flex flex-col gap-1">
            {navLinks.map((l) => (
              <li key={l.href}>
                <a
                  href={l.href}
                  onClick={handleLinkClick}
                  className="block px-3 py-3 text-sm font-bold uppercase font-mono text-foreground hover:text-primary hover:bg-primary/5 transition-colors border-b border-border/40"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li className="pt-3 flex flex-col gap-3">
              <button
                type="button"
                onClick={handleLogin}
                className="w-full border-2 border-foreground bg-transparent px-6 py-3 text-sm font-bold uppercase text-foreground shadow-[4px_4px_0_oklch(0.15_0_0)] hover:bg-foreground hover:text-background transition-colors"
              >
                {t.nav.login}
              </button>
              <button
                type="button"
                onClick={handleRegister}
                className="w-full border-2 border-primary bg-primary px-6 py-3 text-sm font-bold uppercase text-primary-foreground shadow-[4px_4px_0_oklch(0.15_0_0)]"
              >
                {t.nav.register}
              </button>
            </li>
          </ul>
        </div>
      )}
    </motion.header>
  );
}

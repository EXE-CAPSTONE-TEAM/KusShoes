import { ChevronDown, Languages } from "lucide-react";
import logo from "@/assets/logo.png";

const linkColumns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Kus Studio",
    links: [
      { label: "Overview", href: "#top" },
      { label: "Launch Studio", href: "#studio" },
      { label: "Features", href: "#features" },
      { label: "Pricing", href: "#" },
    ],
  },
  {
    title: "Create",
    links: [
      { label: "AI Prompt-to-Texture", href: "#features" },
      { label: "Manual Studio", href: "#features" },
      { label: "Explode View", href: "#" },
      { label: "Pro Connect", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Who we are", href: "#team" },
      { label: "Stories & Insight", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Brand use", href: "#" },
    ],
  },
  {
    title: "Learn & Support",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Talk to the team", href: "#" },
      { label: "Beginners Series", href: "#" },
      { label: "Community", href: "#" },
    ],
  },
];

const socialLinks = ["Instagram", "YouTube", "X (formerly Twitter)", "TikTok"];
const legalLinks = ["Privacy Policy", "Terms & Conditions", "Cookies Policy"];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative border-t-4 border-foreground bg-card">
      <div className="absolute inset-0 tech-grid opacity-10" />

      <div className="relative mx-auto max-w-7xl px-6 py-16">
        {/* ── Brand + link columns ── */}
        <div className="grid gap-12 lg:grid-cols-12">
          {/* Brand */}
          <div className="lg:col-span-4">
            <img src={logo} alt="KusShoes" className="-ml-2 -my-6 h-[120px] w-auto object-contain" />
            <p className="mt-2 text-lg font-heading text-muted-foreground">
              Shape your shoes. Show your style.
            </p>
          </div>

          {/* Columns */}
          <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-8">
            {linkColumns.map((col) => (
              <div key={col.title}>
                <h3 className="border-b-2 border-foreground pb-2 text-sm font-bold uppercase tracking-tight text-foreground">
                  {col.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="my-12 border-t-2 border-border" />

        {/* ── Bottom bar ── */}
        <div className="grid gap-10 lg:grid-cols-12">
          {/* Locale + copyright */}
          <div className="lg:col-span-6">
            <button
              type="button"
              className="inline-flex items-center gap-2 border-2 border-foreground bg-background px-3 py-2 text-sm font-bold uppercase font-mono text-foreground shadow-[3px_3px_0_oklch(0.15_0_0)] transition-transform hover:translate-x-[-1px] hover:translate-y-[-1px]"
            >
              <Languages className="h-4 w-4" />
              English (US)
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <p className="mt-6 text-sm font-bold uppercase tracking-tight text-foreground">
              Made in Vietnam.
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground font-mono">
              © {year} KusShoes. All rights reserved. KusShoes® is a registered
              trademark of the FPTU EXE team.
            </p>
          </div>

          {/* Social + legal */}
          <div className="lg:col-span-6 grid grid-cols-2 gap-8">
            <ul className="space-y-2.5">
              {socialLinks.map((label) => (
                <li key={label}>
                  <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-primary">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
            <ul className="space-y-2.5">
              {legalLinks.map((label) => (
                <li key={label}>
                  <a href="#" className="text-sm text-muted-foreground transition-colors hover:text-primary">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

import { Languages } from "lucide-react";
import logo from "@/assets/logo.png";
import { useLanguage } from "@/i18n/LanguageContext";
import type { Dictionary } from "@/i18n/dictionaries";

const getLinkColumns = (t: Dictionary) => [
  {
    title: t.footer.cols.col1,
    links: [
      { label: t.footer.cols.col1_1, href: "#top" },
      { label: t.footer.cols.col1_2, href: "#studio" },
      { label: t.footer.cols.col1_3, href: "#features" },
      { label: t.footer.cols.col1_4, href: "#" },
    ],
  },
  {
    title: t.footer.cols.col2,
    links: [
      { label: t.footer.cols.col2_1, href: "#features" },
      { label: t.footer.cols.col2_2, href: "#features" },
      { label: t.footer.cols.col2_3, href: "#" },
      { label: t.footer.cols.col2_4, href: "#" },
    ],
  },
  {
    title: t.footer.cols.col3,
    links: [
      { label: t.footer.cols.col3_1, href: "#team" },
      { label: t.footer.cols.col3_2, href: "#" },
      { label: t.footer.cols.col3_3, href: "#" },
      { label: t.footer.cols.col3_4, href: "#" },
    ],
  },
  {
    title: t.footer.cols.col4,
    links: [
      { label: t.footer.cols.col4_1, href: "#" },
      { label: t.footer.cols.col4_2, href: "#" },
      { label: t.footer.cols.col4_3, href: "#" },
      { label: t.footer.cols.col4_4, href: "#" },
    ],
  },
];

const socialLinks = ["Instagram", "YouTube", "X (formerly Twitter)", "TikTok"];
const legalLinks = ["Privacy Policy", "Terms & Conditions", "Cookies Policy"];

export function Footer() {
  const { t, lang, setLang } = useLanguage();
  const linkColumns = getLinkColumns(t);
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
              {t.footer.desc}
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
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLang('vi')}
                className={`inline-flex items-center gap-2 border-2 border-foreground px-3 py-2 text-sm font-bold uppercase font-mono shadow-[3px_3px_0_oklch(0.15_0_0)] transition-all ${
                  lang === 'vi' ? "bg-background text-foreground hover:-translate-x-0.5 hover:-translate-y-0.5" : "bg-muted/20 text-foreground/50 shadow-none hover:text-foreground hover:bg-background"
                }`}
              >
                <Languages className="h-4 w-4" />
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`inline-flex items-center gap-2 border-2 border-foreground px-3 py-2 text-sm font-bold uppercase font-mono shadow-[3px_3px_0_oklch(0.15_0_0)] transition-all ${
                  lang === 'en' ? "bg-background text-foreground hover:-translate-x-0.5 hover:-translate-y-0.5" : "bg-muted/20 text-foreground/50 shadow-none hover:text-foreground hover:bg-background"
                }`}
              >
                English
              </button>
            </div>
            <p className="mt-6 text-sm font-bold uppercase tracking-tight text-foreground">
              {t.footer.madeIn}
            </p>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-muted-foreground font-mono">
              © {year} {t.footer.copyright}
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

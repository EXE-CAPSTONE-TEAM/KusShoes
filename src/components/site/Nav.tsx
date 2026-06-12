import { useEffect, useState } from "react";
import logo from "@/assets/logo.png";

const links = [
  { href: "#studio", label: "Studio" },
  { href: "#features", label: "Tính năng" },
  { href: "#pricing", label: "Bảng giá" },
  { href: "#team", label: "Đánh giá" },
  { href: "#contact", label: "Đăng nhập" },
];

export function Nav({ onOpenStudio }: { onOpenStudio?: () => void }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "backdrop-blur-xl bg-background/70 border-b border-border"
          : "bg-transparent"
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center gap-2">
          <img src={logo} alt="Kus Shoes" className="-my-16 h-[120px] md:h-[160px] w-auto object-contain relative z-10" />
        </a>

        <ul className="hidden md:flex items-center gap-10 text-sm text-muted-foreground">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="px-2 py-1 rounded-md hover:text-foreground transition-colors">
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onOpenStudio}
            className="inline-flex items-center rounded-none border-2 border-primary bg-primary px-7 py-2.5 text-sm font-bold text-primary-foreground glow-orange hover:bg-primary-glow transition-all"
          >
            Dùng thử miễn phí
          </button>
        </div>
      </nav>
    </header>
  );
}

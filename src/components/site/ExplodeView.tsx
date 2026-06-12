import { Layers, MousePointerClick, Send } from "lucide-react";
import sneakerSole from "@/assets/sneaker-sole.png";
import sneakerUpper from "@/assets/sneaker-upper.png";
import sneakerLaces from "@/assets/sneaker-laces.png";
import { useScrollProgress } from "@/hooks/use-scroll-progress";

const steps = [
  {
    icon: MousePointerClick,
    title: "Chọn mẫu giày",
    desc: "Duyệt thư viện hàng chục mẫu giày 3D có sẵn, hoặc upload mô hình của bạn.",
  },
  {
    icon: Layers,
    title: "Thiết kế trên canvas 3D",
    desc: "Vẽ, tô, dán ảnh đã tách nền lên bề mặt giày — thấy kết quả xoay 3D theo thời gian thực.",
  },
  {
    icon: Send,
    title: "Xuất file hoặc kết nối nghệ nhân",
    desc: "Tải về ảnh chất lượng cao, hoặc gửi thiết kế đến đầu mối thợ vẽ tay để hiện thực hóa.",
  },
];

export function ExplodeView() {
  const { ref, progress } = useScrollProgress<HTMLDivElement>();

  // ease the explode value
  const p = Math.min(1, Math.max(0, (progress - 0.15) * 1.6));

  return (
    <section
      ref={ref}
      className="relative py-32 overflow-hidden"
    >
      <div className="absolute inset-0 tech-grid opacity-20" />
      <div className="relative mx-auto max-w-7xl px-6 grid lg:grid-cols-2 gap-16 items-center">
        {/* Exploded sneaker stage */}
        <div className="relative h-[540px]" style={{ perspective: "1400px" }}>
          <div className="absolute inset-0 bg-radial-orange opacity-60" />

          <div className="absolute inset-0 grid place-items-center">
            <div className="relative w-[80%] max-w-[440px]">
              {/* Laces — float up */}
              <img
                src={sneakerLaces}
                alt="Detached sneaker laces"
                width={1024}
                height={512}
                loading="lazy"
                className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 ease-out"
                style={{ transform: `translate(-50%, calc(-50% + ${-160 * p}px)) scale(${1 + p * 0.05})` }}
              />
              {/* Upper — middle */}
              <img
                src={sneakerUpper}
                alt="Detached sneaker upper"
                width={1024}
                height={640}
                loading="lazy"
                className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 ease-out"
                style={{ transform: `translate(-50%, calc(-50% + ${-20 * p}px))` }}
              />
              {/* Sole — drop down */}
              <img
                src={sneakerSole}
                alt="Detached sneaker sole"
                width={1024}
                height={512}
                loading="lazy"
                className="absolute left-1/2 top-1/2 w-full -translate-x-1/2 -translate-y-1/2 transition-transform duration-300 ease-out"
                style={{ transform: `translate(-50%, calc(-50% + ${140 * p}px)) scale(${1 + p * 0.04})` }}
              />

              {/* Connector lines */}
              <div
                className="absolute left-1/2 top-1/2 w-px bg-gradient-to-b from-transparent via-primary to-transparent transition-all duration-300"
                style={{ height: `${260 * p}px`, transform: "translate(-50%, -50%)" }}
              />
            </div>
          </div>

          {/* Floating part tags */}
          {p > 0.4 && (
            <>
              <div className="absolute top-[15%] right-4 sm:right-8 border-2 border-foreground bg-background px-4 py-2 text-xs font-mono font-bold uppercase text-foreground animate-fade-up shadow-[4px_4px_0_oklch(0.15_0_0)]">
                01 · Laces
              </div>
              <div className="absolute top-[50%] -translate-y-1/2 right-4 sm:right-8 border-2 border-foreground bg-background px-4 py-2 text-xs font-mono font-bold uppercase text-foreground animate-fade-up shadow-[4px_4px_0_oklch(0.15_0_0)]">
                02 · Upper
              </div>
              <div className="absolute bottom-[15%] right-4 sm:right-8 border-2 border-foreground bg-background px-4 py-2 text-xs font-mono font-bold uppercase text-foreground animate-fade-up shadow-[4px_4px_0_oklch(0.15_0_0)]">
                03 · Sole
              </div>
            </>
          )}
        </div>

        {/* Text */}
        <div>
          <span className="text-xs uppercase font-mono font-bold tracking-[0.3em] text-primary">02 · Quy trình · Đơn giản</span>
          <h2 className="mt-4 text-5xl md:text-6xl font-heading tracking-tight leading-[0.9]">
            Đơn giản như
            <br />
            <span className="text-primary">3 bước.</span>
          </h2>
          <p className="mt-6 text-foreground font-medium max-w-lg">
            Từ ý tưởng đến xuất xưởng — không cần kinh nghiệm thiết kế, không cần cài phần mềm. Kéo xuống để xem giày thay đổi từng bước.
          </p>

          <ul className="mt-10 flex flex-col gap-5">
            {steps.map((s) => (
              <li key={s.title} className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-5 w-full border-2 border-foreground bg-background hover:-translate-y-1 hover:shadow-[4px_4px_0_oklch(0.15_0_0)] transition-all">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center border-2 border-foreground bg-primary/10 text-primary">
                  <s.icon className="h-6 w-6" />
                </div>
                <div className="flex flex-col">
                  <h3 className="font-bold uppercase tracking-tight text-lg">{s.title}</h3>
                  <p className="text-sm text-foreground/80 mt-1">{s.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

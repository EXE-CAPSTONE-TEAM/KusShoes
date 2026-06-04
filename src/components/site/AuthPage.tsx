import { type FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, UserPlus, LogIn, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";
import sneakerHero from "@/assets/sneaker-hero.png";
import "../../landing.css";

type AuthPageProps = {
  mode: "login" | "register";
  name: string;
  email: string;
  password: string;
  isBusy: boolean;
  statusMessage: string;
  onModeChange: (mode: "login" | "register") => void;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onDemoAuth: () => void;
  onBack: () => void;
};

const inputClass =
  "w-full border-2 border-foreground bg-background px-4 py-3 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary shadow-[4px_4px_0_oklch(0.15_0_0)] transition-shadow focus:shadow-[4px_4px_0_oklch(0.65_0.25_35)]";

export function AuthPage({
  mode,
  name,
  email,
  password,
  isBusy,
  statusMessage,
  onModeChange,
  onNameChange,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onDemoAuth,
  onBack,
}: AuthPageProps) {
  const isLogin = mode === "login";
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="kus-landing min-h-screen bg-background text-foreground flex flex-col">
      {/* ── Top bar (compact height; logo overflows via negative margin) ── */}
      <header className="flex items-center justify-between px-6 border-b-2 border-foreground bg-background h-16">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold font-mono uppercase text-foreground hover:text-primary transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <a href="/" onClick={(e) => { e.preventDefault(); onBack(); }} className="shrink-0">
          <img
            src={logo}
            alt="KusShoes"
            className="-my-16 h-[140px] w-auto object-contain"
          />
        </a>
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest hidden sm:block">
          {isLogin ? "Sign in to your account" : "Create your account"}
        </span>
      </header>

      {/* ── Main split: visual LEFT, form RIGHT ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — visual panel (hidden on mobile) */}
        <div className="hidden lg:flex flex-col lg:w-[70%] relative border-r-2 border-foreground overflow-hidden bg-card">
          <div className="absolute inset-0 tech-grid opacity-20" />
          <div className="absolute inset-0 bg-radial-orange opacity-60" />

          {/* Floating brutalist shapes */}
          <div className="absolute top-12 left-10 h-16 w-16 rotate-12 border-2 border-foreground bg-primary/10 shadow-[4px_4px_0_oklch(0.15_0_0)] animate-float-slow" />
          <div className="absolute bottom-24 right-10 h-8 w-8 border-2 border-foreground bg-background shadow-[2px_2px_0_oklch(0.15_0_0)] animate-float-slow" style={{ animationDelay: "2s" }} />
          <div className="absolute top-1/3 right-20 h-4 w-20 border-2 border-foreground bg-primary animate-float-slow shadow-[2px_2px_0_oklch(0.15_0_0)]" style={{ animationDelay: "1s" }} />

          {/* Rotating ring */}
          <div className="absolute inset-0 grid place-items-center">
            <div className="relative h-[480px] w-[480px]">
              <div
                className="absolute inset-0 rounded-full border border-primary/30 animate-spin-slow"
                style={{ transformStyle: "preserve-3d", transform: "rotateX(75deg)" }}
              />
              <div
                className="absolute inset-10 rounded-full border border-primary/20 animate-spin-slow"
                style={{ transformStyle: "preserve-3d", transform: "rotateX(75deg)", animationDirection: "reverse", animationDuration: "26s" }}
              />
            </div>
          </div>

          {/* Sneaker */}
          <div className="relative flex-1 grid place-items-center">
            <img
              src={sneakerHero}
              alt="KusShoes 3D sneaker"
              className="w-[75%] max-w-[420px] drop-shadow-[0_30px_60px_rgba(255,90,30,0.4)] animate-float-slow"
              style={{ animationDuration: "7s" }}
            />
          </div>

          {/* Bottom quote */}
          <div className="relative z-10 border-t-2 border-foreground bg-background/80 backdrop-blur px-10 py-6">
            <p className="text-sm font-mono font-bold uppercase text-foreground tracking-wider">
              "Scan. Design. <span className="text-primary">Produce."</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              12k+ models scanned · 98% accuracy · 48h to factory
            </p>
          </div>
        </div>

        {/* Right — form */}
        <div className="flex flex-col justify-center w-full lg:w-[30%] px-6 sm:px-10 py-12">

          {/* Badge */}
          <span className="inline-flex items-center gap-2 self-start rounded-none border-2 border-primary bg-primary/10 px-3 py-1 text-xs font-bold font-mono text-primary uppercase mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            {isLogin ? "Welcome back" : "Join the studio"}
          </span>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl font-heading tracking-tight leading-[0.9] mb-2">
            {isLogin ? (
              <>Sign in to<br /><span className="text-primary">Kus Studio.</span></>
            ) : (
              <>Start your<br /><span className="text-primary">Sneaker Journey.</span></>
            )}
          </h1>
          <p className="text-sm text-muted-foreground font-medium mb-10">
            {isLogin
              ? "Enter your credentials to access the 3D customizer."
              : "Create an account to scan, design, and produce your shoes."}
          </p>

          {/* Mode tabs */}
          <div className="flex border-2 border-foreground mb-8 self-start">
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase font-mono transition-all ${
                isLogin ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-muted"
              }`}
            >
              <LogIn className="h-3.5 w-3.5" /> Login
            </button>
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold uppercase font-mono transition-all ${
                !isLogin ? "bg-foreground text-background" : "bg-background text-foreground hover:bg-muted"
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" /> Register
            </button>
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="flex flex-col gap-5 w-full max-w-md">
            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => onNameChange(e.target.value)}
                  required
                  minLength={1}
                  placeholder="John Doe"
                  className={inputClass}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => onEmailChange(e.target.value)}
                required
                placeholder="you@example.com"
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => onPasswordChange(e.target.value)}
                  required
                  minLength={isLogin ? 1 : 8}
                  placeholder={isLogin ? "••••••••" : "Min 8 characters"}
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  title={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Status message */}
            {statusMessage && statusMessage !== "Ready" && (
              <p className={`text-xs font-mono font-bold uppercase tracking-wider ${
                ["error", "invalid", "fail", "expired"].some((w) => statusMessage.toLowerCase().includes(w))
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}>
                {statusMessage}
              </p>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center gap-2 border-2 border-primary bg-primary px-8 py-3.5 text-sm font-bold uppercase text-primary-foreground glow-orange disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isBusy ? "Loading…" : isLogin ? "Sign In" : "Create Account"}
                {!isBusy && <ArrowRight className="h-4 w-4" />}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={onDemoAuth}
                className="inline-flex items-center gap-2 border-2 border-foreground bg-background px-6 py-3.5 text-sm font-bold uppercase text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[4px_4px_0_oklch(0.15_0_0)]"
              >
                Try Demo
              </button>
            </div>
          </form>

          {/* Switch mode */}
          <p className="mt-8 text-xs font-mono text-muted-foreground">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => onModeChange(isLogin ? "register" : "login")}
              className="font-bold text-primary uppercase underline underline-offset-2 hover:text-primary-glow"
            >
              {isLogin ? "Register" : "Sign In"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

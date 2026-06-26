import { type FormEvent, useState } from "react";
import { ArrowLeft, ArrowRight, Eye, EyeOff, UserPlus, LogIn, Sparkles } from "lucide-react";
import logo from "@/assets/logo.png";
import introVideo from "@/assets/intro_choice.mp4";
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
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const handleModeChange = (newMode: "login" | "register") => {
    setLocalError("");
    setConfirmPassword("");
    onModeChange(newMode);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError("");
    if (!isLogin && password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }
    onSubmit(e);
  };

  const displayStatus = localError || (statusMessage && statusMessage !== "Ready" ? statusMessage : "");

  return (
    <div className="kus-landing h-screen max-h-[100dvh] bg-background text-foreground flex flex-col overflow-hidden">
      {/* ── Main split: visual LEFT, form RIGHT ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left — visual panel (hidden on mobile) */}
        <div className="hidden lg:flex flex-col lg:w-[70%] relative border-r-2 border-foreground overflow-hidden bg-black">
          {/* Desktop Back button */}
          <button
            type="button"
            onClick={onBack}
            className="absolute top-8 left-8 z-50 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold font-mono uppercase border-2 border-foreground bg-background text-foreground shadow-[4px_4px_0_oklch(0.15_0_0)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_oklch(0.15_0_0)] transition-all"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {/* Slightly dark background with faint dots */}
          <div className="absolute inset-0 bg-zinc-900" />
          <div 
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)",
              backgroundSize: "24px 24px"
            }}
          />

          {/* Video */}
          <div className="relative flex-1 grid place-items-center z-10 overflow-hidden">
            <video
              src={introVideo}
              autoPlay
              loop
              muted
              playsInline
              className="w-full max-w-[1000px] object-contain opacity-90"
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
        <div className="flex flex-col justify-center w-full lg:w-[30%] px-6 sm:px-10 py-6 overflow-y-auto custom-scrollbar relative">

          {/* Mobile Back Button */}
          <button
            type="button"
            onClick={onBack}
            className="lg:hidden self-start inline-flex items-center gap-2 mb-6 text-xs font-bold font-mono uppercase text-foreground hover:text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {/* Badge */}
          <span className="inline-flex items-center gap-2 self-start rounded-none border-2 border-primary bg-primary/10 px-3 py-1 text-xs font-bold font-mono text-primary uppercase mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            {isLogin ? "Welcome back" : "Join the studio"}
          </span>

          {/* Heading */}
          <h1 className="text-3xl sm:text-4xl font-heading tracking-tight leading-[0.9] mb-2">
            {isLogin ? (
              <>Sign in to<br /><span className="text-primary">Kus Studio.</span></>
            ) : (
              <>Start your<br /><span className="text-primary">Sneaker Journey.</span></>
            )}
          </h1>
          <p className="text-xs text-muted-foreground font-medium mb-6">
            {isLogin
              ? "Enter your credentials to access the 3D customizer."
              : "Create an account to scan, design, and produce your shoes."}
          </p>

          {/* Social login */}
          <button
            type="button"
            className="w-full max-w-md inline-flex items-center justify-center gap-3 border-2 border-foreground bg-background px-6 py-3 text-sm font-bold uppercase transition-all shadow-[4px_4px_0_oklch(0.15_0_0)] hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_oklch(0.15_0_0)] mb-4"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-4 w-full max-w-md mb-5">
            <div className="h-[2px] flex-1 bg-border" />
            <span className="text-[10px] font-mono font-bold text-muted-foreground uppercase">OR</span>
            <div className="h-[2px] flex-1 bg-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 w-full max-w-md pb-8">
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
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">
                  Password
                </label>
                {isLogin && (
                  <a href="#" className="text-xs font-mono font-bold text-primary hover:underline uppercase tracking-wider">
                    Forgot password?
                  </a>
                )}
              </div>
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

            {!isLogin && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (localError) setLocalError("");
                    }}
                    required
                    minLength={8}
                    placeholder="Repeat your password"
                    className={`${inputClass} pr-12`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    title={showConfirmPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
            )}

            {/* Status message */}
            {displayStatus && (
              <div className={`border-2 p-3 ${
                ["error", "invalid", "fail", "expired", "do not match"].some((w) => displayStatus.toLowerCase().includes(w))
                  ? "bg-red-500/10 border-red-500 text-red-500"
                  : "bg-muted/50 border-foreground text-foreground"
              }`}>
                <p className="text-xs font-mono font-bold uppercase tracking-wider">
                  {displayStatus}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="submit"
                disabled={isBusy}
                className="inline-flex items-center gap-2 border-2 border-foreground bg-primary px-8 py-3 text-sm font-bold uppercase text-primary-foreground shadow-[4px_4px_0_oklch(0.15_0_0)] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:translate-x-[-2px] hover:translate-y-[-2px] hover:shadow-[6px_6px_0_oklch(0.15_0_0)]"
              >
                {isBusy ? "Loading…" : isLogin ? "Sign In" : "Create Account"}
                {!isBusy && <ArrowRight className="h-4 w-4" />}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={onDemoAuth}
                className="inline-flex items-center gap-2 border-2 border-foreground bg-background px-6 py-3 text-sm font-bold uppercase text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                Try Demo
              </button>
            </div>
          </form>

          {/* Switch mode */}
          <p className="mt-4 pb-4 text-xs font-mono text-muted-foreground shrink-0">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => handleModeChange(isLogin ? "register" : "login")}
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

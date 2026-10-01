import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCw, Home } from "lucide-react";
import { captureError } from "../../monitoring/sentry";
import i18n from "../../i18n";
import styles from "./ErrorBoundary.module.css";

type ErrorBoundaryProps = {
  children: ReactNode;
  fallbackMessage?: string;
};

type ErrorBoundaryState = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    captureError(error, { componentStack: errorInfo.componentStack });
  }

  render() {
    if (this.state.hasError) {
      // Class component: read the i18n singleton directly instead of a hook.
      const t = (key: string) => i18n.t(`account:errorBoundary.${key}`);
      return (
        <div className={styles.screen}>
          <div className={styles.card}>
            <div className={styles.iconRing}>
              <AlertTriangle size={28} />
            </div>
            <h1 className={styles.title}>{this.props.fallbackMessage ?? t('title')}</h1>
            <p className={styles.subtitle}>
              {t('subtitle')}
            </p>

            {this.state.error?.message && (
              <div className={styles.detailsBox}>
                <span className={styles.detailsLabel}>{t('details')}</span>
                <p className={styles.detailsMessage}>{this.state.error.message}</p>
              </div>
            )}

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => window.location.reload()}
              >
                <RotateCw size={16} />
                {t('reload')}
              </button>
              <a href="/" className={styles.secondaryBtn}>
                <Home size={16} />
                {t('home')}
              </a>
            </div>

            <p className={styles.footnote}>{t('reported')}</p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

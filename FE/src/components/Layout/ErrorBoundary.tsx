import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { captureError } from "../../monitoring/sentry";

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
      return (
        <div className="viewer-empty" style={{ color: "#ef4444" }}>
          <AlertTriangle size={48} />
          <span>{this.props.fallbackMessage ?? "Something went wrong."}</span>
          <p className="muted" style={{ marginTop: "8px", fontSize: "14px" }}>
            {this.state.error?.message}
          </p>
          <button
            type="button"
            className="btn-neon-orange"
            style={{ marginTop: "16px" }}
            onClick={() => window.location.reload()}
          >
            Reload app
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

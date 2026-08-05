"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary — catches render errors in the subtree and renders a
 * fallback UI instead of crashing the entire page. Critical for production
 * stability: without this, a single buggy component takes down the whole app.
 *
 * Reports errors to console with structured metadata so they show up in
 * server logs / monitoring.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Structured error log — surfaces in both dev console and prod logs.
    const entry = {
      ts: new Date().toISOString(),
      level: "error",
      message: "React render error caught by ErrorBoundary",
      error: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    };
    console.error(JSON.stringify(entry));
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="m-8 rounded-2xl border-2 border-red-200 bg-red-50 p-8"
        >
          <h2 className="text-xl font-bold text-red-900">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-700">
            We hit an unexpected error rendering this section. The issue has been logged.
          </p>
          {this.state.error && (
            <pre className="mt-4 max-h-48 overflow-auto rounded-lg bg-red-100 p-3 text-xs text-red-800">
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

"use client";

import React from "react";
import { addLog, downloadLog, logger } from "../lib/error-logger";
import { I18nContext } from "../lib/i18n";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    addLog({
      type: "error",
      message: `ErrorBoundary: React render error — ${error.message}`,
      stack: `${error.stack || ""}\nComponent stack:\n${errorInfo.componentStack || ""}`,
    });
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleDownloadLog = () => {
    try {
      downloadLog();
    } catch { logger.error("downloadLog failed");
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <I18nContext.Consumer>
          {({ t }) => (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: 40,
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            color: "var(--theme-text)",
            backgroundColor: "var(--theme-bg-alt)",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <h1
              style={{
                fontSize: 72,
                fontWeight: 700,
                color: "var(--theme-danger)",
                margin: "0 0 16px 0",
              }}
            >
              !
            </h1>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 600,
                margin: "0 0 8px 0",
                color: "var(--theme-text)",
              }}
            >
              {t("err.title")}
            </h2>
            <p
              style={{
                fontSize: 14,
                color: "var(--theme-text-muted)",
                margin: "0 0 12px 0",
                lineHeight: 1.6,
              }}
            >
              {t("err.desc")}
            </p>
            {this.state.error && (
              <pre
                style={{
                  textAlign: "left",
                  fontSize: 11,
                  color: "var(--theme-text-dim)",
                  backgroundColor: "var(--theme-surface-hover)",
                  padding: 12,
                  borderRadius: 6,
                  maxHeight: 120,
                  overflow: "auto",
                  margin: "0 0 20px 0",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}
              >
                {this.state.error.message}
              </pre>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
              <button
                onClick={this.handleReset}
                style={{
                  padding: "8px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "none",
                  borderRadius: 6,
                  backgroundColor: "var(--theme-primary)",
                  color: "var(--theme-text-inverse)",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--theme-primary)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = "var(--theme-primary)")
                }
              >
                {t("err.retry")}
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: "8px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "2px solid var(--theme-border-input)",
                  borderRadius: 6,
                  backgroundColor: "var(--theme-surface)",
                  color: "var(--theme-text)",
                  cursor: "pointer",
                }}
              >
                {t("err.reload")}
              </button>
              <button
                onClick={this.handleDownloadLog}
                style={{
                  padding: "8px 24px",
                  fontSize: 14,
                  fontWeight: 600,
                  border: "2px solid var(--theme-warning)",
                  borderRadius: 6,
                  backgroundColor: "var(--theme-surface)",
                  color: "var(--theme-text)",
                  cursor: "pointer",
                }}
              >
                {t("err.exportLog")}
              </button>
            </div>
          </div>
        </div>
          )}
        </I18nContext.Consumer>
      );
    }

    return this.props.children;
  }
}

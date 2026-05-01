/**
 * src/lib/errorBoundary.tsx
 *
 * Drop-in replacement for your existing ErrorBoundary.
 * Uses Sentry's withErrorBoundary HOC so crashes are automatically reported.
 *
 * Usage (already in App.tsx):
 *   import { ErrorBoundary } from '@/lib/errorBoundary';
 *   <ErrorBoundary> ... </ErrorBoundary>
 */

import * as Sentry from '@sentry/react';
import { Component, type ReactNode, type ErrorInfo } from 'react';

// ── Fallback UI ───────────────────────────────────────────────────────────────

function ErrorFallback({
  error,
  resetError,
}: {
  error: Error;
  resetError: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        padding: '2rem',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: '50%',
          background: '#FAECE7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        ⚠
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 500, margin: 0 }}>
        Something went wrong
      </h1>

      <p
        style={{
          fontSize: 14,
          color: '#888780',
          textAlign: 'center',
          maxWidth: 360,
          margin: 0,
        }}
      >
        An unexpected error occurred. It has been reported automatically.
      </p>

      {import.meta.env.DEV && (
        <pre
          style={{
            fontSize: 12,
            background: '#F1EFE8',
            padding: '12px 16px',
            borderRadius: 8,
            maxWidth: 480,
            overflow: 'auto',
            color: '#993C1D',
          }}
        >
          {error.message}
        </pre>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={resetError}
          style={{
            fontSize: 14,
            padding: '8px 20px',
            borderRadius: 8,
            border: '0.5px solid #B4B2A9',
            background: 'transparent',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
        <button
          onClick={() => (window.location.href = '/dashboard')}
          style={{
            fontSize: 14,
            padding: '8px 20px',
            borderRadius: 8,
            border: '0.5px solid #5DCAA5',
            background: '#E1F5EE',
            color: '#0F6E56',
            cursor: 'pointer',
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}

// ── Sentry-wrapped boundary ───────────────────────────────────────────────────

const SentryErrorBoundary = Sentry.withErrorBoundary(
  ({ children }: { children: ReactNode }) => <>{children}</>,
  {
    fallback: ({ error, resetError }) => (
      <ErrorFallback error={error as Error} resetError={resetError} />
    ),
    showDialog: false,
  }
);

// ── Fallback plain boundary (used when Sentry not initialised) ────────────────

class PlainErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

/**
 * Use this everywhere — it auto-selects Sentry boundary in production,
 * plain boundary in dev (avoids Sentry noise during development).
 */
export function ErrorBoundary({ children }: { children: ReactNode }) {
  if (import.meta.env.MODE === 'production') {
    return <SentryErrorBoundary>{children}</SentryErrorBoundary>;
  }
  return <PlainErrorBoundary>{children}</PlainErrorBoundary>;
}
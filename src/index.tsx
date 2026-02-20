import * as Sentry from '@sentry/electron/renderer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n'; // Initialize i18n
import App from '@/App';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { UserActionableError, isTransientError } from '@/services/utils/errors';

// Initialize Sentry for error tracking in Renderer process
// Only init if main process has Sentry (requires VITE_SENTRY_DSN).
// Without it, sentry-ipc:// protocol is never registered and every
// breadcrumb triggers a console error.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    release: __APP_VERSION__,
    beforeSend(event, hint) {
      const originalException = hint.originalException;
      if (!originalException) return event;

      const isErrorLike =
        originalException instanceof Error || typeof originalException === 'object';
      if (!isErrorLike) return event;

      if ((originalException as any).isExpected === true) return null;
      if (originalException instanceof UserActionableError) return null;
      if (isTransientError(originalException)) return null;

      return event;
    },
  });
  console.log(`[Renderer] Sentry initialized with release: ${__APP_VERSION__}`);
} else {
  console.log(`[Renderer] Sentry disabled (no DSN)`);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root mount element not found');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

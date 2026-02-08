import * as Sentry from '@sentry/electron/renderer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './i18n'; // Initialize i18n
import App from '@/App';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { UserActionableError, isTransientError } from '@/services/utils/errors';

// Initialize Sentry for error tracking in Renderer process
Sentry.init({
  release: __APP_VERSION__,
  beforeSend(event, hint) {
    const originalException = hint.originalException;
    if (!originalException) return event;

    const isErrorLike = originalException instanceof Error || typeof originalException === 'object';
    if (!isErrorLike) return event;

    // ExpectedError filter (existing)
    if ((originalException as any).isExpected === true) return null;

    // Safety net: User-actionable errors (config/region) — already filtered at
    // capture points, but catches any that leak through
    if (originalException instanceof UserActionableError) return null;

    // Safety net: Transient/cancellation errors — network failures, 500/503/504, etc.
    if (isTransientError(originalException)) return null;

    return event;
  },
});
console.log(`[Renderer] Sentry initialized with release: ${__APP_VERSION__}`);

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

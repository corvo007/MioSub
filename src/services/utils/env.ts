/**
 * Environment detection utilities
 */

/**
 * Check if running in Electron environment
 * @returns true if in Electron, false if in Web browser
 */
export const isElectron = (): boolean => {
  return !!(window as any).electronAPI?.isElectron;
};

/**
 * Safely get environment variable, respecting Electron restrictions.
 * In Electron, we do NOT want to read API keys from process.env or window.env
 * to ensure users use the settings configuration.
 */
export const getEnvVariable = (key: string): string | undefined => {
  if (isElectron()) {
    return undefined;
  }

  // In Web environment, check window.env first (injected by runtime), then process.env
  const windowEnv = typeof window !== 'undefined' ? (window as any).env : undefined;
  return windowEnv?.[key] || process.env[key] || process.env[`REACT_APP_${key}`];
};

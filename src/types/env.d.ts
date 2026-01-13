/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

declare namespace NodeJS {
  interface ProcessEnv {
    COMMIT_HASH?: string;
    DEBUG_BUILD?: string;
  }
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the deployed API, e.g. https://agps-api.onrender.com/api
   * Set ONLY in the production host's environment (Vercel).
   * Left undefined locally so requests fall through to the Vite dev proxy.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

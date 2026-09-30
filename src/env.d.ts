/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_MAX_SYNC_TABS: string;
  readonly VITE_AUTO_SYNC_INTERVAL_SECONDS: string;
  readonly VITE_ENABLE_SHARING: string;
  /** Opt-in: show Google Drive stub export in the workspace tree. Default off. */
  readonly VITE_ENABLE_DRIVE_CONNECTOR: string;
  /** Opt-in: show Confluence/Notion wiki sync UI and token fields. Default off. */
  readonly VITE_ENABLE_WIKI_SYNC: string;
  readonly VITE_EMAILJS_SERVICE_ID: string;
  readonly VITE_EMAILJS_TEMPLATE_ID: string;
  readonly VITE_EMAILJS_PUBLIC_KEY: string;
  readonly VITE_FEEDBACK_EMAIL: string;
  /** Cloud Run API base URL for server invites (e.g. http://localhost:8080). */
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

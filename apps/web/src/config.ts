const env = import.meta.env;

/**
 * Build-time configuration from Vite env vars. Values are nullable so the app
 * still boots before the infrastructure exists; it then shows a setup notice
 * until the stack is configured.
 */
export interface AppConfig {
  apiBaseUrl: string | null;
  authority: string | null;
  clientId: string | null;
}

export const config: AppConfig = {
  apiBaseUrl: env.VITE_API_URL || null,
  authority: env.VITE_COGNITO_AUTHORITY || null,
  clientId: env.VITE_COGNITO_CLIENT_ID || null,
};

export function isAuthConfigured(cfg: AppConfig = config): boolean {
  return cfg.authority !== null && cfg.clientId !== null;
}

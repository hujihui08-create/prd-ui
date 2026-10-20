/**
 * A vision provider must be configured explicitly; there is no OpenAI
 * fallback. Used by the dsh adapter and the standalone model reviewer.
 */
const REQUIRED_PROVIDER_ENV = [
  "PRD_UI_VISION_BASE_URL",
  "PRD_UI_VISION_MODEL",
] as const;

export function validateProviderEnv(env: NodeJS.ProcessEnv = process.env): void {
  const missing = REQUIRED_PROVIDER_ENV.filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`CONFIGURATION_ERROR: missing ${missing.join(", ")}`);
  }
}

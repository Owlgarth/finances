// Deploy-time runtime config, read from window.__APP_CONFIG__.
//
// The deployed ui container generates /config.js at startup from the
// API_URL / DEMO_MODE environment variables, and index.html loads it
// before the bundle. The file does not exist on the Vite dev server -
// that 404 is expected, and reads below fall through to the Vite env
// vars and then hard-coded defaults.

/** Shape written by /config.js. Both keys are always present when the
 *  file loaded; the container defaults and validates both values.
 *  demoMode is the string "true" or "false". */
export interface RuntimeAppConfig {
  apiUrl: string;
  demoMode: string;
}

declare global {
  interface Window {
    __APP_CONFIG__?: RuntimeAppConfig;
  }
}

/** API URL from /config.js, or undefined when the file did not load
 *  (local dev). Callers keep the Vite env var and the localhost default
 *  behind this with an inline || chain - see client.ts - because Vite
 *  env values are baked at build time and only cover dev builds. */
export const getRuntimeApiUrl = (): string | undefined =>
  window.__APP_CONFIG__?.apiUrl;

/** Effective demo mode: runtime config wins, then VITE_DEMO_MODE, then
 *  off. The whole chain lives here, unlike the URL helper: "false" is a
 *  real value, so a runtime "false" must not fall through to the env
 *  var the way an absent URL does, and any non-empty string (including
 *  "false") is truthy - a || chain would be wrong. Call sites get a
 *  plain boolean. */
export const getRuntimeDemoMode = (): boolean => {
  const runtimeDemoMode = window.__APP_CONFIG__?.demoMode;
  if (runtimeDemoMode !== undefined) {
    return runtimeDemoMode === 'true';
  }
  return import.meta.env.VITE_DEMO_MODE === 'true';
};

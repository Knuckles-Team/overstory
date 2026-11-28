/**
 * The deliberately narrow, build-time posture for the local Arbora City
 * sandbox. It never applies to a served deployment: Vite substitutes the
 * flag at build time, and callers must opt in with exactly `1`.
 */
export function isCitySandbox(
  value: string | undefined = import.meta.env.VITE_CITY_SANDBOX,
  hostname = typeof window === 'undefined' ? '' : window.location.hostname,
): boolean {
  return import.meta.env.DEV && value === '1' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

/** Only the city page may bypass the normal identity requirement locally. */
export function isAnonymousCitySandboxRoute(routeId: string | undefined, enabled = isCitySandbox()): boolean {
  return enabled && routeId === 'apps.city'
}

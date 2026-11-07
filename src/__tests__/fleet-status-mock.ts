/**
 * Test double for the Arbora transport behind `listFleetServices()`.
 *
 * Callers keep describing the live catalog as the response a service list
 * would have had (an array of names, an error status, a malformed body); this
 * maps it onto the `/auth/session` + `/api/v1/ops/fleet.status` exchange.
 */
const META = { registry_digest: 'digest', api_version: 'v1' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

/** Answer a session or fleet.status request, or return null for any other URL. */
export async function fleetStatusResponse(url: string, services: () => Response): Promise<Response | null> {
  if (url.includes('/auth/session')) return json({ authenticated: true, csrf_token: 'csrf-test' })
  if (!url.includes('/api/v1/ops/fleet.status')) return null
  const source = services()
  if (!source.ok) {
    const error = { code: 'UNAVAILABLE', source: 'arbora', message: 'refused', retryable: false }
    return json({ ok: false, error, meta: META }, source.status)
  }
  const body: unknown = await source.json()
  const result = Array.isArray(body)
    ? { value: { children: Object.fromEntries(body.map((name: string) => [name, {}])) } }
    : body
  return json({ ok: true, result, meta: META })
}

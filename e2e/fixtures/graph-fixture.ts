import type { Page, Route } from '@playwright/test'
import { responses } from './documentation-screenshots.mjs'

/** One synthetic engine behind the Arbora operation route. Nothing here is a real account or a real graph. */
export interface FixtureOptions {
  /** Base graph served by the node and relationship reads. */
  nodes?: { id: string; type: string; name?: string }[]
  edges?: { source: string; target: string; type: string }[]
  totalNodes?: number
  denied?: Set<string>
  /** Operation handlers keyed by operation id. */
  ops?: Record<string, (params: Record<string, unknown>) => unknown>
}

export const CLASSES = {
  composed_digest: 'fixture-digest',
  next_cursor: null,
  terms: [
    { iri: 'urn:fx:Thing', kind: 'class', local_name: 'Thing' },
    { iri: 'urn:fx:Person', kind: 'class', local_name: 'Person', parents: ['urn:fx:Thing'] },
    { iri: 'urn:fx:Employee', kind: 'class', local_name: 'Employee', parents: ['urn:fx:Person'] },
    { iri: 'urn:fx:Org', kind: 'class', local_name: 'Org' },
    { iri: 'urn:fx:Place', kind: 'class', local_name: 'Place' },
  ],
}

export const hubFixture = (neighbors: number) => {
  const nodes = [
    { id: 'hub', type: 'Person', name: 'Hub' },
    { id: 'emp', type: 'Employee', name: 'Employee' },
    { id: 'org', type: 'Org', name: 'Org' },
    { id: 'place', type: 'Place', name: 'Place' },
  ]
  const edges = [
    { source: 'hub', target: 'emp', type: 'manages' },
    { source: 'hub', target: 'org', type: 'memberOf' },
    { source: 'org', target: 'place', type: 'locatedIn' },
  ]
  const returned = Array.from({ length: Math.min(25, neighbors) }, (_, i) => ({
    id: `nb${String(i)}`,
    properties: { name: `Neighbor ${String(i)}`, node_type: 'Person' },
  }))
  return {
    nodes,
    edges,
    neighborhood: {
      nodes: returned,
      edges: returned.map((n) => ({ source: 'hub', target: n.id, properties: { relationship: 'knows' } })),
      hidden: [{ node_id: 'hub', count: neighbors - returned.length }],
      next_cursor: null,
      truncated: true,
      graph_revision: 1,
    },
  }
}

const ORIGIN = 'http://127.0.0.1:5231'
const meta = { registry_digest: 'fixture', api_version: '1' }

export async function serveFixture(page: Page, options: FixtureOptions): Promise<{ calls: string[] }> {
  const calls: string[] = []
  const nodes = options.nodes ?? []
  await page.route('**/*', async (route: Route) => {
    const url = new URL(route.request().url())
    if (url.origin !== ORIGIN) {
      return route.abort('blockedbyclient')
    }
    const p = url.pathname
    if (p.startsWith('/api/enhanced/graph/')) {
      if (p.endsWith('/nodes'))
        return route.fulfill({
          json: nodes.map((n) => ({ id: n.id, labels: [n.type], properties: { name: n.name ?? n.id } })),
        })
      if (p.endsWith('/relationships')) return route.fulfill({ json: options.edges ?? [] })
      if (p.endsWith('/stats'))
        return route.fulfill({
          json: {
            total_nodes: options.totalNodes ?? nodes.length,
            total_relationships: (options.edges ?? []).length,
            available: true,
          },
        })
      if (p.endsWith('/node-types')) {
        const by: Record<string, number> = {}
        for (const n of nodes) by[n.type] = (by[n.type] ?? 0) + 1
        return route.fulfill({
          json: {
            by_type: by,
            type_count: Object.keys(by).length,
            total_typed_nodes: nodes.length,
            available: true,
            truncated: false,
            partial: false,
            source_graphs: ['fixture'],
            degraded_graphs: [],
          },
        })
      }
    }
    if (p.startsWith('/api/v1/ops/')) {
      const op = p.slice('/api/v1/ops/'.length)
      const known = responses[p as keyof typeof responses]
      if (known !== undefined) return route.fulfill({ json: known })
      calls.push(op)
      if (options.denied?.has(op)) {
        return route.fulfill({
          status: 403,
          json: { ok: false, error: { code: 'FORBIDDEN', source: 'arbora', message: 'denied', retryable: false }, meta },
        })
      }
      const handler = options.ops?.[op]
      if (!handler) {
        return route.fulfill({
          status: 404,
          json: { ok: false, error: { code: 'OPERATION_NOT_FOUND', source: 'arbora', message: 'absent', retryable: false }, meta },
        })
      }
      const params = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
      return route.fulfill({ json: { ok: true, result: handler(params), meta } })
    }
    const json = responses[p as keyof typeof responses]
    if (json !== undefined) return route.fulfill({ json })
    if (p.startsWith('/api/') || p.startsWith('/auth/')) return route.fulfill({ status: 501, json: { detail: 'Not in fixture' } })
    return route.continue()
  })
  await page.routeWebSocket('**/*', (socket) => socket.close())
  return { calls }
}

export async function openGraph(page: Page, probe = true): Promise<void> {
  await page.addInitScript((enable) => {
    localStorage.clear()
    sessionStorage.clear()
    localStorage.setItem('pydantic-chat-ui-theme', 'light')
    localStorage.setItem('overstory.consent-dismissed', 'overstory-consent-v1')
    ;(window as unknown as { __OVERSTORY_GRAPH_PROBE__: boolean }).__OVERSTORY_GRAPH_PROBE__ = enable
  }, probe)
  await page.goto('/workspace/explore?q=retained&entity=evidence-a&tool=history&lens=graph')
}

// spec: OVERSTORY-APPS-R030.10.9
// spec: OVERSTORY-APPS-R030.11.6
// spec: OVERSTORY-APPS-R030.12.6
// spec: OVERSTORY-APPS-R030.13.5
// Offline browser tests with a synthetic fixture engine at the network layer. The served acceptance of
// these rows (real host, real Arbora, real engine) waits for eg.graph.GetNeighborhood to be served.
import { expect, test, type Page } from '@playwright/test'
import { CLASSES, hubFixture, openGraph, serveFixture } from './fixtures/graph-fixture'

interface Probe {
  ids: () => string[]
  positions: () => Record<string, { x: number; y: number; size: number; alpha: number }>
  running: () => boolean
  select: (id: string) => void
  collapse: (id: string) => void
  class: (id: string) => string | null
  overlay: () => { colors: Record<string, string> | null; rings: Record<string, string> | null; pathProgress: number[] | null }
  pathEnd: (id: string) => void
}
type Positions = Record<string, { x: number; y: number; size: number; alpha: number }>
interface Metric {
  kind: string
  frames: number
  p95FrameMs: number
  droppedFrames: number
  nodesAnimated: number
}

const openOverlays = async (page: Page) => {
  await page.getByTestId('graph-overlay-menu').getByText('Overlays', { exact: true }).click()
}

const waitReady = async (page: Page, count: number) => {
  await page.waitForFunction(
    (n) => {
      const probe = (window as unknown as { __overstoryGraphProbe?: Probe }).__overstoryGraphProbe
      return !!probe && probe.ids().length === n && !probe.running()
    },
    count,
    { timeout: 30_000 },
  )
}

/** Snapshot every node on each animation frame for `ms` milliseconds. */
const sampleFrames = (page: Page, ms: number) =>
  page.evaluate(async (duration) => {
    const probe = (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
    const frames: { t: number; positions: Positions }[] = []
    const start = performance.now()
    while (performance.now() - start < duration) {
      const t = await new Promise<number>((resolve) => requestAnimationFrame(resolve))
      frames.push({ t, positions: probe.positions() })
    }
    return frames
  }, ms)

const metrics = (page: Page) =>
  page.evaluate(() => (window as unknown as { __graphMotionMetrics?: Metric[] }).__graphMotionMetrics ?? [])

const hub = hubFixture(200)
const engine = {
  nodes: hub.nodes,
  edges: hub.edges,
  ops: {
    'eg.reasoning.GraphSchemaClasses': () => CLASSES,
    'eg.graph.GetNeighborhood': () => hub.neighborhood,
  },
}

test.describe('animated graph exploration', () => {
  test('click_hub_grows_over_frames_and_collapse_restores', async ({ page }, info) => {
    await serveFixture(page, engine)
    await openGraph(page)
    await waitReady(page, 4)
    const before = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.ids().sort())

    await page.evaluate(() => {
      ;(window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.select('hub')
    })
    const frames = await sampleFrames(page, 1800)
    const grownFrames = frames.filter((f) => f.positions.nb0 !== undefined)
    // New nodes move across at least 3 distinct frames: growth, not a pop.
    const xs = new Set(grownFrames.map((f) => Math.round(f.positions.nb12?.x ?? NaN)))
    xs.delete(NaN)
    expect(xs.size).toBeGreaterThanOrEqual(3)
    const sizes = new Set(grownFrames.map((f) => Math.round((f.positions.nb12?.size ?? 0) * 10)))
    expect(sizes.size).toBeGreaterThanOrEqual(3)
    // Stagger: a later neighbor starts after an earlier one.
    const firstVisible = (id: string) => grownFrames.findIndex((f) => (f.positions[id]?.alpha ?? 0) > 0.05)
    expect(firstVisible('nb24')).toBeGreaterThan(firstVisible('nb0'))

    const after = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.ids())
    expect(after).toHaveLength(4 + 25)
    // The badge shows the hidden count the engine reported.
    await expect(page.getByTestId('graph-live-region')).toHaveText('Expanded Hub: 25 added, 175 hidden')

    const frameMs = frames.slice(1).map((f, i) => f.t - frames[i].t)
    const sorted = [...frameMs].sort((a, b) => a - b)
    const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
    const expand = (await metrics(page)).filter((m) => m.kind === 'expand')
    expect(expand.length).toBeGreaterThan(0)
    expect(expand[0].frames).toBeGreaterThan(2)
    console.log('FRAME-TIMING', JSON.stringify({ browserFrames: frameMs.length, browserP95FrameMs: p95, controllerMetrics: expand }))
    await info.attach('frame-timing-expand.json', {
      contentType: 'application/json',
      body: JSON.stringify({ browserFrames: frameMs.length, browserP95FrameMs: p95, controllerMetrics: expand, device: 'headless chromium, software GL, no reference device' }, null, 2),
    })

    await page.getByTestId('graph-collapse').click()
    await page.waitForFunction(() => {
      const probe = (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
      return probe.ids().length === 4 && !probe.running()
    })
    const restored = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.ids().sort())
    expect(restored).toEqual(before)
  })

  test('interrupting_a_transition_does_not_jump', async ({ page }) => {
    await serveFixture(page, engine)
    await openGraph(page)
    await waitReady(page, 4)
    await page.evaluate(() => {
      ;(window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.select('hub')
    })
    await page.waitForFunction(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.ids().length === 29)
    await page.waitForTimeout(120)
    const jump = await page.evaluate(async () => {
      const probe = (window as unknown as { __overstoryGraphProbe: Probe & { graphPositions: () => Record<string, { x: number; y: number }> } }).__overstoryGraphProbe
      const next = () => new Promise((r) => requestAnimationFrame(r))
      await next()
      const f0 = probe.graphPositions()
      await next()
      const f1 = probe.graphPositions()
      probe.collapse('hub')
      await next()
      const f2 = probe.graphPositions()
      // Compare the step across the interruption with the step the motion was already taking.
      let worst = 0
      for (const id of Object.keys(f1)) {
        if (!f0[id] || !f2[id]) continue
        const before = Math.hypot(f1[id].x - f0[id].x, f1[id].y - f0[id].y)
        const across = Math.hypot(f2[id].x - f1[id].x, f2[id].y - f1[id].y)
        worst = Math.max(worst, across - 2 * before)
      }
      return worst
    })
    expect(jump).toBeLessThan(2)
  })

  test('reduced_motion_shows_the_final_state_in_one_frame', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://127.0.0.1:5231' })
    const page = await context.newPage()
    await serveFixture(page, engine)
    await openGraph(page)
    await waitReady(page, 4)
    await page.evaluate(() => {
      ;(window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.select('hub')
    })
    await expect(page.getByTestId('graph-live-region')).toHaveText('Expanded Hub: 25 added, 175 hidden')
    await page.waitForFunction(() => ((window as unknown as { __graphMotionMetrics?: Metric[] }).__graphMotionMetrics ?? []).some((m) => m.kind === 'expand'))
    const expand = (await metrics(page)).filter((m) => m.kind === 'expand')
    expect(expand.at(-1)?.frames).toBe(1)
    const positions = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.positions())
    expect(positions.nb3.alpha).toBe(1)
    expect(positions.nb3.size).toBeGreaterThan(5)
    await context.close()
  })

  test('legend_toggle_and_schema_unavailable', async ({ page, browser }) => {
    await serveFixture(page, engine)
    await openGraph(page)
    await waitReady(page, 4)
    // Three root classes and one subclass chain: Employee rolls up to the Person root slot and shape.
    await page.waitForFunction(() => {
      const probe = (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
      return probe.class('hub') === probe.class('emp')
    })
    const shapes = await page.evaluate(() => {
      const probe = (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
      return Object.fromEntries(probe.ids().map((id) => [id, probe.class(id)]))
    })
    expect(shapes.hub).toBe(shapes.emp)
    expect(new Set([shapes.hub, shapes.org, shapes.place]).size).toBe(3)
    const legend = page.getByTestId('graph-legend')
    await expect(legend.getByRole('button', { name: 'Person, 1 node, shown' })).toBeVisible()
    await legend.getByRole('button', { name: /^Org, 1 node, shown/ }).click()
    await page.waitForFunction(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.positions().org.alpha < 0.05)
    await legend.getByRole('button', { name: /^Org, 1 node, hidden/ }).click({ modifiers: ['Alt'] })
    await page.waitForFunction(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.positions().hub.alpha < 0.05)
    await expect(page.getByTestId('graph-classes-notice')).toHaveCount(0)

    // With the schema operation denied the view says so and colors by type.
    const second = await browser.newPage({ baseURL: 'http://127.0.0.1:5231' })
    await serveFixture(second, { ...engine, denied: new Set(['eg.reasoning.GraphSchemaClasses']) })
    await openGraph(second)
    await waitReady(second, 4)
    await expect(second.getByTestId('graph-classes-notice')).toHaveText('Class hierarchy unavailable')
    await second.close()
  })

  test('each_overlay_matches_the_engine_answer', async ({ page }) => {
    const answers = {
      community: { communities: { hub: 0, emp: 0, org: 1, place: 1 } },
      scores: [['hub', 0.5], ['emp', 0.1], ['org', 0.3], ['place', 0.1]],
      path: { path: ['hub', 'org', 'place'] },
      shape: [{ id: 'hub', verdict: 'pass' }, { id: 'org', verdict: 'warn' }, { id: 'place', verdict: 'fail' }],
    }
    await serveFixture(page, {
      ...engine,
      ops: {
        ...engine.ops,
        'eg.compute.CommunityDetection': () => answers.community,
        'eg.compute.PageRank': () => ({ scores: answers.scores }),
        'eg.compute.GetShortestPath': () => answers.path,
        'query.uql': () => ({ rows: answers.shape }),
      },
      denied: new Set(),
    })
    await openGraph(page)
    await waitReady(page, 4)
    await openOverlays(page)
    await page.getByTestId('graph-overlay-community').click()
    await expect(page.getByTestId('graph-overlay-community')).toHaveAttribute('aria-pressed', 'true')
    const colors = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.overlay().colors)
    expect(colors?.hub).toBe(colors?.emp)
    expect(colors?.org).toBe(colors?.place)
    expect(colors?.hub).not.toBe(colors?.org)
    await page.getByTestId('graph-overlay-community').click()

    await page.getByTestId('graph-overlay-centrality').click()
    await expect(page.getByTestId('graph-overlay-centrality')).toHaveAttribute('aria-pressed', 'true')
    const steps = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.overlay().colors)
    expect(steps?.hub).not.toBe(steps?.emp)

    await page.getByTestId('graph-overlay-shape').click()
    await expect(page.getByTestId('graph-overlay-shape')).toHaveAttribute('aria-pressed', 'true')
    const rings = await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.overlay().rings)
    expect(rings).toEqual({ hub: 'pass', org: 'warn', place: 'fail' })

    // The path reveals one edge after another across frames.
    await page.evaluate(() => {
      const probe = (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
      probe.select('hub')
      probe.pathEnd('place')
    })
    await expect(page.getByTestId('graph-overlay-path')).toBeEnabled()
    const progress: number[][] = []
    const sampler = page.evaluate(async () => {
      const probe = (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe
      const out: number[][] = []
      const start = performance.now()
      while (performance.now() - start < 4000) {
        await new Promise((r) => requestAnimationFrame(r))
        const p = probe.overlay().pathProgress
        if (p) out.push([...p])
      }
      return out
    })
    await page.getByTestId('graph-overlay-path').click()
    progress.push(...(await sampler))
    expect(progress.length).toBeGreaterThan(3)
    // Edge 0 completes before edge 1 has progressed past its start.
    const firstSecond = progress.findIndex((p) => p[1] > 0.05)
    const firstDone = progress.findIndex((p) => p[0] >= 1)
    expect(firstDone).toBeLessThanOrEqual(firstSecond)
    expect(progress.at(-1)).toEqual([1, 1])
  })

  test('refusal_for_a_denied_principal_keeps_the_prior_look', async ({ page }) => {
    await serveFixture(page, { ...engine, denied: new Set(['eg.compute.CommunityDetection']) })
    await openGraph(page)
    await waitReady(page, 4)
    await openOverlays(page)
    await page.getByTestId('graph-overlay-community').click()
    await expect(page.getByTestId('graph-overlay-community-reason')).toHaveText('Refused: FORBIDDEN')
    expect(await page.evaluate(() => (window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.overlay().colors)).toBeNull()
  })

  test('report_records_the_five_measures', async ({ page }, info) => {
    const n = 2000
    const nodes = Array.from({ length: n }, (_, i) => ({ id: `s${String(i)}`, type: ['Person', 'Org', 'Place'][i % 3] }))
    const edges = Array.from({ length: n * 3 }, (_, i) => ({
      source: `s${String(i % n)}`,
      target: `s${String((i * 7 + 13) % n)}`,
      type: `r${String(i % 5)}`,
    }))
    await serveFixture(page, { nodes, edges, totalNodes: n, ops: { 'eg.reasoning.GraphSchemaClasses': () => CLASSES } })
    const start = Date.now()
    await openGraph(page)
    await page.waitForFunction(() => {
      const probe = (window as unknown as { __overstoryGraphProbe?: Probe }).__overstoryGraphProbe
      return !!probe && probe.ids().length > 0
    }, undefined, { timeout: 60_000 })
    const firstPaintMs = Date.now() - start
    await page.waitForFunction(() => !(window as unknown as { __overstoryGraphProbe: Probe }).__overstoryGraphProbe.running(), undefined, { timeout: 60_000 })
    const settleMs = Date.now() - start
    // Pan and zoom frame times.
    await page.mouse.move(400, 300)
    const frameMs = await page.evaluate(async () => {
      const out: number[] = []
      let last = performance.now()
      for (let i = 0; i < 90; i++) {
        const t = await new Promise<number>((r) => requestAnimationFrame(r))
        out.push(t - last)
        last = t
      }
      return out
    })
    const sorted = [...frameMs].sort((a, b) => a - b)
    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null)
    const report = {
      fixture: { nodes: n, edges: n * 3 },
      firstPaintMs,
      layoutSettleMs: settleMs,
      idleP95FrameMs: sorted[Math.floor(sorted.length * 0.95)],
      heapMB: heap === null ? null : Math.round(heap / 1048576),
      device: 'headless chromium, software GL, no reference device',
      note: 'The 10,000 and 50,000 node reports need the reference device of OVERSTORY-DESIGN-R010.',
    }
    console.log('SCALE-REPORT', JSON.stringify(report))
    await info.attach('scale-report.json', { contentType: 'application/json', body: JSON.stringify(report, null, 2) })
    expect(report.firstPaintMs).toBeLessThan(60_000)
  })
})

import { expect, test } from '@playwright/test'

test.describe('Arbora City production world', () => {
  test('captures the coastal overview and records browser frame timing', async ({ page }, info) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/apps/city?demo=1')
    await page.waitForFunction(() => !!window.__cityFidelity, undefined, { timeout: 30_000 })

    const gpu = await page.evaluate(() => window.__cityFidelity!.gpu())
    test.skip(gpu === 'no-webgl', 'The visual release gate requires a WebGL-capable browser.')

    await page.evaluate(() => window.__cityFidelity!.capture('overview'))
    const audits = await page.evaluate(() => window.__cityFidelity!.audits())
    await info.attach('city-live-audits.json', {
      body: JSON.stringify(audits, null, 2),
      contentType: 'application/json',
    })
    expect(audits.ok, JSON.stringify(audits)).toBe(true)
    expect(audits.material.ok).toBe(true)
    expect(audits.density.ok).toBe(true)
    await page.screenshot({ path: info.outputPath('city-coastal-overview-day.png'), animations: 'disabled' })

    // Overview alone can hide toy-scale furniture and facade gaps.  These
    // two deterministic viewpoints keep the public realm and the active
    // connector district under the same browser-rendered visual gate.
    await page.evaluate(() => window.__cityFidelity!.capture('district'))
    await page.screenshot({ path: info.outputPath('city-connector-district-day.png'), animations: 'disabled' })

    await page.evaluate(() => window.__cityFidelity!.capture('street'))
    await page.screenshot({ path: info.outputPath('city-street-day.png'), animations: 'disabled' })

    await page.evaluate(() => window.__cityFidelity!.capture('night'))
    await page.screenshot({ path: info.outputPath('city-coastal-overview-night.png'), animations: 'disabled' })

    // Sixty frames yield a meaningful p95 while ensuring an impaired local
    // renderer cannot keep the temporary evidence server alive for minutes.
    const frame = await page.evaluate(() => window.__cityFidelity!.frameTime(60))
    console.info(`City frame timing (${gpu}): p50 ${frame.p50Ms.toFixed(1)} ms, p95 ${frame.p95Ms.toFixed(1)} ms`)
    await info.attach('city-frame-time.json', {
      body: JSON.stringify({ gpu, ...frame }, null, 2),
      contentType: 'application/json',
    })
    expect(frame.frames).toBe(60)
    expect(Number.isFinite(frame.p95Ms)).toBe(true)
    // Enforce this only on the declared reference-GPU job; arbitrary local
    // headless hosts still produce the capture and measurement evidence.
    if (process.env.CITY_ASSERT_FPS === '1') expect(frame.p95Ms).toBeLessThanOrEqual(16.7)
  })
})

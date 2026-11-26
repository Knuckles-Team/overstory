// spec: OVERSTORY-DESIGN-R002
// spec: OVERSTORY-DESIGN-R002.1
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { useSyntheticWorkspace } from './fixtures/synthetic-workspace'

/**
 * Evidence capture for the design acceptance rows: the synthetic chat, Atlas and
 * operational-form surfaces at the six viewport shapes, in light and dark. Every image
 * is hashed into one manifest bound to the commit under test; CI uploads the folder so
 * the evidence belongs to the exact merged revision. This test captures and checks
 * rendering sanity only; the reviewed before/after comparison and the manual
 * screen-reader pass remain a human step.
 */
const OUT = new URL('../test-results/design-baseline/', import.meta.url)
const SURFACES: { id: string; path: string; ready: { role: 'textbox' | 'heading' | 'button'; name: string } }[] = [
  { id: 'chat', path: '/chat', ready: { role: 'textbox', name: 'Message input' } },
  { id: 'atlas', path: '/explore', ready: { role: 'heading', name: 'Understory' } },
  { id: 'operational-form', path: '/configuration', ready: { role: 'button', name: 'Reload Engine' } },
]
const VIEWPORTS = [
  { name: '320-narrow', width: 320, height: 740 },
  { name: 'narrow-tall', width: 390, height: 844 },
  { name: 'short-landscape', width: 740, height: 320 },
  { name: '4x3', width: 1024, height: 768 },
  { name: '16x9', width: 1280, height: 720 },
  { name: '32x9', width: 1920, height: 540 },
]

test('baseline viewport matrix is captured with digests for chat, Atlas and an operational form', async ({ page }) => {
  mkdirSync(OUT, { recursive: true })
  const entries: { surface: string; scheme: string; viewport: string; file: string; sha256: string; bytes: number }[] =
    []
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await useSyntheticWorkspace(page)
    for (const surface of SURFACES) {
      for (const viewport of VIEWPORTS) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height })
        await page.goto(surface.path)
        await expect(
          page
            .getByRole(surface.ready.role, { name: surface.ready.name, exact: true })
            .locator('visible=true')
            .first(),
        ).toBeVisible({
          timeout: 25_000,
        })
        await page.waitForLoadState('networkidle')
        const overflow = await page.evaluate(
          () => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth,
        )
        expect(overflow, `${surface.id} overflows at ${viewport.name} (${scheme})`).toBeLessThanOrEqual(0)
        const file = `${surface.id}-${scheme}-${viewport.name}.png`
        const image = await page.screenshot({ path: new URL(file, OUT).pathname, animations: 'disabled' })
        entries.push({
          surface: surface.id,
          scheme,
          viewport: viewport.name,
          file,
          sha256: createHash('sha256').update(image).digest('hex'),
          bytes: image.length,
        })
      }
    }
  }
  const manifest = {
    commit: process.env.GITHUB_SHA ?? 'local',
    run: process.env.GITHUB_RUN_ID ?? 'local',
    captured: entries.length,
    entries,
  }
  writeFileSync(new URL('manifest.json', OUT), `${JSON.stringify(manifest, null, 2)}\n`)
  expect(entries).toHaveLength(SURFACES.length * VIEWPORTS.length * 2)
  expect(new Set(entries.map((entry) => entry.sha256)).size, 'renders are not all identical').toBeGreaterThan(1)
})

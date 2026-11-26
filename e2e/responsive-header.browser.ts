// spec: OVERSTORY-DESIGN-R004.1.1
import { expect, test } from '@playwright/test'
import { useSyntheticWorkspace } from './fixtures/synthetic-workspace'

/**
 * The shell header reflows into rows: at every viewport shape its direct controls
 * (menu trigger, context trail, assistant, appearance, branches) never overlap one
 * another and never push the page sideways.
 */
const VIEWPORTS = [
  { name: '320 narrow', width: 320, height: 740 },
  { name: 'narrow tall', width: 390, height: 844 },
  { name: 'short landscape', width: 740, height: 320 },
  { name: '4:3', width: 1024, height: 768 },
  { name: '16:9', width: 1280, height: 720 },
  { name: '32:9', width: 1920, height: 540 },
]

for (const path of ['/explore', '/files', '/knowledge', '/object/sample']) {
  test(`header controls do not overlap on ${path}`, async ({ page }) => {
    await useSyntheticWorkspace(page)
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await page.goto(path)
      await page.getByRole('navigation', { name: 'Workspace context' }).waitFor()
      await page.locator('header').getByText('Agent', { exact: true }).first().waitFor()
      await page.waitForLoadState('networkidle')
      const rects = await page.evaluate(() => {
        const header = document.querySelector('nav[aria-label="Workspace context"]')!.closest('header')!
        const row = header.firstElementChild!
        const rect = (el: Element, tag: string) => {
          const r = el.getBoundingClientRect()
          return { tag, x: r.x, y: r.y, w: r.width, h: r.height }
        }
        const out: { tag: string; x: number; y: number; w: number; h: number }[] = []
        // Leaf controls and the context trail's text parts: none may run under another.
        for (const el of row.querySelectorAll('a, button, summary, nav span:not([aria-hidden])')) {
          if (el.querySelector('a, button, summary') || !el.checkVisibility()) continue
          out.push(rect(el, `"${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`))
        }
        return out.filter((r) => r.w > 0 && r.h > 0)
      })
      for (let i = 0; i < rects.length; i += 1) {
        for (let j = i + 1; j < rects.length; j += 1) {
          const a = rects[i]
          const b = rects[j]
          const overlap = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1
          expect(overlap, `${a.tag} overlaps ${b.tag} on ${path} at ${viewport.name}`).toBe(false)
        }
      }
      const overflow = await page.evaluate(
        () => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth,
      )
      expect(overflow, `whole-page horizontal overflow on ${path} at ${viewport.name}`).toBeLessThanOrEqual(0)
    }
  })
}

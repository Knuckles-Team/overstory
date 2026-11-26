// spec: OVERSTORY-DESIGN-R002.1.1
// spec: OVERSTORY-DESIGN-R004.1.1
import { expect, test } from '@playwright/test'
import { useSyntheticWorkspace } from './fixtures/synthetic-workspace'

test.describe('coarse pointer', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  for (const path of ['/files', '/explore', '/knowledge', '/memories']) {
    test(`shared buttons and inputs keep a 44 px target on ${path}`, async ({ page }) => {
      await useSyntheticWorkspace(page)
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
      await expect(page.locator('.ui-button, [data-slot="input"]').locator('visible=true').first()).toBeVisible()
      const small = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.ui-button, [data-slot="input"]')]
          .filter((el) => el.checkVisibility())
          .map((el) => ({
            name: (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName).trim().slice(0, 30),
            r: el.getBoundingClientRect(),
          }))
          .filter(({ r }) => r.width > 0 && (r.height < 43.5 || r.width < 43.5))
          .map(({ name, r }) => `${name} ${Math.round(r.width)}x${Math.round(r.height)}`),
      )
      expect(small, `controls under 44 px on ${path}`).toEqual([])
    })
  }
})

test('a chat draft survives resizing through every shell shape', async ({ page }) => {
  await useSyntheticWorkspace(page)
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/chat')
  const draft = page.getByRole('textbox', { name: 'Message input' })
  await draft.fill('keep this draft')
  for (const [width, height] of [
    [390, 844],
    [320, 740],
    [740, 320],
    [1920, 540],
    [1024, 768],
  ]) {
    await page.setViewportSize({ width, height })
    await expect(page.getByRole('textbox', { name: 'Message input' }), `draft lost at ${width}x${height}`).toHaveValue(
      'keep this draft',
    )
  }
})

// spec: OVERSTORY-DESIGN-R008
// spec: OVERSTORY-DESIGN-R009
import { expect, test, type Page } from '@playwright/test'
import { useSyntheticWorkspace } from './fixtures/synthetic-workspace'

interface Violation {
  directive: string
  blocked: string
}

/** Record every securitypolicyviolation event, including from before navigation. */
async function installProbe(page: Page) {
  await page.addInitScript(() => {
    const win = window as unknown as { __violations: Violation[] }
    win.__violations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      win.__violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI })
    })
  })
}

async function violations(page: Page): Promise<Violation[]> {
  return page.evaluate(() => (window as unknown as { __violations: Violation[] }).__violations)
}

/** Only style and font violations are in this requirement's scope. */
function styleOrFont(list: Violation[]) {
  return list.filter((entry) => /^(style-src|font-src)/.test(entry.directive))
}

test('shell load raises no style or font policy violation (T012)', async ({ page }) => {
  await installProbe(page)
  await useSyntheticWorkspace(page)
  const response = await page.goto('/chat')
  expect(response?.headers()['content-security-policy']).toMatch(/style-src-elem 'self' 'nonce-/)
  await expect(page.getByRole('button', { name: /Account menu/ })).toBeVisible()
  expect(styleOrFont(await violations(page))).toEqual([])
})

test('each document carries its own style nonce (T012)', async ({ page }) => {
  await useSyntheticWorkspace(page)
  const nonces = new Set<string>()
  for (let index = 0; index < 3; index++) {
    const response = await page.goto('/chat')
    const policy = response?.headers()['content-security-policy'] ?? ''
    const match = /style-src-elem[^;]*'nonce-([^']+)'/.exec(policy)
    expect(match).not.toBeNull()
    nonces.add(match![1])
  }
  expect(nonces.size).toBe(3)
})

test('a dialog, a select and a toast raise no style or font violation (T013)', async ({ page }) => {
  await installProbe(page)
  await useSyntheticWorkspace(page)
  await page.goto('/chat')

  // Select: Radix Select injects its scroll-lock and viewport styles on open.
  const model = page.getByRole('combobox', { name: 'Model' })
  await expect(model).toBeVisible()
  await model.click()
  await expect(page.getByRole('option', { name: 'Synthetic B' })).toBeVisible()
  await page.getByRole('option', { name: 'Synthetic B' }).click()
  await expect(page.getByRole('option', { name: 'Synthetic B' })).toBeHidden()

  // Dialog: the profile dialog opens from the account menu.
  await page.getByRole('button', { name: /Account menu/ }).click()
  await page.getByRole('menuitem', { name: 'Profile' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Toast: saving the local nickname raises a sonner toast.
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('[data-sonner-toast]').first()).toBeVisible()

  expect(styleOrFont(await violations(page))).toEqual([])
})

test('the probe detects an un-nonced inline style element (probe self-check)', async ({ page }) => {
  await installProbe(page)
  await useSyntheticWorkspace(page)
  await page.goto('/chat')
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = 'body { outline: 0 }'
    document.head.append(style)
  })
  await expect.poll(async () => styleOrFont(await violations(page)).length).toBeGreaterThan(0)
})

import { createHash } from 'node:crypto'
import { test, expect, type Page } from '@playwright/test'
import { signInToSandbox } from './fixtures/loopback-arbora/session'

const control = (action: string) => fetch(`http://127.0.0.1:5208/${action}`, { method: 'POST' })
const sessionCookie = '__Host-arbora_session'

// The no-auth sandbox session: the sandbox answers /auth/session with the session's CSRF
// token, and the browser holds the session cookie the host issued. Nothing is typed.
async function signIn(page: Page) {
  const token = await (await fetch('http://127.0.0.1:5208/session')).text()
  const csrf = createHash('sha256').update(`arbora/identity/csrf/v1\0${token}`).digest('base64url')
  await page.context().addCookies([{ name: sessionCookie, value: token, domain: '127.0.0.1', path: '/', secure: true }])
  await signInToSandbox(page, 'user', csrf)
}

async function open(page: Page) {
  await signIn(page)
  await page.goto('/')
}

// spec: OVERSTORY-APPS-R054
test('retention_gap_clears_protected_content', async ({ page }) => {
  expect((await control('seed')).ok).toBe(true)
  const requests: string[] = []
  page.on('request', (request) => requests.push(new URL(request.url()).pathname))

  // Render the original host metadata of the first record.
  await open(page)
  const table = page.getByTestId('host-log-table')
  await expect(table).toBeVisible()
  const row = table.getByRole('row').filter({ hasText: 'held-text' })
  await expect(row.getByRole('cell').nth(0)).toHaveText('host-1')
  await expect(row.getByRole('cell').nth(1)).toHaveText('1')
  await expect(row.getByRole('cell').nth(2)).toHaveText('origin-request')
  await expect(row.getByRole('cell').nth(3)).toHaveText(/^\d{4}-\d{2}-\d{2}T/)
  await expect(row.getByRole('cell').nth(4)).toHaveText('INFO')
  await expect(page.getByTestId('host-log-gap')).toHaveCount(0)
  // No credential field exists: the view read from the signed-in session alone.
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  await expect(page.getByLabel('Workspace log credential')).toHaveCount(0)
  await expect(page.locator('input')).toHaveCount(0)

  // Rotate the real log files so the held cursor is stale: arbora answers 409
  // retention_gap, the view drops what it holds and takes one fresh read.
  expect((await control('rotate')).ok).toBe(true)
  // Hold the fresh reference so the page is observed between the refusal and the new read.
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/host/logs/reference', async (route) => {
    await held
    await route.continue()
  })
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByTestId('host-log-gap')).toBeVisible()
  await expect(page.locator('body')).not.toContainText('held-text')
  await expect(table.locator('tbody tr')).toHaveCount(0)
  release()
  await expect(page.getByText('held-text')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('held-text')
  const tail = table.getByRole('row').filter({ hasText: 'xxxx' })
  await expect(tail.first()).toBeVisible()
  await expect(tail.first().getByRole('cell').nth(0)).toHaveText('host-1')
  const sequences = await table.locator('tbody tr td:nth-child(2)').allTextContents()
  expect(sequences.length).toBeGreaterThan(0)
  expect(Math.min(...sequences.map(Number))).toBeGreaterThan(1)

  // Revoke the grant: the next read is refused, content is cleared, access denied shows.
  expect((await control('revoke')).ok).toBe(true)
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByText('Access denied')).toBeVisible()
  await expect(table).toHaveCount(0)
  await expect(page.getByTestId('host-log-gap')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('xxxx')
  await expect(page.locator('body')).not.toContainText('held-text')

  // The page only ever reached arbora's two host-log routes.
  expect(requests.filter((path) => path.startsWith('/host/'))).toEqual(
    expect.arrayContaining(['/host/logs/reference', '/host/logs/read']),
  )
  await control('restore')
})

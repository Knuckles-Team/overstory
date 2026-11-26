import { expect, test } from '@playwright/test'
import { recordOperations, signInToSandbox } from './fixtures/loopback-arbora/session'

/**
 * Live journeys against the real arbora no-auth sandbox (see
 * `fixtures/loopback-arbora`). They assert what the pinned arbora and engine
 * actually serve. The proposal and artifact reads answer `UNAVAILABLE` until
 * the pinned engine serves `ProposalList` and `SpecQuestion`; the decide and
 * follow-a-goal outcomes of DECIDE-R009.3 and R010.2 are proven only when the
 * pin moves to an engine that serves them, so those rows stay open.
 */

test.beforeEach(async ({ page }) => {
  await signInToSandbox(page)
})

// spec: OVERSTORY-DECIDE-R009.1
test('proposal list is labelled unavailable, never empty, when the engine does not serve it', async ({ page }) => {
  const calls = recordOperations(page)
  await page.goto('/proposals')
  await page.getByLabel('Repository').fill('org/repo')
  await page.getByRole('button', { name: 'Load' }).click()
  await expect(page.getByText('The proposal list is not served yet', { exact: false })).toBeVisible()
  await expect(page.getByText('No proposals for this repository.')).toHaveCount(0)
  const list = calls.find((call) => call.op === 'development.proposal.list')
  expect(list?.status).toBe(503)
  expect(list?.body).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE', source: 'arbora' } })
})

// spec: OVERSTORY-DECIDE-R010.1
test('artifact answer is labelled unavailable, never empty, when the engine does not serve it', async ({ page }) => {
  const calls = recordOperations(page)
  await page.goto('/artifact-graph')
  await page.getByLabel('Question').selectOption('unbound_requirements')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect.poll(() => calls.find((call) => call.op === 'spec.query')?.status).toBe(503)
  await expect(page.getByText(/unavailable/i).first()).toBeVisible()
})

// spec: OVERSTORY-DECIDE-R011
test('project mode reads live and an anonymous change is refused, never self-approved', async ({ page }) => {
  const calls = recordOperations(page)
  await page.goto('/project-mode')
  await page.getByLabel('Repository').fill('org/repo')
  await page.getByRole('button', { name: 'Load' }).click()
  await expect(page.getByText('reference', { exact: true }).first()).toBeVisible()
  await page.locator('select', { hasText: 'evolving' }).selectOption('development')
  await page.getByRole('button', { name: 'Change mode' }).click()
  await expect(page.getByText('Denied. You may not read The mode change.')).toBeVisible()
  const ops = Object.fromEntries(calls.filter((c) => c.op.startsWith('project.mode')).map((c) => [c.op, c]))
  expect(ops['project.mode.get'].body).toMatchObject({
    ok: true,
    result: { repository: 'org/repo', mode: 'reference' },
  })
  expect(ops['project.mode.set'].status).toBe(403)
  expect(ops['project.mode.set'].body).toMatchObject({ error: { code: 'PRINCIPAL_NOT_ALLOWED' } })
})

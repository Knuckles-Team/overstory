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
test('project mode is labelled unavailable until the engine serves it, and an anonymous change is refused', async ({
  page,
}) => {
  const calls = recordOperations(page)
  await page.goto('/project-mode')
  await page.getByLabel('Repository').fill('org/repo')
  await page.getByRole('button', { name: 'Load' }).click()
  await expect(page.getByText('The project mode is not served yet', { exact: false })).toBeVisible()
  // Arbora reads the mode through the engine's ProjectModeGet; the pinned engine does not serve it yet.
  await expect.poll(() => calls.find((call) => call.op === 'project.mode.get')?.status).toBe(503)
  expect(calls.find((call) => call.op === 'project.mode.get')?.body).toMatchObject({
    ok: false,
    error: { code: 'UNAVAILABLE', source: 'arbora' },
  })
  // The change goes straight to arbora: an anonymous principal is refused, never self-approved.
  const change = await page.request.post('/api/v1/ops/project.mode.set', {
    data: { repository: 'org/repo', mode: 'development', reason: null },
  })
  expect(change.status()).toBe(403)
  expect(await change.json()).toMatchObject({ error: { code: 'PRINCIPAL_NOT_ALLOWED' } })
})

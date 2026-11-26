import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { matchRoute } from '@/lib/nav-registry'
import { renderWithProviders } from '@/__tests__/fixtures'
import { installFakeArbora } from './fake-arbora'

/**
 * Journey for OVERSTORY-DECIDE-R010.2 at the registered route, against an
 * in-process stand-in that answers with the recorded served `spec.query` shape.
 */

afterEach(() => vi.unstubAllGlobals())

describe('artifact route journey', () => {
  // spec: OVERSTORY-DECIDE-R010.2
  it('test_reader_follows_a_goal_to_its_open_tasks', async () => {
    const arbora = installFakeArbora({
      'spec.query': () => ({
        rows: [
          { task: 'T014', row: 'OVERSTORY-DECIDE-R010.1', contract: 'ARBORA-OPS-R896.1' },
          { task: 'T002', row: 'OVERSTORY-DECIDE-R002', contract: 'ARBORA-OPS-R920' },
        ],
        digests: ['sha256:01'],
      }),
    })
    const matched = matchRoute('/artifact-graph')
    expect(matched?.route.id).toBe('control-plane.artifact-graph')
    const Page = matched!.route.element
    const { user } = renderWithProviders(
      <Suspense fallback={null}>
        <Page />
      </Suspense>,
    )
    await user.selectOptions(await screen.findByLabelText('Question'), 'changes_advancing_goal')
    await user.type(screen.getByLabelText('Goal'), 'goal-1')
    await user.click(screen.getByRole('button', { name: 'Ask' }))
    const items = await screen.findAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'taskT014rowOVERSTORY-DECIDE-R010.1contractARBORA-OPS-R896.1',
      'taskT002rowOVERSTORY-DECIDE-R002contractARBORA-OPS-R920',
    ])
    expect(arbora.calls[0]).toMatchObject({
      op: 'spec.query',
      params: { question: 'changes_advancing_goal', subject: 'goal-1' },
    })
  })
})

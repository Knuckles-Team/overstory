import { Suspense } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { matchRoute } from '@/lib/nav-registry'
import { renderWithProviders } from '@/__tests__/fixtures'
import { installFakeArbora } from './fake-arbora'

/**
 * Journey for OVERSTORY-DECIDE-R011 at the registered route, against an
 * in-process stand-in that answers with the recorded served mode shapes.
 */

afterEach(() => vi.unstubAllGlobals())

describe('project mode route journey', () => {
  // spec: OVERSTORY-DECIDE-R011
  it('test_mode_change_round_trips_through_arbora', async () => {
    let mode = 'reference'
    const arbora = installFakeArbora({
      'project.mode.get': () => ({ repository: 'org/repo', mode, previous: null }),
      'project.mode.set': (params) => {
        const previous = mode
        mode = String(params.mode)
        return { repository: 'org/repo', mode, previous }
      },
    })
    const matched = matchRoute('/project-mode')
    expect(matched?.route.id).toBe('control-plane.project-mode')
    const Page = matched!.route.element
    const { user } = renderWithProviders(
      <Suspense fallback={null}>
        <Page />
      </Suspense>,
    )
    await user.type(await screen.findByLabelText('Repository'), 'org/repo')
    await user.click(screen.getByRole('button', { name: 'Load' }))
    expect(await screen.findByText('reference', { selector: 'strong' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Mode'), 'development')
    await user.click(screen.getByRole('button', { name: 'Change mode' }))
    expect(await screen.findByText('Mode is now development.')).toBeInTheDocument()
    expect(await screen.findByText('development', { selector: 'strong' })).toBeInTheDocument()
    expect(arbora.calls.map((c) => c.op)).toEqual(['project.mode.get', 'project.mode.set', 'project.mode.get'])
  })
})

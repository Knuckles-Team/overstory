// spec: OVERSTORY-APPS-R030.8.2
// spec: OVERSTORY-APPS-R030.8.3
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { servedOk, servedRefusal, stubServed } from '@/lib/arbora-api/__tests__/served-fixtures'
import { useGraphChanges, type Scheduler } from '@/hooks/useGraphChanges'
import { readLiveLimits, type ChangeEffect } from '@/lib/graph-changes'

const limits = readLiveLimits({
  commitToVisibleMs: 500,
  frameP95Ms: 16.7,
  layoutSettleMs: 3000,
  profileRevision: 1,
  contractRevision: 'r1',
  workload: 'w',
})
const snapshotBody = (cursor: string, revision = 1) =>
  servedOk({
    schema_version: 1,
    incarnation: 1,
    committed_revision: revision,
    snapshot_digest: 'b'.repeat(64),
    visibility_revision: 1,
    high_water_cursor: cursor,
  })
const pageBody = (ordinal: number, ids: string[], next: string) =>
  servedOk({
    schema_version: 1,
    next_cursor: next,
    events: [
      {
        schema_version: 1,
        commit_id: `c${ordinal}`,
        event_ordinal: ordinal,
        committed_at_ms: 1,
        visible_at_ms: 2,
        latency_profile_revision: 1,
        commit_to_visible_ms: 1,
        change: { kind: 'upsert', node_ids: ids, edge_ids: [] },
      },
    ],
  })

/** A scheduler the test steps by hand: no wall-clock wait. */
function manualScheduler() {
  const queue: (() => void)[] = []
  const scheduler: Scheduler = {
    after: (run) => {
      queue.push(run)
      return () => {
        queue.splice(queue.indexOf(run), 1)
      }
    },
  }
  return { scheduler, tick: () => queue.shift()?.(), pending: () => queue.length }
}

afterEach(() => vi.unstubAllGlobals())

const mount = (replies: Parameters<typeof stubServed>[0], active = true, lim = limits) => {
  const served = stubServed(replies)
  vi.stubGlobal('fetch', served.fetcher)
  const clock = manualScheduler()
  const effects: ChangeEffect[] = []
  const revoked = vi.fn()
  const view = renderHook(() =>
    useGraphChanges({
      active,
      limits: lim,
      onEffect: (e) => effects.push(e),
      onRevoked: revoked,
      scheduler: clock.scheduler,
    }),
  )
  return { ...served, ...clock, effects, revoked, view }
}

describe('live graph subscription', () => {
  it('test_applies_committed_changes_without_a_page_refresh', async () => {
    const m = mount([snapshotBody('c0'), pageBody(1, ['n1'], 'c1'), pageBody(2, ['n2'], 'c2')])
    await waitFor(() => {
      expect(m.view.result.current.phase).toBe('live')
    })
    await act(async () => m.tick())
    await waitFor(() => {
      expect(m.effects).toHaveLength(1)
    })
    expect(m.effects[0]).toEqual({ refresh: ['n1'], remove: [] })
    await act(async () => m.tick())
    await waitFor(() => {
      expect(m.effects).toHaveLength(2)
    })
    // The second read continues after the cursor the first page returned.
    expect(m.calls.map((c) => c.url.split('/').pop())).toEqual([
      'eg.graph.OpenGraphSnapshot',
      'eg.graph.ReadGraphChanges',
      'eg.graph.ReadGraphChanges',
    ])
    expect(m.calls[1]?.body).toMatchObject({ cursor: 'c0' })
    expect(m.calls[2]?.body).toMatchObject({ cursor: 'c1' })
  })

  it('test_expired_cursor_reads_a_fresh_snapshot', async () => {
    const m = mount([snapshotBody('c0'), servedRefusal('CURSOR_EXPIRED', 409), snapshotBody('c9', 5)])
    await waitFor(() => {
      expect(m.view.result.current.phase).toBe('live')
    })
    await act(async () => m.tick())
    await waitFor(() => {
      expect(m.calls).toHaveLength(3)
    })
    await waitFor(() => {
      const feed = m.view.result.current
      expect(feed.phase === 'live' && feed.cursor).toBe('c9')
    })
  })

  it('test_denied_read_revokes_and_stops_the_subscription', async () => {
    const m = mount([snapshotBody('c0'), servedRefusal('SCOPE_REQUIRED', 403)])
    await waitFor(() => {
      expect(m.view.result.current.phase).toBe('live')
    })
    await act(async () => m.tick())
    await waitFor(() => {
      expect(m.revoked).toHaveBeenCalledTimes(1)
    })
    expect(m.view.result.current.phase).toBe('revoked')
    expect(m.pending()).toBe(0)
  })

  it('test_without_published_limits_no_request_is_made', async () => {
    const m = mount([], true, readLiveLimits(undefined))
    await waitFor(() => {
      expect(m.view.result.current).toEqual({ phase: 'unavailable', reason: 'Live graph limits unavailable' })
    })
    expect(m.calls).toHaveLength(0)
  })

  it('test_an_unserved_snapshot_is_unavailable_not_empty', async () => {
    const m = mount([servedRefusal('UNKNOWN_OP', 404)])
    await waitFor(() => {
      expect(m.view.result.current.phase).toBe('unavailable')
    })
    expect(m.pending()).toBe(0)
  })
})

// spec: OVERSTORY-APPS-R030.8.1
// spec: OVERSTORY-APPS-R030.8.4
import { describe, expect, it } from 'vitest'
import {
  acceptSnapshot,
  effectOf,
  graphChangePageSchema,
  graphSnapshotSchema,
  judgeLayout,
  openFeed,
  readLiveLimits,
  receivePage,
  refuseCursor,
  revokeFeed,
  selectionContinuity,
  standingOf,
  type GraphChangeEvent,
  type GraphChangePage,
} from '@/lib/graph-changes'

const published = {
  commitToVisibleMs: 500,
  frameP95Ms: 16.7,
  layoutSettleMs: 3000,
  profileRevision: 4,
  contractRevision: 'r1',
  workload: 'two-client-edit',
}
const limits = readLiveLimits(published)
const snapshot = graphSnapshotSchema.parse({
  schema_version: 1,
  incarnation: 3,
  committed_revision: 9,
  snapshot_digest: 'a'.repeat(64),
  visibility_revision: 2,
  high_water_cursor: 'cursor-0',
})
const event = (ordinal: number, change: GraphChangeEvent['change'], over: Partial<GraphChangeEvent> = {}) => ({
  schema_version: 1,
  commit_id: `c${ordinal}`,
  event_ordinal: ordinal,
  committed_at_ms: 1000,
  visible_at_ms: 1100,
  latency_profile_revision: 4,
  commit_to_visible_ms: 100,
  change,
  ...over,
})
const upsert = (ids: string[]) => ({ kind: 'upsert' as const, node_ids: ids, edge_ids: [] })
const page = (events: GraphChangeEvent[], next = 'cursor-1'): GraphChangePage =>
  graphChangePageSchema.parse({ schema_version: 1, events, next_cursor: next })

describe('graph change feed model', () => {
  it('test_model_types_snapshot_identity_and_ordered_events', () => {
    expect(snapshot.incarnation).toBe(3)
    expect(() => graphSnapshotSchema.parse({ ...snapshot, extra: 1 })).toThrow()
    expect(() => graphSnapshotSchema.parse({ ...snapshot, snapshot_digest: 'xyz' })).toThrow()
    const state = openFeed(snapshot, limits)
    if (state.phase !== 'live') throw new Error('expected a live feed')
    expect(state.cursor).toBe('cursor-0')
    const out = receivePage(state, page([event(8, upsert(['b'])), event(7, upsert(['a']))]), limits)
    expect(out.apply.map((e) => e.event_ordinal)).toEqual([7, 8])
    expect(out.state.phase === 'live' && out.state.cursor).toBe('cursor-1')
    expect(effectOf(out.apply).refresh).toEqual(['a', 'b'])
  })

  it('test_tombstone_stays_distinct_from_inaccessible', () => {
    const live = openFeed(snapshot, limits)
    const out = receivePage(
      live,
      page([event(1, { kind: 'tombstone', deleted_ids: ['gone'], deletion_revision: 10 })]),
      limits,
    )
    const visible = new Set(['here'])
    expect(standingOf(out.state, 'gone', visible)).toBe('tombstone')
    expect(standingOf(out.state, 'hidden', visible)).toBe('inaccessible')
    expect(standingOf(out.state, 'here', visible)).toBe('present')
    expect(effectOf(out.apply)).toEqual({ refresh: [], remove: ['gone'] })
  })
})

describe('graph change feed refusal', () => {
  it('test_duplicates_dropped_and_regressions_rejected', () => {
    const first = receivePage(openFeed(snapshot, limits), page([event(5, upsert(['a']))]), limits)
    const again = receivePage(
      first.state,
      page([event(5, upsert(['a'])), event(3, upsert(['old'])), event(6, upsert(['c']))]),
      limits,
    )
    expect(again.apply.map((e) => e.event_ordinal)).toEqual([6])
    if (again.state.phase !== 'live') throw new Error('expected live')
    expect(again.state.evidence).toMatchObject({ duplicates: 1, regressions: 1, applied: 2, lastEventOrdinal: 6 })
  })

  it('test_cursor_refusals_require_a_fresh_snapshot', () => {
    const live = openFeed(snapshot, limits)
    for (const code of ['CURSOR_EXPIRED', 'AUTHORIZATION_CHANGED', 'GRAPH_INCARNATION_STALE'])
      expect(refuseCursor(live, code)).toEqual({ phase: 'resnapshot', reason: code })
    expect(refuseCursor(live, 'SOMETHING_ELSE')).toBe(live)
    const older = { ...snapshot, committed_revision: 4 }
    expect(acceptSnapshot(live, older, limits)).toEqual({ phase: 'resnapshot', reason: 'REVISION_REGRESSION' })
    expect(acceptSnapshot(live, { ...snapshot, incarnation: 4, committed_revision: 1 }, limits).phase).toBe('live')
  })

  it('test_missing_invalid_or_nonfinite_bounds_make_live_mode_unavailable', () => {
    for (const bad of [
      undefined,
      {},
      { ...published, commitToVisibleMs: 0 },
      { ...published, frameP95Ms: Infinity },
    ]) {
      const state = readLiveLimits(bad)
      expect(state.status).toBe('unavailable')
      expect(openFeed(snapshot, state)).toEqual({ phase: 'unavailable', reason: 'Live graph limits unavailable' })
    }
    expect(readLiveLimits({ ...published, layoutSettleMs: -1 })).toMatchObject({ missing: ['layoutSettleMs'] })
  })

  it('test_revocation_clears_the_feed', () => {
    const out = receivePage(revokeFeed(), page([event(1, upsert(['a']))]), limits)
    expect(out).toEqual({ state: { phase: 'revoked' }, apply: [] })
    expect(refuseCursor(revokeFeed(), 'CURSOR_EXPIRED')).toEqual({ phase: 'revoked' })
  })

  it('test_latency_and_layout_are_judged_against_owner_limits', () => {
    const slow = receivePage(
      openFeed(snapshot, limits),
      page([
        event(1, upsert(['a']), { commit_to_visible_ms: 900 }),
        event(2, upsert(['b']), { latency_profile_revision: 9 }),
      ]),
      limits,
    )
    if (slow.state.phase !== 'live') throw new Error('expected live')
    expect(slow.state.evidence).toMatchObject({ exceededLimit: 1, profileMismatch: 1, maxCommitToVisibleMs: 900 })
    expect(judgeLayout({ frameP95Ms: 20, settleMs: 100 }, limits)).toEqual({ frame: 'exceeded', settle: 'within' })
    expect(judgeLayout({ frameP95Ms: Number.NaN }, limits)).toEqual({ frame: 'unmeasured', settle: 'unmeasured' })
    expect(judgeLayout({ frameP95Ms: 1 }, readLiveLimits({}))).toBeNull()
  })

  it('test_selection_survives_a_change_that_keeps_the_node', () => {
    expect(selectionContinuity('a', [{ id: 'a' }, { id: 'b' }])).toEqual({ before: 'a', after: 'a', retained: true })
    expect(selectionContinuity('a', [{ id: 'b' }])).toEqual({ before: 'a', after: null, retained: false })
    expect(selectionContinuity(null, [])).toEqual({ before: null, after: null, retained: true })
  })
})

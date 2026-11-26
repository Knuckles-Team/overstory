// spec: OVERSTORY-DESIGN-R005.3.2
import { describe, expect, it } from 'vitest'
import { acceptWallpaperEvidence, type WallpaperEvidenceRecord } from '../wallpaperEvidence'

const context = { now: 10_000, maxAgeMs: 5_000, knownSubjects: new Set(['github', 'harness', 'topic-a']) }
const base: WallpaperEvidenceRecord = { id: 'e1', kind: 'activity', subject: 'github', observedAt: 9_000, sequence: 1 }

describe('wallpaper_evidence', () => {
  it('accepts current, known, ordered records', () => {
    const result = acceptWallpaperEvidence(
      [base, { ...base, id: 'e2', kind: 'relationship', subject: 'harness', object: 'topic-a', sequence: 1 }],
      context,
    )
    expect(result.accepted.map((r) => r.id)).toEqual(['e1', 'e2'])
    expect(result.refused).toEqual([])
  })

  it('refuses missing, unknown, unrelated, stale, future, duplicate and out-of-order records', () => {
    const result = acceptWallpaperEvidence(
      [
        null,
        { id: 'half', subject: 'github' },
        { ...base, id: 'k', kind: 'rumour' as never },
        { ...base, id: 'u', subject: 'unheard-of' },
        { ...base, id: 'r1', kind: 'relationship', object: 'nowhere' },
        { ...base, id: 'r2', kind: 'relationship' },
        { ...base, id: 'a1', object: 'topic-a' },
        { ...base, id: 's', observedAt: 1_000 },
        { ...base, id: 'f', observedAt: 20_000 },
        base,
        { ...base, sequence: 2 },
        { ...base, id: 'o', sequence: 1 },
      ],
      context,
    )
    expect(result.accepted.map((r) => r.id)).toEqual(['e1'])
    expect(result.refused.map((r) => r.reason)).toEqual([
      'missing',
      'missing',
      'unknown-kind',
      'unknown-subject',
      'unrelated',
      'unrelated',
      'unrelated',
      'stale',
      'future',
      'duplicate',
      'out-of-order',
    ])
  })

  it('never repairs a refused record', () => {
    const input = { ...base, observedAt: 1_000 }
    const result = acceptWallpaperEvidence([input], context)
    expect(result.accepted).toEqual([])
    expect(input.observedAt).toBe(1_000)
  })
})

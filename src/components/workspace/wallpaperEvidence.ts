// spec: OVERSTORY-DESIGN-R005.3.2
/**
 * Pure gate for evidence-bound wallpaper activity and topology. The wallpaper draws
 * activity or a knowledge relationship only for a record this helper accepts; anything
 * else leaves static scenery. It reads no service and invents nothing.
 */

export type WallpaperEvidenceKind = 'activity' | 'relationship'

export interface WallpaperEvidenceRecord {
  id: string
  kind: WallpaperEvidenceKind
  /** The connector, harness or knowledge node the record is about. */
  subject: string
  /** The other end of a relationship; absent for activity. */
  object?: string
  /** Observation time, epoch milliseconds. */
  observedAt: number
  /** Per-subject, strictly increasing sequence from the producer. */
  sequence: number
}

export interface WallpaperEvidenceContext {
  now: number
  /** Records older than this are stale. */
  maxAgeMs: number
  /** Subjects the current workspace actually has (connectors, harness, knowledge nodes). */
  knownSubjects: ReadonlySet<string>
}

export type WallpaperEvidenceRefusal =
  'missing' | 'unknown-kind' | 'unknown-subject' | 'unrelated' | 'stale' | 'future' | 'duplicate' | 'out-of-order'

export interface WallpaperEvidenceResult {
  accepted: WallpaperEvidenceRecord[]
  refused: { id: string; reason: WallpaperEvidenceRefusal }[]
}

function isComplete(record: Partial<WallpaperEvidenceRecord> | null | undefined): record is WallpaperEvidenceRecord {
  return (
    !!record &&
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.subject === 'string' &&
    record.subject.length > 0 &&
    Number.isFinite(record.observedAt) &&
    Number.isInteger(record.sequence)
  )
}

/** Accept records in arrival order; each refusal names why, and nothing is repaired. */
export function acceptWallpaperEvidence(
  records: readonly (Partial<WallpaperEvidenceRecord> | null | undefined)[],
  context: WallpaperEvidenceContext,
): WallpaperEvidenceResult {
  const accepted: WallpaperEvidenceRecord[] = []
  const refused: WallpaperEvidenceResult['refused'] = []
  const seen = new Set<string>()
  const lastSequence = new Map<string, number>()
  for (const record of records) {
    const id = record?.id ?? ''
    const refuse = (reason: WallpaperEvidenceRefusal) => {
      refused.push({ id, reason })
    }
    if (!isComplete(record)) {
      refuse('missing')
      continue
    }
    // Producers are untrusted: compare as a plain string, not the compile-time union.
    const kind: string = record.kind
    if (kind !== 'activity' && kind !== 'relationship') refuse('unknown-kind')
    else if (!context.knownSubjects.has(record.subject)) refuse('unknown-subject')
    else if (record.kind === 'relationship' && (!record.object || !context.knownSubjects.has(record.object)))
      refuse('unrelated')
    else if (record.kind === 'activity' && record.object !== undefined) refuse('unrelated')
    else if (record.observedAt > context.now) refuse('future')
    else if (context.now - record.observedAt > context.maxAgeMs) refuse('stale')
    else if (seen.has(record.id)) refuse('duplicate')
    else if (record.sequence <= (lastSequence.get(record.subject) ?? Number.NEGATIVE_INFINITY)) refuse('out-of-order')
    else {
      seen.add(record.id)
      lastSequence.set(record.subject, record.sequence)
      accepted.push(record)
    }
  }
  return { accepted, refused }
}

/**
 * Engine-sourced usage through the served `usage.read` operation (OVERSTORY-APPS-R004.8).
 *
 * The operation answers one session's counts with their coverage and measured turn timings, or this
 * tenant's totals. This module parses that answer and judges it. It never adds one count category to
 * another, never turns a missing number into zero and never invents project or agent attribution.
 */
import { z } from 'zod'
import { callServed, type ServedReply } from '@/lib/arbora-api/served'

export const USAGE_READ_OP = 'usage.read'
export const LATENCY_LIMIT_UNAVAILABLE = 'Bounded usage analysis unavailable: no positive finite latency limit'

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const turnTimingSchema = z
  .object({
    run_id: z.string().min(1).max(256),
    turn_index: count,
    phase: z.enum(['request', 'run', 'queue', 'tool']),
    duration_ms: count.max(86_400_000),
  })
  .strict()

export const sessionUsageSchema = z
  .object({
    context_id: z.string().min(1).max(128),
    counts: z.record(z.string().max(128), count),
    count_coverage: z.record(z.string().max(128), count),
    expected_runs: count,
    recorded_runs: count,
    missing_runs: count,
    inventory_complete: z.boolean(),
    turn_timings: z.array(turnTimingSchema).max(100000).nullish(),
    timing_refusal: z.literal('TIMING_INVALID').nullish(),
  })
  .strict()
export type SessionUsage = z.infer<typeof sessionUsageSchema>

export const usageReadSchema = z
  .object({
    value: z
      .object({ tenant: z.string(), totals: z.record(z.string().max(128), z.number()) })
      .loose()
      .nullish(),
    session: sessionUsageSchema.nullish(),
  })
  .strict()

/** Read one session's engine usage. A context the caller does not own answers like an absent one. */
export const readSessionUsage = (contextId: string, signal?: AbortSignal): Promise<ServedReply<SessionUsage>> =>
  callServed(USAGE_READ_OP, { context_id: contextId }, usageReadSchema, { signal }).then((reply) => {
    if (reply.kind !== 'ready') return reply
    const session = reply.result.session
    return session?.context_id === contextId
      ? { kind: 'ready', result: session }
      : { kind: 'error', code: 'SESSION_MISMATCH' }
  })

export interface CountRow {
  name: string
  count: number
  /** Runs that reported this category; fewer than recorded runs means the count is partial. */
  coveredRuns: number
  partial: boolean
}

export interface SessionUsageVerdict {
  accounting: 'complete' | 'incomplete'
  missingRuns: number
  /** One row per owner-defined category. Categories overlap, so no total is formed. */
  rows: CountRow[]
  timing: 'measured' | 'refused' | 'absent'
  /** Project and agent attribution are not part of the served answer. */
  attribution: 'not-served'
}

/** Judge a served session answer. Incomplete accounting stays explicit and is never summed over. */
export function judgeSessionUsage(usage: SessionUsage): SessionUsageVerdict {
  const complete = usage.inventory_complete && usage.missing_runs === 0
  const rows = Object.keys(usage.counts)
    .sort()
    .map((name) => {
      const coveredRuns = usage.count_coverage[name] ?? 0
      return {
        name,
        count: usage.counts[name] ?? 0,
        coveredRuns,
        partial: coveredRuns < usage.recorded_runs,
      }
    })
  const timing = usage.timing_refusal ? 'refused' : usage.turn_timings ? 'measured' : 'absent'
  return {
    accounting: complete ? 'complete' : 'incomplete',
    missingRuns: usage.missing_runs,
    rows,
    timing,
    attribution: 'not-served',
  }
}

export type LatencyBound =
  { status: 'ready'; limitMs: number } | { status: 'unavailable'; notice: typeof LATENCY_LIMIT_UNAVAILABLE }

/** An owner latency limit must be positive and finite, or bounded analysis is unavailable. */
export function readLatencyBound(limit: unknown): LatencyBound {
  return typeof limit === 'number' && Number.isFinite(limit) && limit > 0
    ? { status: 'ready', limitMs: limit }
    : { status: 'unavailable', notice: LATENCY_LIMIT_UNAVAILABLE }
}

/** Cost per solved task is a ratio of two served numbers and abstains when nothing was solved. */
export function costPerSolved(cost: number | null, solved: number | null): number | null {
  if (cost === null || solved === null || !Number.isFinite(cost) || !Number.isFinite(solved) || solved <= 0)
    return null
  return cost / solved
}

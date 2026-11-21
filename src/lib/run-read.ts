/**
 * Run harness read: `runs.get` and `runs.metrics` through the one Arbora
 * browser transport. The client never calls the engine and never computes
 * context use or cost; an absent or refused operation reads "not available".
 */
import { z } from 'zod'
import { ArboraApiError, invoke } from '@/lib/arbora-api/invoke'

/** Shown wherever a value is absent. Never zero. */
export const NOT_AVAILABLE = 'not available'

export const TERMINATION_REASONS = ['final_answer', 'context_overflow', 'stuck', 'step_budget', 'error'] as const
export type TerminationReason = (typeof TERMINATION_REASONS)[number]

/** One distinct state per reason; overflow and stuck are never a generic failure. */
export const TERMINATION_LABELS: Readonly<
  Record<TerminationReason, { label: string; detail: string; tone: 'ok' | 'warn' | 'error' }>
> = {
  final_answer: { label: 'Final answer', detail: 'The run ended with its final answer.', tone: 'ok' },
  context_overflow: {
    label: 'Context overflow',
    detail: 'The run stopped because its context outgrew the budget.',
    tone: 'warn',
  },
  stuck: { label: 'Stuck', detail: 'The run stopped because it made no progress.', tone: 'warn' },
  step_budget: { label: 'Step budget reached', detail: 'The run used all of its allowed steps.', tone: 'warn' },
  error: { label: 'Error', detail: 'The run ended with an error.', tone: 'error' },
}

/** The label for a producer value; an absent or unrecognised value is not mapped to any reason. */
export function terminationLabel(
  reason: unknown,
): { label: string; detail: string; tone: 'ok' | 'warn' | 'error' } | null {
  return typeof reason === 'string' && (TERMINATION_REASONS as readonly string[]).includes(reason)
    ? TERMINATION_LABELS[reason as TerminationReason]
    : null
}

const optionalNumber = z.number().nonnegative().nullish()

const harnessConfigSchema = z
  .object({
    context_policy: z
      .object({
        soft_threshold: z.number().nullish(),
        hard_threshold: z.number().nullish(),
        recent_window_fraction: z.number().nullish(),
      })
      .loose()
      .nullish(),
    plan_scaffold: z.unknown().nullish(),
    action_space: z.unknown().nullish(),
  })
  .loose()

const runGetSchema = z
  .object({
    harness_config: harnessConfigSchema.nullish(),
    terminationReason: z.string().nullish(),
  })
  .loose()

const runMetricsSchema = z
  .object({
    peakContextTokens: optionalNumber,
    contextBudgetTokens: optionalNumber,
    costUsd: optionalNumber,
  })
  .loose()

export type HarnessConfig = z.infer<typeof harnessConfigSchema>

export interface RunRead {
  harnessConfig: HarnessConfig | null
  terminationReason: string | null
  peakContextTokens: number | null
  contextBudgetTokens: number | null
  costUsd: number | null
  /** True when the operation answered; false when it was absent or refused. */
  getAvailable: boolean
  metricsAvailable: boolean
}

async function readOp<T>(op: string, runId: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T | null> {
  try {
    const result = await invoke(op, { run_id: runId }, z.object({ value: schema }).strict(), { signal })
    return result.value
  } catch (error) {
    if (signal?.aborted) throw error
    // Absent, refused or malformed: honest "not available", nothing invented.
    if (error instanceof ArboraApiError || error instanceof Error) return null
    throw error
  }
}

/** Read one run through `runs.get` and `runs.metrics` only. */
export async function readRun(runId: string, signal?: AbortSignal): Promise<RunRead> {
  const [run, metrics] = await Promise.all([
    readOp('runs.get', runId, runGetSchema, signal),
    readOp('runs.metrics', runId, runMetricsSchema, signal),
  ])
  return {
    harnessConfig: run?.harness_config ?? null,
    terminationReason: run?.terminationReason ?? null,
    peakContextTokens: metrics?.peakContextTokens ?? null,
    contextBudgetTokens: metrics?.contextBudgetTokens ?? null,
    costUsd: metrics?.costUsd ?? null,
    getAvailable: run !== null,
    metricsAvailable: metrics !== null,
  }
}

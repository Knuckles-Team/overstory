/**
 * Run harness read: `runs.get` through the one Arbora browser transport. The
 * client never calls the engine and never computes context use or cost; an
 * absent or refused operation reads "not available".
 *
 * The request is typed from the pinned Arbora operation schema. That schema
 * types the `runs.get` result only as an object, so the per-run fields are
 * parsed here to the snake_case projection of ARBORA-OPS-R021.4.5
 * (`termination_reason`, `peak_context_tokens`, `context_budget_tokens`,
 * `cost_usd`, `harness_config`). `runs.metrics` is a grouped aggregate and
 * never carries per-run cost, so it is not read here.
 */
import { z } from 'zod'
import { ArboraApiError, invoke } from '@/lib/arbora-api/invoke'
import type { operations } from '@/lib/arbora-api/generated/schema'

type RunsGetParams = operations['runs.get']['requestBody']['content']['application/json']

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
    availability: z.string().nullish(),
    harness_config: harnessConfigSchema.nullish(),
    termination_reason: z.string().nullish(),
    peak_context_tokens: optionalNumber,
    context_budget_tokens: optionalNumber,
    cost_usd: optionalNumber,
  })
  .loose()

export type HarnessConfig = z.infer<typeof harnessConfigSchema>

export interface RunRead {
  harnessConfig: HarnessConfig | null
  terminationReason: string | null
  peakContextTokens: number | null
  contextBudgetTokens: number | null
  costUsd: number | null
  /** True when `runs.get` answered with an available run; false when absent, refused or unavailable. */
  getAvailable: boolean
}

async function readRunGet(runId: string, signal?: AbortSignal): Promise<z.infer<typeof runGetSchema> | null> {
  const params: RunsGetParams = { run_id: runId }
  try {
    const result = await invoke('runs.get', params, z.object({ value: runGetSchema }).strict(), { signal })
    return result.value.availability === 'unavailable' ? null : result.value
  } catch (error) {
    if (signal?.aborted) throw error
    // Absent, refused or malformed: honest "not available", nothing invented.
    if (error instanceof ArboraApiError || error instanceof Error) return null
    throw error
  }
}

/** Read one run through `runs.get` only. */
export async function readRun(runId: string, signal?: AbortSignal): Promise<RunRead> {
  const run = await readRunGet(runId, signal)
  return {
    harnessConfig: run?.harness_config ?? null,
    terminationReason: run?.termination_reason ?? null,
    peakContextTokens: run?.peak_context_tokens ?? null,
    contextBudgetTokens: run?.context_budget_tokens ?? null,
    costUsd: run?.cost_usd ?? null,
    getAvailable: run !== null,
  }
}

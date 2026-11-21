/**
 * @file RunHarnessPanel.tsx
 * @description Read-only harness block beside a run's trace waterfall: applied
 * harness configuration, context use against budget, cost and termination
 * reason. Every absent value reads "not available", never zero.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { StatusMessage } from '@/components/ui/status-message'
import { NOT_AVAILABLE, readRun, terminationLabel, type RunRead } from '@/lib/run-read'

function fmt(value: number | null | undefined, format: (n: number) => string = String): string {
  return typeof value === 'number' ? format(value) : NOT_AVAILABLE
}

function jsonOrAbsent(value: unknown): string {
  if (value === null || value === undefined) return NOT_AVAILABLE
  return typeof value === 'string' ? value : JSON.stringify(value)
}

function Field({ label, children, testId }: { label: string; children: ReactNode; testId: string }) {
  return (
    <div className="rounded-md bg-muted/40 p-2" data-testid={testId}>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-semibold break-words">{children}</div>
    </div>
  )
}

export function RunHarnessView({ read }: { read: RunRead }) {
  const config = read.harnessConfig
  const policy = config?.context_policy
  const termination = terminationLabel(read.terminationReason)
  return (
    <section aria-label="Run harness" className="space-y-2 text-xs" data-testid="run-harness-panel">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Context policy" testId="harness-context-policy">
          {policy
            ? `soft ${fmt(policy.soft_threshold)}, hard ${fmt(policy.hard_threshold)}, recent window ${fmt(policy.recent_window_fraction)}`
            : NOT_AVAILABLE}
        </Field>
        <Field label="Plan scaffold" testId="harness-plan-scaffold">
          {jsonOrAbsent(config?.plan_scaffold)}
        </Field>
        <Field label="Action space" testId="harness-action-space">
          {jsonOrAbsent(config?.action_space)}
        </Field>
        <Field label="Termination" testId="harness-termination">
          {termination ? (
            <span data-tone={termination.tone} title={termination.detail}>
              {termination.label}
            </span>
          ) : (
            NOT_AVAILABLE
          )}
        </Field>
        <Field label="Context use" testId="harness-context-use">
          {typeof read.peakContextTokens === 'number' && typeof read.contextBudgetTokens === 'number'
            ? `${read.peakContextTokens.toLocaleString('en-US')} of ${read.contextBudgetTokens.toLocaleString('en-US')} tokens`
            : `${fmt(read.peakContextTokens, (n) => `${n.toLocaleString('en-US')} tokens peak`)} / budget ${fmt(read.contextBudgetTokens, (n) => n.toLocaleString('en-US'))}`}
        </Field>
        <Field label="Run cost" testId="harness-cost">
          {fmt(read.costUsd, (n) => `$${n.toFixed(4)}`)}
        </Field>
      </div>
      {termination && <p className="text-muted-foreground">{termination.detail}</p>}
    </section>
  )
}

/** Reads the selected run through `runs.get` and `runs.metrics` and renders it. */
export default function RunHarnessPanel({ runId }: { runId: string }) {
  const [read, setRead] = useState<RunRead | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    setRead(null)
    readRun(runId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRead(value)
      })
      .catch(() => undefined)
    return () => {
      controller.abort()
    }
  }, [runId])
  if (!read) return <StatusMessage status="loading" label="Loading run harness…" />
  return <RunHarnessView read={read} />
}

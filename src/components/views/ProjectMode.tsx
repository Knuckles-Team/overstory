import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ServedState } from '@/components/served/ServedState'
import { StatusMessage } from '@/components/ui/status-message'
import { callServed } from '@/lib/arbora-api/served'
import { RepositoryField } from '@/components/development/RepositoryField'

/**
 * Project mode (OVERSTORY-DECIDE-R011): shows a repository's mode and sends a
 * change through `project.mode.set`. The control never approves its own
 * request and never writes the mode directly: when arbora answers with a
 * pending confirmation the view shows it and links the console, nothing more.
 */

export const PROJECT_MODES = ['reference', 'development', 'evolving'] as const
export type ProjectModeValue = (typeof PROJECT_MODES)[number]

const modeSchema = z.enum(PROJECT_MODES)
export const projectModeSchema = z
  .object({ repository: z.string(), mode: modeSchema, previous: modeSchema.nullable().optional() })
  .strict()

function ModeControl({ repository }: { repository: string }) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<ProjectModeValue | null>(null)
  const [reason, setReason] = useState('')
  const query = useQuery({
    queryKey: ['project-mode', repository],
    queryFn: ({ signal }) => callServed('project.mode.get', { repository }, projectModeSchema, { signal }),
  })
  const change = useMutation({
    mutationFn: (mode: ProjectModeValue) =>
      callServed('project.mode.set', { repository, mode, reason: reason.trim() || null }, projectModeSchema, {
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (reply) => {
      if (reply.kind === 'ready') void queryClient.invalidateQueries({ queryKey: ['project-mode', repository] })
    },
  })
  if (query.isLoading) return <StatusMessage status="loading" />
  if (query.isError) return <StatusMessage status="error" detail="The project mode could not be read." />
  const read = query.data
  if (!read) return null
  if (read.kind !== 'ready') return <ServedState reply={read} what="The project mode" />
  const current = read.result.mode
  const selected = draft ?? current
  const evolvingNeedsReason = selected === 'evolving' && reason.trim().length === 0
  const reply = change.data
  return (
    <div className="space-y-3">
      <p className="text-sm">
        Mode of <span className="font-mono">{repository}</span>: <strong>{current}</strong>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Mode
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={selected}
            onChange={(event) => {
              setDraft(event.target.value as ProjectModeValue)
            }}
          >
            {PROJECT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Reason{selected === 'evolving' ? ' (required for evolving)' : ''}
          <Input
            value={reason}
            maxLength={500}
            onChange={(event) => {
              setReason(event.target.value)
            }}
            className="h-9 w-72"
          />
        </label>
        <Button
          size="sm"
          disabled={selected === current || evolvingNeedsReason || change.isPending}
          onClick={() => {
            change.mutate(selected)
          }}
        >
          Change mode
        </Button>
      </div>
      {reply?.kind === 'ready' && (
        <StatusMessage
          status="success"
          label={`Mode is now ${reply.result.mode}.`}
          detail={reply.result.previous ? `Previously ${reply.result.previous}.` : undefined}
        />
      )}
      {reply?.kind === 'pending' && (
        <div role="status" className="text-xs">
          <StatusMessage
            status="pending"
            label="Pending operator approval."
            detail="Arbora holds this change until an undelegated operator confirms it."
          />
          {reply.consoleUrl ? (
            <a className="underline" href={reply.consoleUrl}>
              Review the plan in the console
            </a>
          ) : null}
        </div>
      )}
      {reply && reply.kind !== 'ready' && reply.kind !== 'pending' && (
        <ServedState reply={reply} what="The mode change" />
      )}
    </div>
  )
}

export default function ProjectMode() {
  const [repository, setRepository] = useState<string | null>(null)
  return (
    <div className="space-y-4 p-4">
      <RepositoryField onSelect={setRepository} />
      {repository ? (
        <ModeControl repository={repository} />
      ) : (
        <StatusMessage status="empty" label="Choose a repository." />
      )}
    </div>
  )
}

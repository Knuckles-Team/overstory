import { useState, type SyntheticEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ServedState } from '@/components/served/ServedState'
import { StatusMessage } from '@/components/ui/status-message'
import { callServed } from '@/lib/arbora-api/served'

/**
 * Artifact graph (OVERSTORY-DECIDE-R010): renders the answers of arbora's
 * `spec.query` competency questions in the order arbora returns them. The view
 * computes no order and no state; an empty answer, a denied read and a
 * transport failure each get distinct text.
 */

export const SPEC_QUESTIONS = [
  { id: 'next_unblocked_task', label: 'Next unblocked task', subject: 'Phase or goal (optional)' },
  { id: 'changes_advancing_goal', label: 'Changes advancing a goal', subject: 'Goal' },
  { id: 'tasks_blocked_by_contract', label: 'Tasks blocked by a contract', subject: null },
  { id: 'unreachable_requirements', label: 'Unreachable requirements', subject: null },
  { id: 'unbound_requirements', label: 'Unbound requirements', subject: null },
  { id: 'uncovered_code_items', label: 'Uncovered code items', subject: null },
  { id: 'principles_at_risk', label: 'Principles at risk', subject: 'Phase' },
  { id: 'deployment_of_requirement', label: 'Deployment of a requirement', subject: 'Requirement' },
  { id: 'open_defects_in_release', label: 'Open defects in a release', subject: 'Release' },
  { id: 'changesets_between_deployments', label: 'Changesets between deployments', subject: 'Two deployments' },
] as const

type QuestionId = (typeof SPEC_QUESTIONS)[number]['id']

export const specAnswerSchema = z
  .object({ rows: z.array(z.record(z.string(), z.string())), digests: z.array(z.string()) })
  .strict()

function AnswerTable({ rows, digests }: { rows: Record<string, string>[]; digests: string[] }) {
  // The columns are the keys arbora returned, in first-seen order; rows are never sorted.
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return (
    <div className="space-y-2">
      <ol className="space-y-1" aria-label="Answer rows in the order returned">
        {rows.map((row, index) => (
          <li key={index} className="rounded border border-border/30 p-2 text-xs">
            <dl className="flex flex-wrap gap-x-4 gap-y-1">
              {columns
                .filter((column) => column in row)
                .map((column) => (
                  <div key={column} className="flex gap-1">
                    <dt className="text-muted-foreground">{column}</dt>
                    <dd className="font-mono">{row[column]}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ol>
      {digests.length > 0 && <p className="text-[11px] text-muted-foreground">Digests: {digests.join(', ')}</p>}
    </div>
  )
}

function Answer({ question, subject }: { question: QuestionId; subject: string }) {
  const query = useQuery({
    queryKey: ['spec-query', question, subject],
    queryFn: ({ signal }) =>
      callServed('spec.query', { question, subject: subject || null }, specAnswerSchema, { signal }),
    retry: false,
  })
  if (query.isLoading) return <StatusMessage status="loading" />
  if (query.isError)
    return <StatusMessage status="error" label="Transport failure." detail="The request did not complete." />
  const reply = query.data
  if (!reply) return null
  if (reply.kind !== 'ready') return <ServedState reply={reply} what="The artifact graph answer" />
  if (reply.result.rows.length === 0)
    return <StatusMessage status="empty" label="Empty answer." detail="Arbora answered and found nothing." />
  return <AnswerTable rows={reply.result.rows} digests={reply.result.digests} />
}

export default function ArtifactGraph() {
  const [question, setQuestion] = useState<QuestionId>('next_unblocked_task')
  const [subjectDraft, setSubjectDraft] = useState('')
  const [asked, setAsked] = useState<{ question: QuestionId; subject: string } | null>(null)
  const meta = SPEC_QUESTIONS.find((q) => q.id === question)
  function submit(event: SyntheticEvent) {
    event.preventDefault()
    setAsked({ question, subject: meta?.subject ? subjectDraft.trim() : '' })
  }
  return (
    <div className="space-y-4 p-4">
      <form className="flex flex-wrap items-end gap-2" onSubmit={submit}>
        <label className="flex flex-col gap-1 text-xs">
          Question
          <select
            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            value={question}
            onChange={(event) => {
              setQuestion(event.target.value as QuestionId)
            }}
          >
            {SPEC_QUESTIONS.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </label>
        {meta?.subject ? (
          <label className="flex flex-col gap-1 text-xs">
            {meta.subject}
            <Input
              value={subjectDraft}
              maxLength={512}
              onChange={(event) => {
                setSubjectDraft(event.target.value)
              }}
              className="h-9 w-64"
            />
          </label>
        ) : null}
        <Button type="submit" size="sm">
          Ask
        </Button>
      </form>
      {asked ? (
        <Answer question={asked.question} subject={asked.subject} />
      ) : (
        <StatusMessage status="empty" label="Pick a question." />
      )}
    </div>
  )
}

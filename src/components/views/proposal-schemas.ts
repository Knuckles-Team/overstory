import { z } from 'zod'

/**
 * The served `development.proposal.list` and `.review` results
 * (ARBORA-OPS-R896.5). Unknown fields are refused so a changed contract shows
 * up as an error and never as invented text.
 */
export const PROPOSAL_STATES = ['open', 'approved', 'rejected', 'landed'] as const
export const proposalStateSchema = z.enum(PROPOSAL_STATES)
export type ProposalState = z.infer<typeof proposalStateSchema>

export const proposalEvidenceSchema = z
  .object({ kind: z.string(), record_id: z.string(), digest: z.string() })
  .strict()

export const proposalSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string(),
    target: z.string(),
    evidence: z.array(proposalEvidenceSchema),
    state: proposalStateSchema,
  })
  .strict()
export type Proposal = z.infer<typeof proposalSchema>
export type ProposalEvidence = z.infer<typeof proposalEvidenceSchema>

export const proposalListSchema = z.object({ items: z.array(proposalSchema) }).strict()

export const proposalReviewSchema = z
  .object({ id: z.string(), state: proposalStateSchema, pull_request: z.string().nullable().optional() })
  .strict()
export type ProposalReviewResult = z.infer<typeof proposalReviewSchema>

/** The evidence classes the review shows for every proposal. */
export const EVIDENCE_CLASSES = [
  { id: 'code-graph', label: 'Code-graph facts', match: /code|graph|fact/i },
  { id: 'research', label: 'Research citations', match: /research|citation/i },
  { id: 'gate', label: 'Gate results', match: /gate/i },
] as const

export type EvidenceClassId = (typeof EVIDENCE_CLASSES)[number]['id']

export function evidenceByClass(evidence: ProposalEvidence[]): Record<EvidenceClassId | 'other', ProposalEvidence[]> {
  const grouped: Record<EvidenceClassId | 'other', ProposalEvidence[]> = {
    'code-graph': [],
    research: [],
    gate: [],
    other: [],
  }
  for (const item of evidence) {
    const klass = EVIDENCE_CLASSES.find((c) => c.match.test(item.kind))
    grouped[klass ? klass.id : 'other'].push(item)
  }
  return grouped
}

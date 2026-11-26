/**
 * @file store-arbora.ts
 * @description The arbora dashboard store (OVERSTORY-DASH-R010): saves, loads,
 * lists, drops and shares dashboards through the served `dashboard.*` operations.
 * EG keeps each dashboard as a catalog asset with an owner. The store sends the
 * revision it last read and maps a stale revision to a conflict result; it never
 * overwrites. An operation that is not served yet answers `unavailable`, and the
 * caller keeps the local fallback marked pending (OVERSTORY-DASH-R011).
 */
import { z } from 'zod'
import { callServed, type ServedReply } from '@/lib/arbora-api/served'
import { DashboardSchema, type Dashboard, type Panel } from './model'
import type { SaveResult } from './store'

export type DashboardRole = 'owner' | 'edit' | 'view'

const roleSchema = z.enum(['owner', 'edit', 'view'])
const grantSchema = z.object({ principal_or_group: z.string(), role: z.string() }).strict()
export type DashboardGrant = z.infer<typeof grantSchema>

const saveResultSchema = z.object({ id: z.string(), revision: z.number().int(), owner: z.string() }).strict()
const getResultSchema = z
  .object({ document: z.record(z.string(), z.unknown()), owner: z.string(), role: roleSchema })
  .strict()
const listResultSchema = z
  .object({
    items: z.array(
      z
        .object({
          id: z.string(),
          title: z.string().nullable().optional(),
          owner: z.string().nullable().optional(),
          role: z.enum(['owner', 'shared']),
        })
        .loose(),
    ),
    next_cursor: z.string().nullable().optional(),
  })
  .strict()
const deleteResultSchema = z.object({ id: z.string(), deleted: z.boolean() }).strict()
const shareResultSchema = z.object({ id: z.string(), grants: z.array(grantSchema) }).strict()
const accessResultSchema = z
  .object({ id: z.string(), owner: z.string(), role: roleSchema, grants: z.array(grantSchema) })
  .strict()

export interface DashboardListing {
  id: string
  title: string | null
  owner: string | null
  role: 'owner' | 'shared'
}

export interface DashboardAccess {
  owner: string
  role: DashboardRole
  grants: DashboardGrant[]
}

/** The outcome of a save or delete: stored, refused as a conflict, or not stored. */
export type RemoteWrite =
  | { kind: 'saved'; id: string; revision: number; owner: string }
  | { kind: 'conflict' }
  | { kind: 'unsupported'; detail: string }
  | { kind: 'unavailable' | 'denied' | 'error'; code: string }

const CONFLICT_CODE = /CONFLICT|STALE|REVISION/

function isConflict(reply: ServedReply<unknown>): boolean {
  return reply.kind === 'error' && CONFLICT_CODE.test(reply.code)
}

/** Arbora stores a panel query as `uql` text or a stored reference; the other local kinds cannot be stored faithfully. */
export function unsupportedQueryKinds(doc: Dashboard): string[] {
  return [...new Set(doc.panels.filter((panel) => panel.query.kind !== 'uql').map((panel) => panel.query.kind))]
}

function toArboraPanel(panel: Panel) {
  if (panel.query.kind !== 'uql') throw new Error('unsupported query kind')
  return {
    id: panel.id,
    title: panel.title,
    viz: panel.viz,
    query: { kind: 'uql', text: panel.query.text },
    layout: panel.layout,
    options: panel.options,
  }
}

function toArboraDocument(doc: Dashboard, storedRevision: number) {
  return {
    schema_version: 1,
    id: doc.id,
    title: doc.title,
    revision: storedRevision,
    params: doc.params,
    panels: doc.panels.map(toArboraPanel),
  }
}

/** A served document back to the local model, or null when it is not one this view can draw. */
export function fromArboraDocument(raw: Record<string, unknown>): Dashboard | null {
  const panels = Array.isArray(raw.panels) ? raw.panels : []
  const mapped = panels.map((panel: unknown) => {
    const record = (typeof panel === 'object' && panel !== null ? panel : {}) as Record<string, unknown>
    const query = record.query as { kind?: unknown; text?: unknown } | undefined
    // Terms and concepts are catalog annotations of the asset, not part of the drawn panel.
    const { terms: _terms, concepts: _concepts, ...drawn } = record
    return { ...drawn, query: query?.kind === 'uql' ? { kind: 'uql', text: query.text } : query }
  })
  const parsed = DashboardSchema.safeParse({ ...raw, panels: mapped })
  return parsed.success ? parsed.data : null
}

export interface ArboraDashboardStore {
  list(): Promise<ServedReply<DashboardListing[]>>
  load(id: string): Promise<ServedReply<{ doc: Dashboard; owner: string; role: DashboardRole }>>
  save(doc: Dashboard): Promise<RemoteWrite>
  remove(id: string): Promise<RemoteWrite>
  access(id: string): Promise<ServedReply<DashboardAccess>>
  share(
    id: string,
    subject: { grantee?: string; group?: string },
    role: 'view' | 'edit',
    action: 'grant' | 'revoke',
  ): Promise<ServedReply<DashboardGrant[]>>
}

function writeFailure(reply: Exclude<ServedReply<unknown>, { kind: 'ready' }>): RemoteWrite {
  if (isConflict(reply)) return { kind: 'conflict' }
  if (reply.kind === 'unavailable' || reply.kind === 'denied') return { kind: reply.kind, code: reply.code }
  return { kind: 'error', code: reply.kind === 'pending' ? reply.code : reply.code }
}

export function createArboraStore(): ArboraDashboardStore {
  /** The revision arbora last reported for each dashboard; the expected revision of the next write. */
  const stored = new Map<string, number>()
  return {
    async list() {
      const reply = await callServed('dashboard.list', {}, listResultSchema)
      if (reply.kind !== 'ready') return reply
      return {
        kind: 'ready',
        result: reply.result.items.map((item) => ({
          id: item.id,
          title: item.title ?? null,
          owner: item.owner ?? null,
          role: item.role,
        })),
      }
    },
    async load(id) {
      const reply = await callServed('dashboard.get', { id }, getResultSchema)
      if (reply.kind !== 'ready') return reply
      const doc = fromArboraDocument(reply.result.document)
      if (!doc) return { kind: 'error', code: 'DASHBOARD_UNREADABLE' }
      stored.set(doc.id, doc.revision)
      return { kind: 'ready', result: { doc, owner: reply.result.owner, role: reply.result.role } }
    },
    async save(doc) {
      const unsupported = unsupportedQueryKinds(doc)
      if (unsupported.length > 0)
        return {
          kind: 'unsupported',
          detail: `Arbora stores uql panels only; this dashboard has ${unsupported.join(', ')} panels.`,
        }
      const expected = stored.get(doc.id) ?? 0
      const reply = await callServed(
        'dashboard.save',
        { document: toArboraDocument(doc, expected), expected_revision: expected },
        saveResultSchema,
        { idempotencyKey: crypto.randomUUID() },
      )
      if (reply.kind !== 'ready') return writeFailure(reply)
      stored.set(reply.result.id, reply.result.revision)
      return { kind: 'saved', ...reply.result }
    },
    async remove(id) {
      const reply = await callServed(
        'dashboard.delete',
        { id, expected_revision: stored.get(id) ?? 0 },
        deleteResultSchema,
        { idempotencyKey: crypto.randomUUID() },
      )
      if (reply.kind !== 'ready') return writeFailure(reply)
      stored.delete(id)
      return { kind: 'saved', id, revision: 0, owner: '' }
    },
    async access(id) {
      const reply = await callServed('dashboard.access.get', { id }, accessResultSchema)
      if (reply.kind !== 'ready') return reply
      return {
        kind: 'ready',
        result: { owner: reply.result.owner, role: reply.result.role, grants: reply.result.grants },
      }
    },
    async share(id, subject, role, action) {
      const reply = await callServed(
        'dashboard.share',
        { id, grantee: subject.grantee ?? null, group: subject.group ?? null, role, action },
        shareResultSchema,
        { idempotencyKey: crypto.randomUUID() },
      )
      if (reply.kind !== 'ready') return reply
      return { kind: 'ready', result: reply.result.grants }
    },
  }
}

/** The local-store style result a view shows for one remote write. */
export function describeRemoteWrite(write: RemoteWrite, localMessage: string): SaveResult {
  switch (write.kind) {
    case 'saved':
      return { status: 'saved-to-arbora', message: 'Saved to arbora.' }
    case 'conflict':
      return {
        status: 'conflict',
        message: 'Arbora holds a newer revision of this dashboard. Your change was not saved there; reload to merge.',
      }
    case 'unsupported':
      return { status: 'saved-locally-pending-arbora', message: `${write.detail} ${localMessage}` }
    case 'denied':
      return {
        status: 'saved-locally-pending-arbora',
        message: `Arbora refused the save for this account. ${localMessage}`,
      }
    case 'unavailable':
      return {
        status: 'saved-locally-pending-arbora',
        message: `Arbora is not serving dashboard saves yet. ${localMessage}`,
      }
    default:
      return {
        status: 'saved-locally-pending-arbora',
        message: `Arbora did not confirm the save (${write.code}). ${localMessage}`,
      }
  }
}

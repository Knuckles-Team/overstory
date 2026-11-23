/** Browser adapter for the Arbora identity operation registry. */
import { z } from 'zod'
import { ApiShapeError } from '@/lib/api-validation'
import { matchRoute } from '@/lib/nav-registry'
import { ArboraApiError, invoke } from './invoke'
export type IdentityOp =
  | 'identity.users.list'
  | 'identity.users.create'
  | 'identity.users.disable'
  | 'identity.users.enable'
  | 'identity.users.deprovision'
  | 'identity.users.unlock'
  | 'identity.users.force_logout'
  | 'identity.users.admin_reset'
  | 'identity.service_accounts.create'
  | 'identity.service_accounts.list'
  | 'identity.service_accounts.deprovision'
  | 'identity.groups.list'
  | 'identity.groups.upsert'
  | 'identity.groups.set_members'
  | 'identity.roles.list'
  | 'identity.roles.upsert'
  | 'identity.roles.assign'
  | 'identity.roles.remove'
  | 'identity.providers.list'
  | 'identity.providers.upsert'
  | 'identity.providers.mapping_dry_run'
  | 'identity.sessions.list'
  | 'identity.sessions.revoke'
  | 'identity.api_keys.list'
  | 'identity.api_keys.revoke'
  | 'identity.audit.list'
  | 'identity.audit.export'
  | 'identity.audit.verify'
  | 'identity.policy.get'
  | 'identity.policy.set'
  | 'identity.mode.get'
  | 'identity.mode.transition_step'
  | 'identity.issuer.rotate'
  | 'identity.scim.clients.list'
  | 'identity.scim.clients.get'
  | 'identity.scim.clients.upsert'
  | 'identity.scim.clients.revoke'
  | 'access.elevation.list'
  | 'access.elevation.request'
  | 'access.elevation.approve'
  | 'access.elevation.revoke'

export type IdentityReply<T> =
  | { kind: 'ready'; result: T }
  | { kind: 'confirmation'; message: string; url?: string }
  | { kind: 'unavailable' | 'forbidden' | 'step_up' | 'error'; message: string }

const recordSchema = z.record(z.string(), z.unknown())
/** The server-issued plan-reference shape, shared with the `console.confirm`
 * route (`ConsoleConfirmView`) so both sides validate the same format. */
export const PLAN_REF = /^arbora_plan:[0-9a-f]{48}$/
const itemSchema = z
  .object({
    principal_id: z.string().optional(),
    username: z.string().optional(),
    roles: z.array(z.string()).optional(),
    id: z.string().optional(),
    handle: z.string().optional(),
    key_id: z.string().optional(),
    name: z.string().optional(),
    status: z.string().optional(),
    kind: z.string().optional(),
    description: z.string().optional(),
  })
  .loose()
const pageSchema = z.object({ items: z.array(itemSchema), next_cursor: z.string().nullable().optional() }).loose()
const scimClientSchema = z.object({ idp_id: z.string(), principal_id: z.string(), enabled: z.boolean() }).loose()
const scimPageSchema = z
  .object({ items: z.array(scimClientSchema), next_cursor: z.string().nullable().optional() })
  .loose()
const policySchema = z
  .object({
    epoch: z.number(),
    registration_policy: z.enum(['open', 'invite', 'admin_only', 'disabled']),
    local_fallback: z.enum(['off', 'break_glass', 'full']),
    password_min_chars: z.number(),
  })
  .loose()
const mappingSchema = z
  .object({ roles: z.array(z.string()), groups: z.array(z.string()), scopes: z.array(z.string()) })
  .loose()
const elevationScopeSchema = z.object({ graph: z.string(), action: z.enum(['read', 'write']) }).loose()
/** One elevation as the access service reports it, plus the receipt an
 *  approve/revoke answers with (same shape for every elevation op). */
const elevationReceiptSchema = z
  .object({
    elevation_id: z.string(),
    grantee: z.string(),
    status: z.string(),
    scopes: z.array(elevationScopeSchema),
    span_ms: z.number(),
    justification: z.string(),
    request_digest: z.string(),
    requested_at_ms: z.number(),
    revision: z.number(),
    approved_at_ms: z.number().nullable().optional(),
    hard_expires_at_ms: z.number().nullable().optional(),
    ended_at_ms: z.number().nullable().optional(),
    remaining_ms: z.number().optional(),
    own: z.boolean().optional(),
  })
  .loose()
const elevationListSchema = z.object({ elevations: z.array(elevationReceiptSchema) }).loose()
const readOps = new Set<IdentityOp>([
  'identity.users.list',
  'identity.service_accounts.list',
  'identity.groups.list',
  'identity.roles.list',
  'identity.providers.list',
  'identity.sessions.list',
  'identity.api_keys.list',
  'identity.audit.list',
  'identity.audit.export',
  'identity.audit.verify',
  'identity.policy.get',
  'identity.mode.get',
  'identity.providers.mapping_dry_run',
  'identity.scim.clients.list',
  'identity.scim.clients.get',
  'access.elevation.list',
])

/** Ops whose result shape is not just "the list/record default" -- a dict dispatch
 *  table, not an if/elif chain, so neither metric grows with each new op added. */
const EXACT_RESULT_SCHEMAS: Partial<Record<IdentityOp, z.ZodType>> = {
  'identity.scim.clients.list': scimPageSchema,
  'identity.audit.export': pageSchema,
  'identity.policy.get': policySchema,
  'identity.policy.set': policySchema,
  'identity.mode.get': z.object({ mode: z.string() }).loose(),
  'identity.mode.transition_step': z.object({ mode: z.string() }).loose(),
  'identity.issuer.rotate': z.object({ epoch: z.number(), issuer_kid_current: z.string() }).loose(),
  'identity.scim.clients.get': scimClientSchema,
  'identity.providers.mapping_dry_run': mappingSchema,
  'identity.audit.verify': z.object({ valid: z.boolean() }).loose(),
  'identity.users.admin_reset': z.object({ delivery: z.string(), one_time_secret: z.string().optional() }).loose(),
  'access.elevation.list': elevationListSchema,
  'access.elevation.approve': elevationReceiptSchema,
  'access.elevation.request': elevationReceiptSchema,
  'access.elevation.revoke': elevationReceiptSchema,
}

function resultSchema(op: IdentityOp): z.ZodType {
  const exact = EXACT_RESULT_SCHEMAS[op]
  if (exact) return exact
  if (op.endsWith('.list')) return pageSchema
  return recordSchema
}

/** The confirm-in-console URL, only when every field it names matches this exact
 *  operation's plan -- otherwise null, so the caller falls back to a plain step-up. */
function confirmedStepUpUrl(error: ArboraApiError, op: IdentityOp): string | null {
  const planRef = error.details.plan_ref
  const url = error.details.console_url
  if (typeof planRef !== 'string' || !PLAN_REF.test(planRef)) return null
  if (url !== `/console/confirm/${planRef}`) return null
  if (error.details.op !== op) return null
  return url
}

function refusal(error: ArboraApiError, op: IdentityOp): IdentityReply<never> {
  if ([404, 501, 503].includes(error.status) || ['UNKNOWN_OP', 'UNAVAILABLE', 'NOT_IMPLEMENTED'].includes(error.code))
    return { kind: 'unavailable', message: 'This identity operation is not available on this server.' }
  if (error.code === 'STEP_UP_REQUIRED') {
    const url = confirmedStepUpUrl(error, op)
    if (url) return { kind: 'confirmation', message: 'Review and confirm this action in the console.', url }
    return { kind: 'step_up', message: 'A fresh administrator MFA confirmation is required.' }
  }
  if (error.code === 'CONFIRMATION_REQUIRED')
    return { kind: 'confirmation', message: 'Review and confirm the operation plan in the administrator console.' }
  if ([401, 403].includes(error.status) || ['SURFACE_NOT_ALLOWED', 'SCOPE_REQUIRED'].includes(error.code))
    return { kind: 'forbidden', message: 'This operation requires an authorized administrator session.' }
  return { kind: 'error', message: 'The identity service did not confirm the operation.' }
}

/** No URL, token, or principal detail is reflected in a failed request. */
export async function invokeIdentity<T>(
  op: IdentityOp,
  params: Record<string, unknown> = {},
): Promise<IdentityReply<T>> {
  try {
    const result = await invoke(
      op,
      params,
      resultSchema(op),
      readOps.has(op) ? {} : { idempotencyKey: crypto.randomUUID() },
    )
    return { kind: 'ready', result: result as T }
  } catch (error) {
    if (error instanceof ArboraApiError) {
      const reply = refusal(error, op)
      if (reply.kind === 'confirmation' && reply.url && matchRoute(reply.url)?.route.id === 'console.confirm') {
        window.history.pushState({}, '', reply.url)
        window.dispatchEvent(new Event('history-state-changed'))
      }
      return reply
    }
    if (error instanceof ApiShapeError)
      return { kind: 'error', message: 'The identity service returned an invalid response.' }
    return { kind: 'unavailable', message: 'The identity service could not be reached.' }
  }
}

export interface IdentityUser {
  principal_id: string
  username?: string
  kind?: string
  status?: string
  roles?: string[]
}

export interface IdentityPage<T> {
  items: T[]
  next_cursor?: string | null
}

export interface ElevationScope {
  graph: string
  action: 'read' | 'write'
}

export interface ElevationReceipt {
  elevation_id: string
  grantee: string
  status: string
  scopes: ElevationScope[]
  span_ms: number
  justification: string
  request_digest: string
  requested_at_ms: number
  revision: number
  approved_at_ms?: number | null
  hard_expires_at_ms?: number | null
  ended_at_ms?: number | null
  remaining_ms?: number
  own?: boolean
}

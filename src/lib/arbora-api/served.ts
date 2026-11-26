/**
 * One browser reply type for served Arbora operations whose answer may be
 * unavailable, denied or waiting on a confirmation. A view renders each state
 * honestly and never fills a gap with invented data
 * (OVERSTORY-DECIDE-R009.1, OVERSTORY-DECIDE-R010.1, OVERSTORY-DECIDE-R011).
 */
import type { z } from 'zod'
import { ArboraApiError, invoke, type InvokeOptions } from './invoke'

export type ServedReply<T> =
  | { kind: 'ready'; result: T }
  /** The operation is declared but the engine behind it does not answer yet. */
  | { kind: 'unavailable'; code: string }
  | { kind: 'denied'; code: string }
  /** Arbora returned a preview or step-up plan that a person confirms in the console. */
  | { kind: 'pending'; code: string; planRef: string | null; consoleUrl: string | null }
  | { kind: 'error'; code: string }

/** The code of a reply that never produced a valid answer: network failure or wrong shape. */
export const TRANSPORT_FAILURE = 'TRANSPORT_FAILURE'

const PLAN_REF = /^[A-Za-z0-9_-]{8,128}$/
const UNAVAILABLE_CODES = new Set(['UNAVAILABLE', 'HTTP_UNAVAILABLE', 'UNKNOWN_OP', 'NOT_IMPLEMENTED'])
const DENIED_CODES = new Set(['UNAUTHENTICATED', 'SUBJECT_ACCESS_DENIED', 'PRINCIPAL_NOT_ALLOWED', 'SCOPE_REQUIRED'])

/** The confirm URL only when it names exactly the plan arbora returned. */
function consoleUrlFor(details: Record<string, unknown>): { planRef: string | null; consoleUrl: string | null } {
  const planRef = typeof details.plan_ref === 'string' && PLAN_REF.test(details.plan_ref) ? details.plan_ref : null
  const consoleUrl = planRef && details.console_url === `/console/confirm/${planRef}` ? details.console_url : null
  return { planRef, consoleUrl }
}

export function classifyServedError(error: ArboraApiError): ServedReply<never> {
  if (UNAVAILABLE_CODES.has(error.code) || [501, 503].includes(error.status))
    return { kind: 'unavailable', code: error.code }
  if (error.code === 'CONFIRMATION_REQUIRED' || error.code === 'STEP_UP_REQUIRED')
    return { kind: 'pending', code: error.code, ...consoleUrlFor(error.details) }
  if (DENIED_CODES.has(error.code) || [401, 403].includes(error.status)) return { kind: 'denied', code: error.code }
  return { kind: 'error', code: error.code }
}

/** Invoke one operation and fold every refusal into a labelled state. */
export async function callServed<T>(
  op: string,
  params: Record<string, unknown>,
  schema: z.ZodType<T>,
  options: InvokeOptions = {},
): Promise<ServedReply<T>> {
  try {
    return { kind: 'ready', result: await invoke(op, params, schema, options) }
  } catch (error) {
    if (error instanceof ArboraApiError) return classifyServedError(error)
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    // A network failure or a reply of the wrong shape is a labelled state, never an unhandled rejection.
    return { kind: 'error', code: TRANSPORT_FAILURE }
  }
}

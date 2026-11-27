/**
 * @file host-logs.ts
 * @description Typed client for arbora's host-log routes (OVERSTORY-APPS-R054).
 *
 * Data reaches the browser only through arbora's `/host/logs/reference` and
 * `/host/logs/read` routes (contract: `specs/arbora-app-surface/contracts/host-logs.md`).
 * Every answer is validated before it is rendered. A refusal is a closed union that
 * carries no log content, so a caller that receives one has nothing to show but the
 * refusal itself.
 */
import { z } from 'zod'

const referenceSchema = z.object({ log_ref: z.string().min(1).max(128) }).loose()

const recordSchema = z.strictObject({
  host_instance: z.string(),
  sequence: z.number().int().min(1),
  request: z.string(),
  timestamp: z.number().min(0),
  severity: z.string().min(1).max(32),
  message: z.string(),
})

const batchSchema = z.object({
  version: z.literal(2),
  records: z.array(recordSchema).max(128),
  cursor: z.string().max(1024).nullable(),
  gap: z.boolean(),
})

export type HostLogRecord = z.infer<typeof recordSchema>
export type HostLogBatch = z.infer<typeof batchSchema>

/** The closed set of refusals arbora gives a host-log read. */
export type HostLogRefusalKind = 'retention_gap' | 'workspace_denied' | 'unavailable'

export class HostLogRefusal extends Error {
  readonly kind: HostLogRefusalKind

  constructor(kind: HostLogRefusalKind) {
    super(`Host log refused: ${kind}`)
    this.name = 'HostLogRefusal'
    this.kind = kind
  }
}

export function refusalFor(status: number, body: unknown): HostLogRefusal {
  const detail = typeof body === 'object' && body !== null ? (body as { detail?: unknown }).detail : undefined
  if (status === 409 && detail === 'retention_gap') return new HostLogRefusal('retention_gap')
  if (status === 403 && detail === 'workspace_denied') return new HostLogRefusal('workspace_denied')
  return new HostLogRefusal('unavailable')
}

async function post(path: string, credential: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      // Cookies are never sent: arbora refuses a request that carries one.
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new HostLogRefusal('unavailable')
  }
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  if (!response.ok) throw refusalFor(response.status, parsed)
  return parsed
}

/** Ask arbora for a fresh log reference bound to the caller's current grant. */
export async function referenceHostLogs(credential: string, signal?: AbortSignal): Promise<string> {
  const parsed = referenceSchema.safeParse(await post('/host/logs/reference', credential, undefined, signal))
  if (!parsed.success) throw new HostLogRefusal('unavailable')
  return parsed.data.log_ref
}

/** Read one version-2 batch. A null cursor starts a fresh read. */
export async function readHostLogs(
  credential: string,
  logRef: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<HostLogBatch> {
  const parsed = batchSchema.safeParse(
    await post('/host/logs/read', credential, { version: 2, log_ref: logRef, cursor, limit: 128 }, signal),
  )
  if (!parsed.success) throw new HostLogRefusal('unavailable')
  return parsed.data
}

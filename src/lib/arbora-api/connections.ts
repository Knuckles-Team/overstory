/**
 * Browser adapter for the Arbora per-connector connection state
 * (`fleet.connections.state`, ARBORA-FLEET-R089). OVERSTORY-APPS-R005.3: the
 * Operate connector tiles show what the runtime reports and hold no
 * credential. A connector with no running child has no row; the view says so
 * and never invents a state.
 */
import { z } from 'zod'
import { callServed, type ServedReply } from './served'

const connectorRow = z
  .object({
    server: z.string().min(1).max(256),
    state: z.string().max(64).optional(),
    breaker: z.string().max(64).optional(),
    restart_count: z.number().int().nonnegative().optional(),
    mounted_tools: z.union([z.number().int().nonnegative(), z.array(z.string())]).optional(),
  })
  .strict()

export const connectionStateSchema = z
  .object({ value: z.object({ connectors: z.array(connectorRow) }).strict() })
  .strict()

export type ConnectorConnection = z.infer<typeof connectorRow>

export type ConnectionStates = ServedReply<Map<string, ConnectorConnection>>

/** Read the connection state of every running connector, or the labelled reason it is not served. */
export async function readConnectionStates(signal?: AbortSignal): Promise<ConnectionStates> {
  const reply = await callServed('fleet.connections.state', {}, connectionStateSchema, { signal })
  if (reply.kind !== 'ready') return reply
  return { kind: 'ready', result: new Map(reply.result.value.connectors.map((row) => [row.server, row])) }
}

/** Display count of mounted tools, whichever shape the runtime reported. */
export function mountedToolCount(row: ConnectorConnection): number | null {
  if (row.mounted_tools === undefined) return null
  return Array.isArray(row.mounted_tools) ? row.mounted_tools.length : row.mounted_tools
}

/**
 * @file parity.ts
 * @description One system, two views (OVERSTORY-CITY-R043, constitution R-G6).
 * Every city WebMCP tool is classified: `view` actions change only how the
 * city is seen and need no web UI twin; `work` actions change the system
 * and must match a web UI route, or name the follow-on row that closes the
 * gap. The parity test reads this table against the registered tool set.
 */
export interface ParityEntry {
  /** The WebMCP tool name suffix (`overstory.apps.city.<action>`). */
  action: string
  kind: 'view' | 'work'
  /** The web UI route that does the same work (work actions only). */
  route?: string
  /** The row that closes a recorded gap (work actions without a route). */
  gap?: string
}

export const PARITY: readonly ParityEntry[] = [
  { action: 'get-context', kind: 'view' },
  { action: 'set-view', kind: 'view' },
  { action: 'focus', kind: 'view' },
  { action: 'overview', kind: 'view' },
  { action: 'select', kind: 'view' },
  { action: 'clear-selection', kind: 'view' },
  { action: 'start-tour', kind: 'view' },
  { action: 'set-speed', kind: 'view' },
  { action: 'set-activity-mode', kind: 'view' },
  { action: 'scrub', kind: 'view' },
  { action: 'audio', kind: 'view' },
  { action: 'dispatch', kind: 'work', gap: 'OVERSTORY-CITY-R022' },
  { action: 'npc-dialogue', kind: 'work', gap: 'OVERSTORY-CITY-R022' },
  { action: 'npc-nearby', kind: 'work', gap: 'OVERSTORY-CITY-R022' },
  { action: 'onboard', kind: 'work', route: '/fleet' },
  { action: 'layout-edit', kind: 'work', gap: 'OVERSTORY-CITY-R040' },
]

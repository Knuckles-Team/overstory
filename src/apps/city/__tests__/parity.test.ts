/**
 * @file parity.test.ts
 * @description One system, two views (OVERSTORY-CITY-R043): every city
 * operator tool is classified, and every work action has a web UI route or
 * a recorded gap that names its follow-on row.
 */
// spec: OVERSTORY-CITY-R043
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { PARITY } from '../core/parity'
import { createCityTools, type CityToolController } from '../webmcp'
import { ROUTES } from '@/lib/nav-registry'

const ROOT = join(__dirname, '..', '..', '..', '..')

describe('parity', () => {
  it('classifies every registered city tool and lists nothing that is not registered', () => {
    const actions = new Proxy({}, { get: () => vi.fn() }) as never
    const controller = { actions, readContext: () => ({}) } as unknown as CityToolController
    const tools = createCityTools(controller).map((t) => t.name.replace('overstory.apps.city.', ''))
    expect([...tools].sort()).toEqual(PARITY.map((p) => p.action).sort())
  })

  it('gives every work action a real web UI route or a gap row that exists', () => {
    const reqs = readFileSync(join(ROOT, 'specs/arbora-city/requirements.md'), 'utf8')
    const paths = new Set(ROUTES.map((r) => r.path))
    const work = PARITY.filter((p) => p.kind === 'work')
    expect(work.length).toBeGreaterThan(0)
    for (const w of work) {
      if (w.route) expect(paths.has(w.route), `${w.action} -> ${w.route}`).toBe(true)
      else {
        expect(w.gap, `${w.action} needs a named gap`).toMatch(/^OVERSTORY-CITY-R\d+$/)
        expect(reqs.includes(`\`${w.gap}\``)).toBe(true)
      }
    }
  })
})

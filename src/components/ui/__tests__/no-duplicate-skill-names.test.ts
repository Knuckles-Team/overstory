import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SKILLS_DIR = resolve(import.meta.dirname, '../../../../agent/overstory/skills')

/** Directory names under agent/overstory/skills that hold a SKILL.md. */
function skillDirNames(): string[] {
  return readdirSync(SKILLS_DIR).filter((name) => {
    const path = resolve(SKILLS_DIR, name)
    return statSync(path).isDirectory() && readdirSync(path).includes('SKILL.md')
  })
}

/** The `name:` field declared in a SKILL.md frontmatter block, if present. */
function declaredName(dirName: string): string {
  const source = readFileSync(resolve(SKILLS_DIR, dirName, 'SKILL.md'), 'utf8')
  const match = /^name:\s*(.+)$/m.exec(source)
  return match ? match[1].trim() : dirName
}

describe('skill name inventory (OVERSTORY-DESIGN-R001)', () => {
  // spec: OVERSTORY-DESIGN-R001
  it('installs no duplicate skill directory or declared skill name', () => {
    const dirs = skillDirNames()
    expect(dirs.length).toBeGreaterThan(0)
    expect(new Set(dirs).size).toBe(dirs.length)

    const owners = new Map<string, string[]>()
    for (const dir of dirs) {
      const name = declaredName(dir)
      owners.set(name, [...(owners.get(name) ?? []), dir])
    }
    const duplicates = [...owners.entries()].filter(([, ownerDirs]) => ownerDirs.length > 1)
    expect(duplicates, `duplicate skill name(s): ${JSON.stringify(duplicates)}`).toHaveLength(0)
  })
})

describe('skill assimilation hygiene (OVERSTORY-DESIGN-R001)', () => {
  // spec: OVERSTORY-DESIGN-R001
  it('gives every skill a frontmatter name matching its directory and a description', () => {
    for (const dir of skillDirNames()) {
      const source = readFileSync(resolve(SKILLS_DIR, dir, 'SKILL.md'), 'utf8')
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? ''
      expect(frontmatter, `${dir} has frontmatter`).not.toBe('')
      expect(declaredName(dir), `${dir} name matches directory`).toBe(dir)
      expect(/^description:\s*\S+/m.test(frontmatter), `${dir} has a description`).toBe(true)
    }
  })

  // spec: OVERSTORY-DESIGN-R001
  it('adds no remote critique service or telemetry client to the package manifest', () => {
    const manifest = JSON.parse(readFileSync(resolve(SKILLS_DIR, '../../../package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
    const banned =
      /(sentry|segment|mixpanel|posthog|amplitude|datadog|logrocket|hotjar|fullstory|google-analytics|gtag)/i
    expect(names.filter((name) => banned.test(name))).toEqual([])
  })
})

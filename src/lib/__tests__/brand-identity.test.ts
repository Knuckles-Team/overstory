// spec: OVERSTORY-APPS-R038
// spec: OVERSTORY-APPS-R039
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONSENT_DISMISSED_KEY, CONSENT_STORAGE_KEY, CONSENT_VERSION } from '@/lib/consent'
import { NOT_FOUND_ROUTE, PUBLIC_ROUTES } from '@/lib/nav-registry'

const root = resolve(__dirname, '../../..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

/** The brand inventory: what a person sees reads Overstory; technical identifiers keep the component name. */
describe('client display identity', () => {
  it('names the client Overstory in the page title, share metadata and web manifest', () => {
    const html = read('index.html')
    expect(html).toMatch(/<title>Overstory<\/title>/)
    expect(html).toMatch(/og:site_name" content="Overstory"/)
    expect(html).not.toMatch(/content="[^"]*Arbora mark/)
    const manifest = JSON.parse(read('public/site.webmanifest')) as Record<string, string>
    expect(manifest.name).toBe('Overstory')
    expect(manifest.short_name).toBe('Overstory')
    expect(manifest.description).toMatch(/^Overstory /)
  })

  it('titles every public route and the not-found page with Overstory', () => {
    const titles = [...PUBLIC_ROUTES, NOT_FOUND_ROUTE].map((route) => route.page?.title).filter(Boolean)
    expect(titles.length).toBeGreaterThan(0)
    for (const title of titles) expect(title).toMatch(/Overstory/)
  })

  it('presents the README heading and docs site name as Overstory and keeps Arbora as the backend', () => {
    expect(read('README.md')).toMatch(/^# Overstory$/m)
    expect(read('mkdocs.yml')).toMatch(/^site_name: Overstory$/m)
    expect(read('README.md')).toMatch(/browser workspace for Arbora/)
  })

  it('keeps package, consent and storage identifiers on the component identity', () => {
    expect((JSON.parse(read('package.json')) as { name: string }).name).toBe('overstory')
    expect(read('pyproject.toml')).toMatch(/^name = "overstory"$/m)
    expect(CONSENT_STORAGE_KEY).toBe('overstory.consent')
    expect(CONSENT_DISMISSED_KEY).toBe('overstory.consent-dismissed')
    expect(CONSENT_VERSION).toBe('overstory-consent-v1')
  })
})

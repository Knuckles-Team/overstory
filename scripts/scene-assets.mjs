#!/usr/bin/env node
/**
 * @file scene-assets.mjs
 * @description The R012.10 pipeline runner (OVERSTORY-DESIGN-R012.10):
 * regenerates every entry of the reviewed asset manifest
 * (public/city-assets/manifest.json) through the scene3d generators and
 * verifies the locked content hashes. The generators are TypeScript, so
 * the runner bundles them with esbuild first (the same code the city
 * builds at runtime — no separate copy of the kit lives in scripts/).
 *
 *   node scripts/scene-assets.mjs --check       verify the manifest (CI)
 *   node scripts/scene-assets.mjs --report      print the manifest state
 *   node scripts/scene-assets.mjs --write-hashes
 *                                               regenerate and rewrite the
 *                                               locked hashes (review the
 *                                               diff before committing)
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST_PATH = join(ROOT, 'public', 'city-assets', 'manifest.json')

/** Bundle the generator kit (TS) to a temp ESM module node can import. */
async function loadKit() {
  const esbuild = await import('esbuild')
  const dir = mkdtempSync(join(tmpdir(), 'scene-assets-'))
  try {
    // Self-contained: three is bundled in, so the temp module resolves
    // no matter where the temp dir lives.
    await esbuild.build({
      entryPoints: [join(ROOT, 'src', 'lib', 'scene3d', 'generators', 'index.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: join(dir, 'kit.mjs'),
      logLevel: 'silent',
    })
    return await import(join(dir, 'kit.mjs'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Regenerate one manifest entry through its generator. */
function regenerate(kit, entry) {
  const { seed } = entry
  if (entry.generator === 'building') return kit.buildingAsset({ seed, ...entry.recipe })
  if (entry.generator === 'road-tile') return kit.roadTileAsset({ seed, ...entry.recipe })
  if (entry.generator === 'prop') return kit.propAsset({ seed, ...entry.recipe })
  throw new Error(`unknown generator: ${entry.generator}`)
}

async function main(kit, mode) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const regenerated = new Map()
  for (const entry of manifest.entries) {
    const asset = regenerate(kit, entry)
    regenerated.set(entry.id, kit.geometryHash(asset.geometry))
    if (mode === 'report') {
      const state = regenerated.get(entry.id) === entry.hash ? 'ok' : 'MISMATCH'
      console.log(`${state.padEnd(9)} ${entry.id.padEnd(28)} triangles ${String(asset.triangles).padEnd(6)} hash ${regenerated.get(entry.id)}`)
    }
  }
  if (mode === 'write') {
    for (const entry of manifest.entries) entry.hash = regenerated.get(entry.id)
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`)
    console.log(`wrote ${manifest.entries.length} hashes to ${MANIFEST_PATH}`)
    return
  }
  const failures = manifest.entries.filter((entry) => regenerated.get(entry.id) !== entry.hash)
  if (failures.length > 0) {
    console.error(`FAILED: ${failures.length} manifest entries do not regenerate to their locked hash:`)
    for (const entry of failures) {
      console.error(`  ${entry.id}: locked ${entry.hash} regenerated ${regenerated.get(entry.id)}`)
    }
    process.exit(1)
  }
  console.log(`ok: ${manifest.entries.length} manifest entries regenerate to their locked hashes`)
}

const mode = process.argv.includes('--check') ? 'check' : process.argv.includes('--write-hashes') ? 'write' : 'report'
await main(await loadKit(), mode)

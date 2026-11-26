// Starts the real arbora no-auth sandbox as local processes on loopback: the
// medulla-server binary shipped in the engine wheel, then arbora in explicit
// no-auth mode in front of it. Playwright runs this as a webServer and stops
// it with SIGTERM. Nothing here replaces arbora, its registry or its engine.
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const pin = JSON.parse(readFileSync(new URL('./pin.json', import.meta.url), 'utf8'))
const venv = process.env.LOOPBACK_ARBORA_VENV
if (!venv) {
  console.error('LOOPBACK_ARBORA_VENV must name the venv made by scripts/loopback-arbora-venv.sh')
  process.exit(2)
}
const bin = (name) => join(venv, 'bin', name)
const python = bin('python')
const arboraPort = Number(process.env.LOOPBACK_ARBORA_PORT ?? pin.arboraPort)
const enginePort = Number(process.env.LOOPBACK_ENGINE_PORT ?? pin.enginePort)

const root = mkdtempSync(join(tmpdir(), 'overstory-loopback-'))
const config = join(root, 'config')
for (const dir of [config, join(root, 'store'), join(root, 'xdg-config'), join(root, 'xdg-data'), join(root, 'cache')])
  mkdirSync(dir, { recursive: true })
writeFileSync(
  join(config, 'config.json'),
  JSON.stringify({
    ARBORA_AUTH_MODE: 'none',
    DEPLOYMENT_PROFILE: 'single-node-prod',
    GRAPH_SERVICE_ENDPOINTS: `tcp://127.0.0.1:${enginePort}`,
    ENABLE_WEB_UI: false,
    MESSAGING_INTAKE_ENABLED: false,
    MCP_HTTP_ALLOWED_PRIVATE_HOSTS: '127.0.0.1',
    EMBEDDING_MODELS: '[]',
    CHAT_MODELS: '[]',
  }),
)
writeFileSync(join(config, 'mcp_config.json'), JSON.stringify({ mcpServers: {} }))

const baseEnv = {
  PATH: `${join(venv, 'bin')}:${process.env.PATH}`,
  LANG: process.env.LANG ?? 'C.UTF-8',
  HOME: root,
  XDG_CONFIG_HOME: join(root, 'xdg-config'),
  XDG_DATA_HOME: join(root, 'xdg-data'),
  XDG_CACHE_HOME: join(root, 'cache'),
  HF_HUB_OFFLINE: '1',
  TRANSFORMERS_OFFLINE: '1',
}
const arboraEnv = { ...baseEnv, ARBORA_CONFIG_DIR: config, ARBORA_AUTH_MODE: 'none' }

const principal = spawnSync(
  python,
  ['-I', '-c', 'from arbora.security.anonymous import PRINCIPAL; print(PRINCIPAL)'],
  {
    encoding: 'utf8',
    env: baseEnv,
  },
)
if (principal.status !== 0) {
  console.error(principal.stderr)
  process.exit(2)
}
const importer = createHash('sha256').update(principal.stdout.trim()).digest('hex')
const server = spawnSync(
  python,
  ['-I', '-c', 'from medulla.server_binary import resolve_server_binary as r; print(r())'],
  { encoding: 'utf8', env: baseEnv },
)
if (server.status !== 0) {
  console.error(server.stderr)
  process.exit(2)
}

const children = []
function start(name, command, args, env) {
  const log = openSync(join(root, `${name}.log`), 'w')
  const child = spawn(command, args, { env, stdio: ['ignore', log, log] })
  children.push(child)
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${name} exited with ${code}; logs in ${root}`)
      stop(1)
    }
  })
  return child
}
let stopping = false
function stop(code) {
  stopping = true
  for (const child of children.reverse()) child.kill('SIGTERM')
  setTimeout(() => {
    rmSync(root, { recursive: true, force: true })
    process.exit(code)
  }, 1500)
}
process.on('SIGTERM', () => stop(0))
process.on('SIGINT', () => stop(0))

const listening = (port) =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
  })
async function until(check, what, seconds) {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (await check()) return
    await new Promise((r) => setTimeout(r, 500))
  }
  console.error(`timed out waiting for ${what}; logs in ${root}`)
  stop(1)
  await new Promise(() => {})
}

start(
  'engine',
  server.stdout.trim(),
  ['--auth-mode', 'none', '--tcp-only', '--tcp-addr', `127.0.0.1:${enginePort}`, '--persist-dir', join(root, 'store')],
  { ...baseEnv, MEDULLA_CONNECTOR_PACK_IMPORTERS: `arbora=principal:sha256:${importer}` },
)
await until(() => listening(enginePort), 'the engine', 60)
for (const operation of ['provision-semantic-content', 'onboard-fleet']) {
  const result = spawnSync(
    bin('arbora-production-ops'),
    [operation, '--served-url', `http://127.0.0.1:${arboraPort}/mcp`],
    { env: arboraEnv, encoding: 'utf8', timeout: 180000 },
  )
  // Provisioning is content for the fleet surfaces; the operations the
  // journeys read do not depend on it, so a refusal is reported, not hidden.
  if (result.status !== 0) console.error(`${operation} refused: ${result.stdout}${result.stderr}`)
}
start(
  'arbora',
  bin('arbora'),
  ['--transport', 'streamable-http', '--host', '127.0.0.1', '--port', String(arboraPort), '--auth-type', 'none'],
  arboraEnv,
)
await until(
  () =>
    fetch(`http://127.0.0.1:${arboraPort}/health`).then(
      (r) => r.ok,
      () => false,
    ),
  'arbora',
  180,
)
console.log(`loopback arbora ready on ${arboraPort} (logs in ${root})`)
setInterval(() => {}, 1 << 30)

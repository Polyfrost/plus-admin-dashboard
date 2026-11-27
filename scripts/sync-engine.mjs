import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'src', 'vendor', 'plusrenderer')
const scripts = ['index.js', 'cosmetic.js', 'nameplate.js', 'nameplate.d.ts', 'nameplate-gl.js', 'preview.js', 'preview.d.ts']
const wasm = 'plusrenderer.wasm'
const built = join('target', 'wasm32-unknown-unknown', 'wasm', 'plusrenderer_ffi.wasm')
const required = ['renderer_build_f64', 'renderer_load_asset', 'renderer_effect_geometry', 'renderer_frame_wearers_shaped', 'cosmetic_parse', 'nameplate_parse']

function flag(name) {
    const args = process.argv.slice(2)
    const at = args.indexOf(`--${name}`)
    if (at >= 0) return args[at + 1]
    const inline = args.find((arg) => arg.startsWith(`--${name}=`))
    return inline ? inline.slice(name.length + 3) : undefined
}

function git(args, cwd) {
    try {
        return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    } catch {
        return null
    }
}

function crlf(text) {
    return text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n')
}

function fail(message) {
    console.error(message)
    process.exit(1)
}

const nearby = [join(root, '..'), join(root, '..', '..')].map((dir) => join(dir, 'plusrenderer', 'packages', 'renderer'))
const engine = resolve(flag('engine') ?? process.env.PLUSRENDERER_DIST ?? nearby.find((dir) => existsSync(dir)) ?? nearby[0])
const repo = git(['rev-parse', '--show-toplevel'], engine)
const wasmSource = resolve(flag('wasm') ?? process.env.PLUSRENDERER_WASM ?? (repo && existsSync(join(repo, built)) ? join(repo, built) : join(engine, wasm)))

const missing = scripts.filter((name) => !existsSync(join(engine, name)))
if (missing.length) fail(`plusrenderer not found at ${engine} (missing ${missing.join(', ')}). Pass its packages/renderer folder with --engine <path> or PLUSRENDERER_DIST.`)
if (!existsSync(wasmSource)) fail(`No wasm at ${wasmSource}. Build it in plusrenderer with: cargo +1.97 build -p plusrenderer-ffi --profile wasm --target wasm32-unknown-unknown`)

const bytes = readFileSync(wasmSource)
const exported = new Set(WebAssembly.Module.exports(new WebAssembly.Module(bytes)).map((entry) => entry.name))
const absent = required.filter((name) => !exported.has(name))
if (absent.length) fail(`${wasmSource} is missing ${absent.join(', ')}, so it is older than the scripts. Rebuild it.`)

mkdirSync(target, { recursive: true })
for (const name of [...scripts, wasm]) rmSync(join(target, name), { force: true })
for (const name of scripts) writeFileSync(join(target, name), crlf(readFileSync(join(engine, name), 'utf8')))
writeFileSync(join(target, wasm), bytes)

const commit = repo ? git(['rev-parse', 'HEAD'], repo) : null
const status = commit ? git(['status', '--porcelain'], repo) : null
const info = {
    commit,
    dirty: status === null ? null : status.length > 0,
    hash: createHash('sha256').update(bytes).digest('hex'),
    path: engine,
    wasm: wasmSource,
    synced: new Date().toISOString(),
}
writeFileSync(join(target, 'source.json'), crlf(`${JSON.stringify(info, null, 2)}\n`))

console.log(`Copied ${scripts.join(', ')} from ${engine} and ${wasm} from ${wasmSource} to ${target}`)
console.log(`plusrenderer commit ${commit ?? 'unknown'}${info.dirty ? ' (with uncommitted changes)' : ''}, wasm sha256 ${info.hash}`)

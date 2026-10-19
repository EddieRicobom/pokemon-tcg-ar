/**
 * Incorpora os sprites que o app pode resolver: Showdown (GIF), PNG padrão e
 * PNG Home, nas variantes normal e shiny. O manifesto guarda a revisão exata,
 * hash e tamanho de cada arquivo para o Pages servir primeiro o pacote local.
 *
 * Uso: npm run sync:sprites
 *      npm run sync:sprites -- --check   # só confere o pacote atual
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const OUT_DIR = join(ROOT, 'public', 'sprites', 'pokeapi');
const MANIFEST_PATH = join(ROOT, 'public', 'data', 'pokeapi-sprite-manifest.json');
const REPOSITORY = 'PokeAPI/sprites';
const API = `https://api.github.com/repos/${REPOSITORY}`;
const RAW = `https://raw.githubusercontent.com/${REPOSITORY}`;
const CHECK_ONLY = process.argv.includes('--check');
const MAX_PARALLEL = 8;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRIES = 2;

interface TreeEntry { path: string; type: string; sha: string; size?: number }
interface SourceAsset { key: string; sourcePath: string; path: string; sha: string; size: number }
interface PreviousManifest { assets?: Record<string, { bytes?: number; sha256?: string }> }

function assetIds(): number[] {
  const heights = JSON.parse(readFileSync(join(ROOT, 'src', 'core', 'data', 'pokemon-heights.json'), 'utf8')) as {
    heights: number[];
    forms: Record<string, number>;
  };
  const ids = new Set<number>();
  heights.heights.forEach((height, id) => { if (id > 0 && height > 0) ids.add(id); });
  for (const id of Object.keys(heights.forms)) {
    const parsed = Number(id);
    if (Number.isInteger(parsed) && parsed > 0) ids.add(parsed);
  }
  return [...ids].sort((a, b) => a - b);
}

function candidates(id: number): { key: string; sourcePath: string; path: string }[] {
  const file = String(id);
  return [
    ['showdown', `sprites/pokemon/other/showdown/${file}.gif`, `showdown/${file}.gif`],
    ['showdown', `sprites/pokemon/other/showdown/shiny/${file}.gif`, `showdown/shiny/${file}.gif`],
    ['default', `sprites/pokemon/${file}.png`, `default/${file}.png`],
    ['default', `sprites/pokemon/shiny/${file}.png`, `default/shiny/${file}.png`],
    ['home', `sprites/pokemon/other/home/${file}.png`, `home/${file}.png`],
    ['home', `sprites/pokemon/other/home/shiny/${file}.png`, `home/shiny/${file}.png`],
  ].map(([key, sourcePath, path]) => ({ key: `${key}/${path.slice(key.length + 1)}`, sourcePath, path }));
}

async function getJson<T>(url: string): Promise<T> {
  const token = process.env.GITHUB_TOKEN;
  const response = await request(url, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'pokemon-tcg-ar-assets',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} ao consultar ${url}`);
  return response.json() as Promise<T>;
}

/** Lê só uma pasta da árvore Git. A árvore inteira dos sprites é grande demais para a API recursiva. */
async function treeAt(rootSha: string, path: string): Promise<TreeEntry[]> {
  let sha = rootSha;
  for (const part of path.split('/')) {
    const tree = await getJson<{ tree: TreeEntry[]; truncated: boolean }>(`${API}/git/trees/${sha}`);
    if (tree.truncated) throw new Error(`A pasta ${path} foi truncada pela fonte; não é seguro importar dela.`);
    const next = tree.tree.find((entry) => entry.path === part && entry.type === 'tree');
    if (!next) throw new Error(`Pasta ausente na fonte: ${path}`);
    sha = next.sha;
  }
  const tree = await getJson<{ tree: TreeEntry[]; truncated: boolean }>(`${API}/git/trees/${sha}`);
  if (tree.truncated) throw new Error(`A pasta ${path} foi truncada pela fonte; não é seguro importar dela.`);
  return tree.tree;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (response.ok || response.status === 404 || response.status === 410 || attempt === RETRIES) return response;
      lastError = new Error(`HTTP ${response.status} ao consultar ${url}`);
    } catch (error) {
      lastError = error;
      if (attempt === RETRIES) break;
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw lastError instanceof Error ? lastError : new Error(`Falha ao consultar ${url}`);
}

async function mapLimit<T>(items: readonly T[], task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      if (item !== undefined) await task(item);
    }
  }));
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function isImage(data: Uint8Array, path: string): boolean {
  if (path.endsWith('.gif')) return data.length >= 13 && (new TextDecoder().decode(data.subarray(0, 6)) === 'GIF87a' || new TextDecoder().decode(data.subarray(0, 6)) === 'GIF89a') && data[data.length - 1] === 0x3b;
  return data.length >= 24 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47 && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a;
}

function totals(): { files: number; bytes: number } {
  if (!existsSync(OUT_DIR)) return { files: 0, bytes: 0 };
  const paths = readdirSync(OUT_DIR, { recursive: true, withFileTypes: true });
  let files = 0;
  let bytes = 0;
  for (const entry of paths) {
    if (!entry.isFile()) continue;
    const info = statSync(join(entry.parentPath, entry.name));
    files++;
    bytes += info.size;
  }
  return { files, bytes };
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const before = totals();
  const ref = await getJson<{ object: { sha: string } }>(`${API}/git/ref/heads/master`);
  const commit = ref.object.sha;
  const commitInfo = await getJson<{ tree: { sha: string } }>(`${API}/git/commits/${commit}`);
  const sourceDirs = [
    'sprites/pokemon/other/showdown',
    'sprites/pokemon/other/showdown/shiny',
    'sprites/pokemon',
    'sprites/pokemon/shiny',
    'sprites/pokemon/other/home',
    'sprites/pokemon/other/home/shiny',
  ];
  const sourceByPath = new Map<string, TreeEntry>();
  await Promise.all(sourceDirs.map(async (sourceDir) => {
    for (const entry of await treeAt(commitInfo.tree.sha, sourceDir)) {
      if (entry.type === 'blob') sourceByPath.set(`${sourceDir}/${entry.path}`, entry);
    }
  }));
  const allCandidates = assetIds().flatMap(candidates);
  const absent = allCandidates.flatMap((candidate) => sourceByPath.has(candidate.sourcePath) ? [] : [{ key: candidate.key, sourcePath: candidate.sourcePath }]);
  const wanted = allCandidates.flatMap((candidate) => {
    const entry = sourceByPath.get(candidate.sourcePath);
    return entry && typeof entry.size === 'number' ? [{ ...candidate, sha: entry.sha, size: entry.size }] : [];
  });
  if (wanted.length === 0) throw new Error('Nenhum sprite correspondente foi encontrado na fonte.');

  const assets: Record<string, { path: string; sourcePath: string; sourceCommit: string; bytes: number; sha256: string }> = {};
  let previous: PreviousManifest = {};
  if (existsSync(MANIFEST_PATH)) {
    try { previous = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as PreviousManifest; } catch { /* manifesto antigo inválido: todos os arquivos serão revalidados */ }
  }
  let downloaded = 0;
  let reused = 0;
  await mapLimit(wanted, async (asset: SourceAsset) => {
    const output = join(OUT_DIR, asset.path);
    let data: Buffer | null = null;
    if (existsSync(output) && statSync(output).size === asset.size) {
      const current = readFileSync(output);
      const previousAsset = previous.assets?.[asset.key];
      if (previousAsset?.bytes === current.length && previousAsset.sha256 === sha256(current) && isImage(current, asset.path)) data = current;
    }
    if (data) {
      reused++;
    } else if (!CHECK_ONLY) {
      const response = await request(`${RAW}/${commit}/${asset.sourcePath}`);
      if (!response.ok) throw new Error(`HTTP ${response.status} ao baixar ${asset.sourcePath}`);
      data = Buffer.from(await response.arrayBuffer());
      if (data.length !== asset.size || !isImage(data, asset.path)) throw new Error(`Arquivo inválido para ${asset.sourcePath}: ${data.length} bytes, esperado ${asset.size} e assinatura de imagem válida`);
      mkdirSync(dirname(output), { recursive: true });
      const temporary = `${output}.tmp-${process.pid}`;
      writeFileSync(temporary, data);
      renameSync(temporary, output);
      downloaded++;
    }
    if (!data) throw new Error(`Falta ${asset.path}; rode sem --check para incorporá-lo.`);
    assets[asset.key] = { path: `sprites/pokeapi/${asset.path.replace(/\\/g, '/')}`, sourcePath: asset.sourcePath, sourceCommit: commit, bytes: data.length, sha256: sha256(data) };
  });

  const manifest = { version: 1 as const, generatedAt: new Date().toISOString(), source: { repository: REPOSITORY, commit }, assets, absent };
  if (!CHECK_ONLY) {
    mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const total = Object.values(assets).reduce((sum, asset) => sum + asset.bytes, 0);
  const after = totals();
  console.log(`sprites PokéAPI: ${Object.keys(assets).length} arquivos (+${downloaded} novos/atualizados, ${reused} reutilizados), ${absent.length} ausências confirmadas; catálogo ${(total / 1024 / 1024).toFixed(1)} MB; pacote ${before.files} arquivos/${(before.bytes / 1024 / 1024).toFixed(1)} MB → ${after.files}/${(after.bytes / 1024 / 1024).toFixed(1)} MB; ${((Date.now() - startedAt) / 1000).toFixed(1)} s; revisão ${commit}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

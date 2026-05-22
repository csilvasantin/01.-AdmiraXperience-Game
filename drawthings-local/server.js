#!/usr/bin/env node
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.DRAWTHINGS_BRIDGE_PORT || 7869);
const HOST = process.env.DRAWTHINGS_BRIDGE_HOST || '127.0.0.1';
const MODEL = process.env.DRAWTHINGS_MODEL || 'flux_2_klein_4b_q6p.ckpt';
const CLI = process.env.DRAWTHINGS_CLI || 'draw-things-cli';
const OUTPUT_DIR = process.env.DRAWTHINGS_OUTPUT_DIR || path.join(__dirname, 'outputs');
const MAX_BODY = 64 * 1024;
const ALLOWED_ORIGINS = new Set([
  'https://www.admira.studio',
  'https://admira.studio',
  'https://csilvasantin.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

function corsOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(origin)) return origin;
  return 'https://www.admira.studio';
}

function send(req, res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': corsOrigin(req),
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > MAX_BODY) {
        reject(new Error('body_too_large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function safeDimension(value, fallback) {
  const n = Number(value || fallback);
  const clamped = Math.max(512, Math.min(1536, Number.isFinite(n) ? n : fallback));
  return Math.round(clamped / 64) * 64;
}

function safeSeed(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return Math.floor(Math.random() * 2147483647);
  return Math.abs(Math.trunc(n)) % 2147483647;
}

function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(CLI, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `draw-things-cli exited ${code}`).trim()));
    });
  });
}

async function handleGenerate(req, res) {
  const body = await readJson(req);
  const prompt = String(body.prompt || '').trim();
  if (!prompt) return send(req, res, 400, { ok: false, error: 'missing_prompt' });

  const width = safeDimension(body.width, 1344);
  const height = safeDimension(body.height, 768);
  const steps = Math.max(8, Math.min(60, Number(body.steps || 24)));
  const seed = safeSeed(body.seed);
  const filename = `admira-drawthings-${Date.now()}-${seed}.png`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  const args = [
    'generate',
    '--model', String(body.model || MODEL),
    '--prompt', prompt,
    '--negative-prompt', String(body.negativePrompt || 'low quality, blurry, watermark, logo, text artifacts'),
    '--width', String(width),
    '--height', String(height),
    '--steps', String(steps),
    '--seed', String(seed),
    '--output', outputPath,
    '--disable-preview',
  ];

  await runCli(args);
  send(req, res, 200, {
    ok: true,
    filename,
    url: `http://${HOST}:${PORT}/outputs/${encodeURIComponent(filename)}`,
    model: String(body.model || MODEL),
    width,
    height,
    steps,
    seed,
  });
}

function serveOutput(req, res, pathname) {
  const filename = path.basename(decodeURIComponent(pathname.replace('/outputs/', '')));
  const filePath = path.join(OUTPUT_DIR, filename);
  if (!filename || !fs.existsSync(filePath)) return send(req, res, 404, { ok: false, error: 'not_found' });
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Access-Control-Allow-Origin': corsOrigin(req),
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (req.method === 'OPTIONS') return send(req, res, 204, {});
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(req, res, 200, { ok: true, model: MODEL, cli: CLI, outputDir: OUTPUT_DIR });
    }
    if (req.method === 'GET' && url.pathname.startsWith('/outputs/')) return serveOutput(req, res, url.pathname);
    if (req.method === 'POST' && url.pathname === '/generate') return await handleGenerate(req, res);
    send(req, res, 404, { ok: false, error: 'not_found' });
  } catch (err) {
    send(req, res, 500, { ok: false, error: err && err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Draw Things bridge listening on http://${HOST}:${PORT}`);
  console.log(`Model: ${MODEL}`);
});

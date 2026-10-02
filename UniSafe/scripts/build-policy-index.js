#!/usr/bin/env node
/**
 * build-policy-index.js
 *
 * 1. Extracts text from every PDF in Assets/Policies/<folder>.
 * 2. Chunks each document (~700 tokens, ~15% overlap).
 * 3. Tags each chunk with: source filename, policy title, category folder, page number.
 * 4. Generates embeddings via Voyage AI and stores
 *    a flat JSON index with cosine-similarity fallback search.
 *
 * Output: Assets/policy-index.json
 *
 * Env vars required:
 *   VOYAGE_API_KEY   — your Voyage AI API key
 *
 * Run:  VOYAGE_API_KEY=... node scripts/build-policy-index.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const POLICIES = path.join(ROOT, 'Assets', 'Policies');
const INDEX_PATH = path.join(ROOT, 'Assets', 'policy-index.json');

const CHUNK_TARGET_TOKENS = 700;
const OVERLAP_FRACTION = 0.15;
const EMBEDDING_MODEL = 'voyage-3';
const API_BASE = 'https://api.voyageai.com';

function resolveCatalog() {
  const rel = path.join(ROOT, 'src', 'data', 'policyCatalog.js');
  const raw = fs.readFileSync(rel, 'utf-8');
  const m = raw.match(/export\s+const\s+POLICY_CATALOG\s*=\s*(\{[\s\S]*?\});/);
  if (!m) throw new Error('Could not parse POLICY_CATALOG from policyCatalog.js');
  return Function('return ' + m[1])();
}

function listPdfFiles(dir) {
  return fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
}

function statSyncSafe(p) {
  try { return fs.statSync(p); } catch { return null; }
}

async function loadPdfParse() {
  try {
    const mod = await import('pdf-parse');
    return mod.default || mod;
  } catch (e) {
    return null;
  }
}

async function extractPdfText(filePath, pdfParse) {
  if (pdfParse) {
    const data = fs.readFileSync(filePath);
    const result = await pdfParse(data);
    return result.text;
  }
  throw new Error('No PDF parser available. Install pdf-parse: npm install pdf-parse');
}

function tokenize(text) {
  return text.split(/\s+/).filter(Boolean);
}

function splitSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(Boolean);
}

function chunkText(fullText, targetTokens = CHUNK_TARGET_TOKENS, overlapFrac = OVERLAP_FRACTION) {
  const sentences = splitSentences(fullText);
  const chunks = [];
  let start = 0;
  while (start < sentences.length) {
    let current = '';
    let i = start;
    while (i < sentences.length && tokenize(current + ' ' + sentences[i]).length < targetTokens) {
      current = (current + ' ' + sentences[i]).trim();
      i++;
    }
    chunks.push(current);
    const overlapTokens = Math.floor(targetTokens * overlapFrac);
    let moved = 0;
    let j = start;
    while (j < i && moved < overlapTokens) {
      moved += tokenize(sentences[j]).length;
      j++;
    }
    start = Math.max(j, start + 1);
    if (start >= sentences.length) break;
  }
  return chunks.filter(B => B.trim().length > 0);
}

async function embedBatch(texts) {
  const key = process.env.VOYAGE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('VOYAGE_API_KEY or ANTHROPIC_API_KEY env var is required');

  const body = JSON.stringify({ input: texts, model: EMBEDDING_MODEL });
  const resp = await fetch(`${API_BASE}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body,
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Voyage embeddings failed (${resp.status}): ${errText}`);
  }
  const data = await resp.json();
  const out = new Array(data.data.length);
  for (const d of data.data) out[d.index] = d.embedding;
  return out;
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function main() {
  const catalog = resolveCatalog();
  const pdfParse = await loadPdfParse();

  let totalPages = 0;
  let totalChunks = 0;

  console.log('Policy Index Builder\n');

  const docs = [];
  for (const [folder, policies] of Object.entries(catalog)) {
    const folderPath = path.join(POLICIES, folder);
    if (!fs.existsSync(folderPath)) {
      console.warn('  Missing folder:', folderPath);
      continue;
    }
    const files = listPdfFiles(folderPath);
    for (const f of files) {
      const meta = policies.find(p => p.filename === f) || { filename: f, title: f.replace(/\.pdf$/i, '') };
      docs.push({
        folder,
        filename: f,
        title: meta.title,
        filePath: path.join(folderPath, f),
      });
    }
  }

  console.log(`Found ${docs.length} policy PDFs. Extracting text...\n`);

  const textMap = new Map();
  for (const doc of docs) {
    process.stdout.write(`  ${doc.folder}/${doc.filename} ...`);
    try {
      const text = await extractPdfText(doc.filePath, pdfParse);
      textMap.set(doc.filePath, { text, title: doc.title, folder: doc.folder, filename: doc.filename });
      process.stdout.write(` OK\n`);
    } catch (e) {
      process.stdout.write(` FAILED: ${e.message}\n`);
    }
  }

  const chunks = [];
  for (const [filePath, { text, title, folder, filename }] of textMap.entries()) {
    const split = text.split(/\n---\s*Page\s+\d+\s*---\n/);
    const pages = Math.max(1, split.length - 1);
    totalPages += pages;

    const rawChunks = chunkText(text);
    for (let i = 0; i < rawChunks.length; i++) {
      chunks.push({
        id: crypto.createHash('sha256').update(`${filename}-${i}`).digest('hex').slice(0, 16),
        title,
        folder,
        filename,
        page: i + 1,
        text: rawChunks[i],
      });
    }
    totalChunks += rawChunks.length;
  }

  console.log(`\nTotal chunks: ${totalChunks} across ${textMap.size} documents (${totalPages} pages).`);

  const BATCH = 100;
  console.log(`Embedding with ${EMBEDDING_MODEL} ...\n`);
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH).map(c => c.text);
    process.stdout.write(`  batch ${Math.floor(i / BATCH) + 1} / ${Math.ceil(chunks.length / BATCH)} ... `);
    const vectors = await embedBatch(batch);
    for (let j = 0; j < vectors.length; j++) {
      chunks[i + j].embedding = vectors[j];
    }
    process.stdout.write('OK\n');
  }

  const index = {
    generatedAt: new Date().toISOString(),
    model: EMBEDDING_MODEL,
    dims: chunks[0]?.embedding?.length || 0,
    docs: totalPages,
    chunks: totalChunks,
    records: chunks.map(c => ({
      id: c.id,
      title: c.title,
      folder: c.folder,
      filename: c.filename,
      page: c.page,
      text: c.text,
      embedding: c.embedding,
    })),
  };

  fs.mkdirSync(path.dirname(INDEX_PATH), { recursive: true });
  fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`\nIndex written to ${INDEX_PATH}`);
  console.log(`Size: ${(fs.statSync(INDEX_PATH).size / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });

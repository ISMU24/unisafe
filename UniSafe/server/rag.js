import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = path.join(__dirname, '..', 'assets', 'policy-index.json');
const TOP_K = 5;
const MODEL = 'claude-sonnet-4-20250514';

let index = null;
let anthropic = null;

export function init({ apiKey } = {}) {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || apiKey;
  if (anthropicKey) {
    anthropic = new Anthropic({ apiKey: anthropicKey });
  }
  loadIndex();
}

/**
 * Whether policy Q&A can actually answer right now. The rest of the system
 * (incidents, SOS, dashboard) does not depend on this, so a missing key must
 * degrade to "unavailable" rather than crash the server.
 */
export function ragStatus() {
  return {
    configured: Boolean(process.env.ANTHROPIC_API_KEY) && Boolean(process.env.VOYAGE_API_KEY),
    index: index ? 'loaded' : 'missing',
  };
}

function loadIndex() {
  try {
    const raw = fs.readFileSync(INDEX_PATH, 'utf-8');
    index = JSON.parse(raw);
    console.log(`Policy index loaded: ${index.records?.length || 0} chunks`);
  } catch (e) {
    console.warn('Policy index not found (run npm run index:policies to build it):', e.message);
    index = null;
  }
}

function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}

async function embedQuestion(question) {
  const resp = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({ input: question, model: 'voyage-3' }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Voyage embeddings failed: ${resp.status} ${t}`);
  }
  const data = await resp.json();
  return data.data[0].embedding;
}

function retrieve(queryEmbedding, k = TOP_K) {
  if (!index || !index.records) return [];
  const scored = index.records.map(r => ({
    ...r,
    score: cosineSim(queryEmbedding, r.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

const SYSTEM_PROMPT = `You are a policy assistant for the Papua New Guinea University of Technology (UniSafe).
You answer questions using ONLY the provided policy excerpts.
Rules:
1. If the answer is in the excerpts, answer concisely and cite the source policy title and page number after every claim, using the format: [Source: <filename>, p.<page>].
2. If the answer is NOT in the excerpts, say "I could not find this information in the retrieved policies" — do not speculate or guess.
3. Never invent policy content.
4. Output a short, direct answer (max 3-4 sentences) followed by a list of cited sources.`;

export async function answerQuestion(question) {
  if (!index) {
    loadIndex();
    if (!index) {
      return { error: 'Policy index not available. Run: npm run index:policies' };
    }
  }
  if (!process.env.VOYAGE_API_KEY) {
    return { error: 'VOYAGE_API_KEY not configured on the server.' };
  }
  if (!anthropic) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      return { error: 'ANTHROPIC_API_KEY not configured on the server.' };
    }
    anthropic = new Anthropic({ apiKey: key });
  }

  let queryEmbedding;
  try {
    queryEmbedding = await embedQuestion(question);
  } catch (error) {
    return { error: `Policy search is temporarily unavailable: ${error.message}` };
  }
  const chunks = retrieve(queryEmbedding);

  if (chunks.length === 0) {
    return { answer: 'I could not find any relevant policies for your question.', sources: [] };
  }

  const contextBlock = chunks
    .map((c, i) => `[${i + 1}] Source: ${c.title} (${c.filename})\nPage: ${c.page}\n---\n${c.text}\n---`)
    .join('\n\n');

  let completion;
  try {
    completion = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: `Question: ${question}\n\nPolicy excerpts:\n${contextBlock}` },
      ],
    });
  } catch (error) {
    return { error: `Policy search is temporarily unavailable: ${error.message}` };
  }

  const textBlock = completion.content.find(b => b.type === 'text');
  const answer = textBlock ? textBlock.text : 'No response generated.';

  const sources = chunks.map(c => ({
    title: c.title,
    filename: c.filename,
    folder: c.folder,
    page: c.page,
    score: Math.round(c.score * 100) / 100,
  }));

  return { answer, sources };
}

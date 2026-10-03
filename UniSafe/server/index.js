import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { init, answerQuestion, ragStatus } from './rag.js';
import { initRealtime, getIo } from './src/realtime.js';
import authRoutes from './src/auth/routes.js';
import incidentsRoutes from './src/routes/incidents.js';
import sosRoutes from './src/routes/sos.js';
import alertsRoutes from './src/routes/alerts.js';
import assistanceRoutes from './src/routes/assistance.js';
import appealsRoutes from './src/routes/appeals.js';
import usersRoutes from './src/routes/users.js';
import dashboardRoutes from './src/routes/dashboard.js';
import auditRoutes from './src/routes/audit.js';
import { seedInitialAdmin } from './src/auth/database.js';
import db, { checkConnection, isPostgres } from './src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const POLICIES_DIR = path.join(ASSETS_DIR, 'Policies');

const app = express();
const httpServer = createServer(app);

// Render (and most PaaS) sit behind a load balancer. Without this, req.ip is
// always the proxy's internal address instead of the real client IP.
app.set('trust proxy', 1);

// ── Allowed browser origins.
// CLIENT_ORIGINS is the documented variable; ALLOWED_ORIGINS is kept as an
// alias so existing deployments keep working. Requests with no Origin header
// (native mobile apps, curl, supertest) are always allowed.
const DEV_ORIGINS = [
  'http://localhost:8081',
  'http://localhost:19000',
  'http://localhost:19006',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19000',
  'http://localhost:5173',
  'http://localhost:3000',
];

function readOrigins() {
  const raw = [
    ...(process.env.CLIENT_ORIGINS ? process.env.CLIENT_ORIGINS.split(',') : []),
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  ];
  const configured = raw.map((s) => s.trim()).filter(Boolean);
  // Localhost origins are only meaningful during development. In production the
  // allow-list must come from CLIENT_ORIGINS alone.
  const base = process.env.NODE_ENV === 'production' ? [] : DEV_ORIGINS;
  return [...new Set([...base, ...configured])];
}

const ALLOWED_ORIGINS = readOrigins();

const CORS_METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
const CORS_HEADERS = ['Content-Type', 'Authorization', 'Accept'];

function originAllowed(origin) {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Wildcard entry allows any origin (useful for preview deploys).
  if (ALLOWED_ORIGINS.includes('*')) return true;
  return false;
}

// Socket.IO must share the exact same allow-list as the HTTP API, otherwise the
// WebSocket handshake is rejected in production while REST calls succeed.
initRealtime(httpServer, {
  corsOptions: {
    origin: (origin, callback) => callback(null, originAllowed(origin)),
    methods: CORS_METHODS,
    allowedHeaders: CORS_HEADERS,
  },
});

app.set('io', () => getIo());

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => {
    if (originAllowed(origin)) return cb(null, true);
    cb(Object.assign(new Error('Not allowed by CORS'), { statusCode: 403 }));
  },
  methods: CORS_METHODS,
  allowedHeaders: CORS_HEADERS,
}));
app.use(express.json({ limit: '1mb' }));

// ── Health
// Both public health endpoints report database readiness without authentication.
const startedAt = Date.now();

app.get('/health', async (_, res) => {
  try {
    const dbStatus = await checkConnection();
    res.json({ status: 'ok', uptime: Math.floor((Date.now() - startedAt) / 1000), db: dbStatus });
  } catch {
    res.status(503).json({ status: 'error', db: { connected: false } });
  }
});

app.get('/api/health', async (_, res) => {
  const indexPath = path.join(ASSETS_DIR, 'policy-index.json');
  try {
    const dbStatus = await checkConnection();
    res.json({ 
      status: 'ok', 
      index: fs.existsSync(indexPath) ? 'loaded' : 'missing', 
      rag: ragStatus(),
      db: dbStatus 
    });
  } catch (err) {
    res.status(503).json({ 
      status: 'error', 
      index: fs.existsSync(indexPath) ? 'loaded' : 'missing', 
      rag: ragStatus(),
      db: { connected: false }
    });
  }
});

// ── RAG policy search (requires ANTHROPIC_API_KEY + VOYAGE_API_KEY on server)
app.post('/api/policy-search', async (req, res) => {
  try {
    const { question } = req.body || {};
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing "question" in request body.' });
    }
    const result = await answerQuestion(question);
    if (result?.error) {
      // Missing AI keys or a missing index is a configuration gap, not a crash:
      // the rest of the platform stays up and keeps serving.
      return res.status(503).json(result);
    }
    res.json(result);
  } catch (e) {
    console.error('/api/policy-search error:', e.message);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── Serve PDFs with path traversal protection
app.get('/api/policies/:folder/:filename', (req, res) => {
  const folder = path.basename(req.params.folder);
  const filename = path.basename(req.params.filename);
  const filePath = path.join(POLICIES_DIR, folder, filename);

  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(POLICIES_DIR))) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'Policy not found' });
  }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  fs.createReadStream(resolved).pipe(res);
});

// ── API Routes
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/sos', sosRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/assistance', assistanceRoutes);
app.use('/api/appeals', appealsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/audit-logs', auditRoutes);

// ── Global error handler.
// Without this Express returns its default HTML page (with a stack trace in
// development) and CORS rejections surface as 500 instead of 403.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.statusCode || err.status || 500;
  const message = status >= 500 ? 'Internal server error.' : err.message;
  if (status >= 500) console.error('Unhandled request error:', err);
  res.status(status).json({ error: message });
});

// ── Start
(async () => {
  if (!process.env.VOYAGE_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    console.warn('\n⚠  Set VOYAGE_API_KEY and ANTHROPIC_API_KEY env vars for AI features.\n');
  }
  try {
    init({ apiKey: process.env.ANTHROPIC_API_KEY });
    console.log('Policy index initialized.');
  } catch (e) {
    console.warn('Index init warning:', e.message);
  }
  try {
    await seedInitialAdmin();
  } catch (e) {
    console.warn('Seed admin warning:', e.message);
  }

  // Test database connection
  try {
    await checkConnection();
    console.log(`${isPostgres() ? 'PostgreSQL' : 'SQLite'} database connection verified.`);
  } catch (e) {
    console.error('Database connection failed:', e.message);
    process.exit(1);
  }

  // In production something else may already own the port (e.g. a second
  // replica behind a load balancer). Exiting 0 there causes a crash loop, so
  // the self-check is limited to local development.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const probe = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (probe.ok) {
        console.log(`Port ${PORT} already serving — server is running (health OK).`);
        process.exit(0);
      }
    } catch {
      // not running yet — proceed to listen
    }
  }

  httpServer.listen(PORT, () => console.log(`UniSafe server (${isPostgres() ? 'PostgreSQL' : 'SQLite'} + RAG + PDF + Socket.IO) listening on :${PORT}`));
})();

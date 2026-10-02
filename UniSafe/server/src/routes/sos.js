import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as sosModel from '../models/sos.js';
import * as auditModel from '../models/audit.js';
import { emitSosUpdate } from '../realtime.js';

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid resource identifier.' });
  next();
});

const sosCreateSchema = z.object({
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_text: z.string().max(512).optional(),
});

const sosUpdateSchema = z.object({
  status: z.enum(['Active', 'Acknowledged', 'Responding', 'Resolved', 'Cancelled']),
  note: z.string().optional(),
});

const querySchema = z.object({
  status: z.enum(['Active', 'Acknowledged', 'Responding', 'Resolved', 'Cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

async function auditLog(req, action, resourceType, resourceId, oldValues, newValues, success = true, errorMessage) {
  try {
    (await auditModel.createAuditLog({
      user_id: req.user?.userId || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      old_values: oldValues,
      new_values: newValues,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
      success,
      error_message: errorMessage,
    }));
  } catch (e) {
    console.error('Audit log error:', e.message);
  }
}

// GET /api/sos - List SOS events
router.get('/', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
    }

    const sosEvents = (await sosModel.listSosEvents(parseResult.data));
    res.json(sosEvents);
  } catch (err) {
    console.error('GET /sos error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/sos/active-count - Get count of active SOS events
router.get('/active-count', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const count = (await sosModel.getActiveSosCount());
    res.json({ count });
  } catch (err) {
    console.error('GET /sos/active-count error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/sos/:id - Get single SOS event
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const sos = (await sosModel.getSosEventById(req.params.id));
    if (!sos) {
      return res.status(404).json({ error: 'SOS event not found.' });
    }

    if (sos.reporter_id !== req.user.userId && !req.user.roles.some(role => ['ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'].includes(role))) {
      return res.status(403).json({ error: 'Not authorized to view this SOS.' });
    }
    const history = (await sosModel.getSosStatusHistory(req.params.id));
    res.json({ ...sos, history });
  } catch (err) {
    console.error('GET /sos/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/sos - Create new SOS event (from mobile app)
router.post('/', requireAuth, async (req, res) => {
  try {
    const parseResult = sosCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const sos = (await sosModel.createSosEvent({
      ...parseResult.data,
      reporter_id: req.user.userId,
    }));

    (await auditLog(req, 'CREATE', 'sos', sos.id, null, sos));
    emitSosUpdate(sos, 'created');
    res.status(201).json(sos);
  } catch (err) {
    console.error('POST /sos error:', err);
    (await auditLog(req, 'CREATE', 'sos', null, null, req.body, false, err.message));
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/sos/:id/status - Update SOS status
async function changeSosStatus(req, res) {
  try {
    const parseResult = sosUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await sosModel.getSosEventById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'SOS event not found.' });
    }

    const updated = (await sosModel.updateSosStatus(req.params.id, parseResult.data.status, req.user.userId, parseResult.data.note));
    (await auditLog(req, 'STATUS_CHANGE', 'sos', req.params.id, { status: existing.status }, { status: parseResult.data.status, note: parseResult.data.note }));
    emitSosUpdate(updated, 'status-changed');
    res.json(updated);
  } catch (err) {
    console.error('PATCH /sos/:id/status error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
}

router.patch('/:id/status', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), changeSosStatus);
router.post('/:id/respond', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), (req, res) => {
  req.body = { note: req.body?.note, status: 'Acknowledged' };
  return changeSosStatus(req, res);
});
router.post('/:id/close', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), (req, res) => {
  req.body = { note: req.body?.note, status: 'Resolved' };
  return changeSosStatus(req, res);
});

// GET /api/sos/:id/history - Get SOS status history
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const sos = (await sosModel.getSosEventById(req.params.id));
    if (!sos) {
      return res.status(404).json({ error: 'SOS event not found.' });
    }

    if (sos.reporter_id !== req.user.userId && !req.user.roles.some(role => ['ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'].includes(role))) {
      return res.status(403).json({ error: 'Not authorized to view this SOS.' });
    }
    const history = (await sosModel.getSosStatusHistory(req.params.id));
    res.json(history);
  } catch (err) {
    console.error('GET /sos/:id/history error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
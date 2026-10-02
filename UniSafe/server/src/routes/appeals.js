import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as appealsModel from '../models/appeals.js';
import { emitAppealUpdate } from '../realtime.js';
import * as auditModel from '../models/audit.js';
import { getIncidentById } from '../models/incidents.js';
import { canViewIncident } from '../auth/incident-access.js';

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid resource identifier.' });
  next();
});

const appealCreateSchema = z.object({
  related_incident_id: z.string().uuid().optional(),
  type: z.enum(['Incident Decision', 'Disciplinary Action', 'Access Decision', 'Other']).optional(),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
});

const appealUpdateSchema = z.object({
  status: z.enum(['Under Review', 'Additional Info Required', 'Approved', 'Rejected', 'Closed']),
  decision: z.string().optional(),
});

const querySchema = z.object({
  status: z.enum(['Submitted', 'Under Review', 'Additional Info Required', 'Approved', 'Rejected', 'Closed']).optional(),
  type: z.enum(['Incident Decision', 'Disciplinary Action', 'Access Decision', 'Other']).optional(),
  appellant_id: z.string().uuid().optional(),
  reviewer_id: z.string().uuid().optional(),
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

// GET /api/appeals - List appeals
router.get('/', requireAuth, async (req, res) => {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
    }

    const filters = parseResult.data;
    const userRoles = req.user.roles || [];

    // Apply role-based filtering
    if (!userRoles.includes('ADMIN') && !userRoles.includes('ICT_ADMIN')) {
      // Appellants only see their own
      filters.appellant_id = req.user.userId;
    }

    const appeals = (await appealsModel.listAppeals(filters));
    res.json(appeals);
  } catch (err) {
    console.error('GET /appeals error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/appeals/:id - Get single appeal
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const appeal = (await appealsModel.getAppealById(req.params.id));
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    // Check authorization
    const userRoles = req.user.roles || [];
    const canView = userRoles.includes('ADMIN') || 
                    userRoles.includes('ICT_ADMIN') ||
                    appeal.appellant_id === req.user.userId;

    if (!canView) {
      return res.status(403).json({ error: 'Not authorized to view this appeal.' });
    }

    const documents = (await appealsModel.getAppealDocuments(req.params.id));
    res.json({ ...appeal, documents });
  } catch (err) {
    console.error('GET /appeals/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/appeals - Create new appeal
router.post('/', requireAuth, async (req, res) => {
  try {
    const parseResult = appealCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    if (parseResult.data.related_incident_id) {
      const incident = await getIncidentById(parseResult.data.related_incident_id);
      if (!incident || !canViewIncident(req.user, incident)) {
        return res.status(403).json({ error: 'Not authorized to reference this incident.' });
      }
    }
    const appeal = (await appealsModel.createAppeal({
      ...parseResult.data,
      appellant_id: req.user.userId,
    }));

    (await auditLog(req, 'CREATE', 'appeal', appeal.id, null, appeal));
    emitAppealUpdate(appeal, 'created');
    res.status(201).json(appeal);
  } catch (err) {
    console.error('POST /appeals error:', err);
    (await auditLog(req, 'CREATE', 'appeal', null, null, req.body, false, err.message));
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/appeals/:id/status - Update appeal status (admin only)
router.patch('/:id/status', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = appealUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await appealsModel.getAppealById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    const updated = (await appealsModel.updateAppealStatus(req.params.id, parseResult.data.status, req.user.userId, parseResult.data.decision));
    (await auditLog(req, 'STATUS_CHANGE', 'appeal', req.params.id, { status: existing.status }, { status: parseResult.data.status, decision: parseResult.data.decision }));
    emitAppealUpdate(updated, 'status-changed');
    res.json(updated);
  } catch (err) {
    console.error('PATCH /appeals/:id/status error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/appeals/:id/documents - Add document to appeal
router.post('/:id/documents', requireAuth, async (req, res) => {
  try {
    const docSchema = z.object({
      file_url: z.string().url(),
      mime_type: z.string(),
      file_size: z.number().int().positive(),
    });

    const parseResult = docSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const appeal = (await appealsModel.getAppealById(req.params.id));
    if (!appeal) {
      return res.status(404).json({ error: 'Appeal not found.' });
    }

    // Check authorization - only appellant or admin can add documents
    const userRoles = req.user.roles || [];
    const canAdd = userRoles.includes('ADMIN') || userRoles.includes('ICT_ADMIN') || appeal.appellant_id === req.user.userId;

    if (!canAdd) {
      return res.status(403).json({ error: 'Not authorized to add documents to this appeal.' });
    }

    const document = (await appealsModel.addAppealDocument(req.params.id, parseResult.data.file_url, parseResult.data.mime_type, parseResult.data.file_size, req.user.userId));
    res.status(201).json(document);
  } catch (err) {
    console.error('POST /appeals/:id/documents error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

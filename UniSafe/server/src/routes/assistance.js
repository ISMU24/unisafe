import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as assistanceModel from '../models/assistance.js';
import { emitAssistanceUpdate } from '../realtime.js';
import * as auditModel from '../models/audit.js';

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid resource identifier.' });
  next();
});

const assistanceCreateSchema = z.object({
  type: z.enum(['Security', 'Medical', 'Fire', 'General']).optional(),
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_text: z.string().max(512).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
});

const assistanceUpdateSchema = z.object({
  type: z.enum(['Security', 'Medical', 'Fire', 'General']).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_text: z.string().max(512).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled']).optional(),
  assignee_id: z.string().uuid().optional(),
});

const querySchema = z.object({
  status: z.enum(['Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled']).optional(),
  type: z.enum(['Security', 'Medical', 'Fire', 'General']).optional(),
  assignee_id: z.string().uuid().optional(),
  requester_id: z.string().uuid().optional(),
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

// GET /api/assistance - List assistance requests
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
      if (userRoles.includes('SECURITY') || userRoles.includes('MEDICAL')) {
        // Responders can see all assigned to them or pending
        // For now, show all - in production you'd filter by assignee_id
      } else {
        // Requesters only see their own
        filters.requester_id = req.user.userId;
      }
    }

    const requests = (await assistanceModel.listAssistanceRequests(filters));
    res.json(requests);
  } catch (err) {
    console.error('GET /assistance error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/assistance/:id - Get single assistance request
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const request = (await assistanceModel.getAssistanceRequestById(req.params.id));
    if (!request) {
      return res.status(404).json({ error: 'Assistance request not found.' });
    }

    // Check authorization
    const userRoles = req.user.roles || [];
    const canView = userRoles.includes('ADMIN') || 
                    userRoles.includes('ICT_ADMIN') ||
                    userRoles.includes('SECURITY') ||
                    userRoles.includes('MEDICAL') ||
                    request.requester_id === req.user.userId ||
                    request.assignee_id === req.user.userId;

    if (!canView) {
      return res.status(403).json({ error: 'Not authorized to view this request.' });
    }

    res.json(request);
  } catch (err) {
    console.error('GET /assistance/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/assistance - Create new assistance request
router.post('/', requireAuth, async (req, res) => {
  try {
    const parseResult = assistanceCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const request = (await assistanceModel.createAssistanceRequest({
      ...parseResult.data,
      requester_id: req.user.userId,
    }));

    (await auditLog(req, 'CREATE', 'assistance', request.id, null, request));
    emitAssistanceUpdate(request, 'created');
    res.status(201).json(request);
  } catch (err) {
    console.error('POST /assistance error:', err);
    (await auditLog(req, 'CREATE', 'assistance', null, null, req.body, false, err.message));
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/assistance/:id - Update assistance request
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const parseResult = assistanceUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await assistanceModel.getAssistanceRequestById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Assistance request not found.' });
    }

    // Check authorization
    const userRoles = req.user.roles || [];
    const canUpdate = userRoles.includes('ADMIN') || 
                      userRoles.includes('ICT_ADMIN') ||
                      userRoles.includes('SECURITY') ||
                      userRoles.includes('MEDICAL') ||
                      existing.requester_id === req.user.userId ||
                      existing.assignee_id === req.user.userId;

    if (!canUpdate) {
      return res.status(403).json({ error: 'Not authorized to update this request.' });
    }

    // Requesters can only update certain fields
    if (existing.requester_id === req.user.userId && !userRoles.some(r => ['ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'].includes(r))) {
      const allowedForRequester = ['title', 'description', 'location_text'];
      const requesterUpdates = Object.keys(parseResult.data).filter(k => !allowedForRequester.includes(k));
      if (requesterUpdates.length > 0) {
        return res.status(403).json({ error: 'Requesters can only update title, description, and location_text.' });
      }
    }

    const updated = (await assistanceModel.updateAssistanceRequest(req.params.id, parseResult.data, req.user.userId));
    (await auditLog(req, 'UPDATE', 'assistance', req.params.id, existing, updated));
    emitAssistanceUpdate(updated, 'updated');
    res.json(updated);
  } catch (err) {
    console.error('PATCH /assistance/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;;
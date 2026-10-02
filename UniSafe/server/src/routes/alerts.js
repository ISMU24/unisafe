import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as alertsModel from '../models/alerts.js';
import * as auditModel from '../models/audit.js';
import * as usersModel from '../models/users.js';
import { emitAlertUpdate, emitAlertToUsers } from '../realtime.js';

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid resource identifier.' });
  next();
});

const alertCreateSchema = z.object({
  title: z.string().min(1).max(255),
  message: z.string().min(1),
  severity: z.enum(['Info', 'Warning', 'Critical']).optional(),
  target_roles: z.array(z.string()).optional(),
  target_all: z.boolean().optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

const alertUpdateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  message: z.string().min(1).optional(),
  severity: z.enum(['Info', 'Warning', 'Critical']).optional(),
  target_roles: z.array(z.string()).optional(),
  target_all: z.boolean().optional(),
  is_active: z.boolean().optional(),
  expires_at: z.string().datetime().optional().nullable(),
});

const querySchema = z.object({
  is_active: z.coerce.boolean().optional(),
  severity: z.enum(['Info', 'Warning', 'Critical']).optional(),
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

// GET /api/alerts - List alerts (admin view)
router.get('/', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
    }

    const alerts = (await alertsModel.listAlerts(parseResult.data));
    res.json(alerts);
  } catch (err) {
    console.error('GET /alerts error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/alerts/my - Get alerts for current user
router.get('/my', requireAuth, async (req, res) => {
  try {
    const user = (await usersModel.getUserById(req.user.userId));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const alerts = (await alertsModel.getAlertsForUser(req.user.userId, user.roles || []));
    res.json(alerts);
  } catch (err) {
    console.error('GET /alerts/my error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/alerts/my/:id/read - Mark alert as read
router.post('/my/:id/read', requireAuth, async (req, res) => {
  try {
    const alert = await alertsModel.getAlertById(req.params.id);
    if (!alert || !alert.is_active || (alert.expires_at && new Date(alert.expires_at).getTime() <= Date.now())) {
      return res.status(404).json({ error: 'Alert not found.' });
    }
    if (!alert.target_all && !alert.target_roles?.some(role => req.user.roles.includes(role))) {
      return res.status(403).json({ error: 'Not authorized to read this alert.' });
    }
    (await alertsModel.markAlertAsRead(req.params.id, req.user.userId));
    res.json({ success: true });
  } catch (err) {
    console.error('POST /alerts/my/:id/read error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/alerts/:id - Get single alert
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const alert = (await alertsModel.getAlertById(req.params.id));
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    // Check if user can view this alert
    const user = (await usersModel.getUserById(req.user.userId));
    const userRoles = user?.roles || [];
    const canView = userRoles.includes('ADMIN') || userRoles.includes('ICT_ADMIN') ||
                    alert.target_all || 
                    (alert.target_roles && alert.target_roles.some(r => userRoles.includes(r)));

    if (!canView) {
      return res.status(403).json({ error: 'Not authorized to view this alert.' });
    }

    res.json(alert);
  } catch (err) {
    console.error('GET /alerts/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/alerts - Create new alert
router.post('/', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = alertCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const alert = (await alertsModel.createAlert({
      ...parseResult.data,
      sent_by: req.user.userId,
    }));

    // Deliver to target users. `target_roles` holds role *names* here; the model
    // stores the matching role ids in the SMALLINT[] column.
    let notifiedUserIds = [];
    if (alert.target_all) {
      const allUsers = (await usersModel.listUsers({ is_active: true, limit: 10000 }));
      notifiedUserIds = allUsers.map(u => u.id);
      (await alertsModel.deliverAlertToUsers(alert.id, notifiedUserIds));
    } else if (alert.target_roles && alert.target_roles.length > 0) {
      for (const roleName of alert.target_roles) {
        const roleUsers = (await usersModel.getUsersByRole(roleName));
        notifiedUserIds.push(...roleUsers.map(u => u.id));
      }
      notifiedUserIds = [...new Set(notifiedUserIds)];
      (await alertsModel.deliverAlertToUsers(alert.id, notifiedUserIds));
    }

    (await auditLog(req, 'CREATE', 'alert', alert.id, null, alert));
    emitAlertUpdate(alert, 'created');
    emitAlertToUsers(alert, notifiedUserIds, 'created');
    res.status(201).json(alert);
  } catch (err) {
    console.error('POST /alerts error:', err);
    (await auditLog(req, 'CREATE', 'alert', null, null, req.body, false, err.message));
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/alerts/:id - Update alert
router.patch('/:id', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = alertUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await alertsModel.getAlertById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    const updated = (await alertsModel.updateAlert(req.params.id, parseResult.data));
    (await auditLog(req, 'UPDATE', 'alert', req.params.id, existing, updated));
    emitAlertUpdate(updated, 'updated');
    res.json(updated);
  } catch (err) {
    console.error('PATCH /alerts/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/alerts/:id - Delete alert
router.delete('/:id', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const existing = (await alertsModel.getAlertById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    const deleted = (await alertsModel.deleteAlert(req.params.id));
    if (deleted) {
      (await auditLog(req, 'DELETE', 'alert', req.params.id, existing, null));
      emitAlertUpdate(existing, 'deleted');
      res.json({ deleted: true });
    } else {
      res.status(404).json({ error: 'Alert not found.' });
    }
  } catch (err) {
    console.error('DELETE /alerts/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

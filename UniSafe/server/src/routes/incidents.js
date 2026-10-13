import express from 'express';
import z from 'zod';
import Busboy from 'busboy';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as incidentsModel from '../models/incidents.js';
import * as auditModel from '../models/audit.js';
import { canManageIncident, canViewIncident, incidentFilters, presentIncident } from '../auth/incident-access.js';
import { emitIncidentUpdate } from '../realtime.js';
import db from '../config/db.js';

const router = express.Router();
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_REPORT_IMAGES = 3;

router.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid resource identifier.' });
  next();
});

const incidentCreateSchema = z.object({
  category: z.enum(['Security', 'Fire', 'Ambulance', 'Other']),
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_text: z.string().max(512).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  is_anonymous: z.boolean().optional(),
  is_sos: z.boolean().optional(),
});

const incidentUpdateSchema = z.object({
  category: z.enum(['Security', 'Fire', 'Ambulance', 'Other']).optional(),
  incident_type: z.string().trim().min(1).max(120).optional(),
  title: z.string().min(1).max(255).optional(),
  description: z.string().min(1).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_text: z.string().max(512).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  status: z.enum(['Submitted', 'Received', 'Under Review', 'Assigned', 'Responding', 'Resolved', 'Closed', 'Cancelled']).optional(),
  assignee_id: z.string().uuid().optional(),
  is_anonymous: z.boolean().optional(),
});

const reportSchema = z.object({
  category: z.enum(['Security', 'Fire', 'Ambulance', 'Other']),
  incident_type: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().min(1).max(2000),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  location_text: z.string().trim().min(1).max(512),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  is_anonymous: z.boolean(),
}).refine(
  data => (data.latitude === undefined) === (data.longitude === undefined),
  { message: 'Latitude and longitude must be provided together.', path: ['latitude'] },
);

const querySchema = z.object({
  category: z.enum(['Security', 'Fire', 'Ambulance', 'Other']).optional(),
  status: z.enum(['Submitted', 'Received', 'Under Review', 'Assigned', 'Responding', 'Resolved', 'Closed', 'Cancelled']).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']).optional(),
  assignee_id: z.string().uuid().optional(),
  reporter_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  orderBy: z.enum(['created_at', 'updated_at', 'priority', 'status', 'category']).optional(),
  orderDir: z.enum(['ASC', 'DESC']).optional(),
});

function parseImageMultipart(req) {
  return new Promise((resolve, reject) => {
    let parser;
    try {
      parser = Busboy({
        headers: req.headers,
        limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_REPORT_IMAGES, fields: 1, parts: MAX_REPORT_IMAGES + 1, fieldSize: 32 * 1024 },
      });
    } catch {
      reject(Object.assign(new Error('Expected a multipart incident report.'), { statusCode: 400 }));
      return;
    }

    const fields = {};
    const files = [];
    let failure = null;
    const fail = (message, statusCode = 400) => { failure ||= Object.assign(new Error(message), { statusCode }); };

    parser.on('field', (name, value, info) => {
      if (name !== 'report' || fields.report !== undefined) {
        fail('Only one report field is accepted.');
        return;
      }
      if (info.valueTruncated) {
        fail('The report details are too large.', 413);
        return;
      }
      fields.report = value;
    });
    parser.on('file', (name, stream, info) => {
      const chunks = [];
      let size = 0;
      if (name !== 'photos') fail('Unexpected file field.');
      stream.on('data', chunk => {
        size += chunk.length;
        if (size <= MAX_IMAGE_BYTES) chunks.push(chunk);
      });
      stream.on('limit', () => fail('Each image must be 2 MB or smaller.', 413));
      stream.on('end', () => {
        if (name === 'photos' && !stream.truncated && !failure) {
          files.push({ mimeType: info.mimeType, buffer: Buffer.concat(chunks), size });
        }
      });
    });
    parser.on('filesLimit', () => fail('A report can include at most 3 images.'));
    parser.on('fieldsLimit', () => fail('The report contains too many fields.'));
    parser.on('partsLimit', () => fail('The report contains too many parts.'));
    parser.on('error', () => fail('The uploaded report could not be read.'));
    parser.on('close', () => {
      if (failure) return reject(failure);
      if (typeof fields.report !== 'string') return reject(Object.assign(new Error('The report details are missing.'), { statusCode: 400 }));
      let report;
      try { report = JSON.parse(fields.report); }
      catch { return reject(Object.assign(new Error('The report details are invalid.'), { statusCode: 400 })); }

      for (const file of files) {
        const jpeg = file.mimeType === 'image/jpeg' && file.buffer.length >= 3 &&
          file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff;
        const png = file.mimeType === 'image/png' && file.buffer.length >= 8 &&
          file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        if (!jpeg && !png) return reject(Object.assign(new Error('Only valid JPEG and PNG images are accepted.'), { statusCode: 415 }));
      }
      resolve({ report, files });
    });

    req.pipe(parser);
  });
}

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

// GET /api/incidents - List incidents with filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
    }

    const filters = incidentFilters(req.user, parseResult.data);
    const incidents = (await incidentsModel.listIncidents(filters)).map(incident => presentIncident(incident, req.user));
    const total = await incidentsModel.countIncidents(filters);

    res.json({ incidents, total, limit: filters.limit || 50, offset: filters.offset || 0 });
  } catch (err) {
    console.error('GET /incidents error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// GET /api/incidents/stats - Get incident statistics
router.get('/stats', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const stats = (await incidentsModel.getIncidentStats(incidentFilters(req.user)));
    res.json(stats);
  } catch (err) {
    console.error('GET /incidents/stats error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// GET /api/incidents/:id - Get single incident
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const incident = (await incidentsModel.getIncidentById(req.params.id));
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const canView = canViewIncident(req.user, incident);

    if (!canView) {
      return res.status(403).json({ error: 'Not authorized to view this incident.' });
    }

    const history = (await incidentsModel.getIncidentStatusHistory(req.params.id));
    const media = (await incidentsModel.getIncidentMedia(req.params.id));

    res.json(presentIncident({ ...incident, history, media }, req.user));
  } catch (err) {
    console.error('GET /incidents/:id error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// POST /api/incidents - Create new incident
router.post('/', requireAuth, async (req, res) => {
  try {
    const parseResult = incidentCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const data = parseResult.data;
    const incident = (await incidentsModel.createIncident({
      ...data,
      reporter_id: req.user.userId,
      is_anonymous: data.is_anonymous ?? false,
      is_sos: data.is_sos ?? false,
    }));

    const presented = presentIncident(incident, req.user);
    (await auditLog(req, 'CREATE', 'incident', incident.id, null, incident));
    emitIncidentUpdate(incident, 'created');
    res.status(201).json(presented);
  } catch (err) {
    console.error('POST /incidents error:', err);
    (await auditLog(req, 'CREATE', 'incident', null, null, req.body, false, err.message));
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// POST /api/incidents/report - atomically save report details and evidence.
router.post('/report', requireAuth, async (req, res) => {
  let incident;
  try {
    const { report: submittedReport, files } = await parseImageMultipart(req);
    const parseResult = reportSchema.safeParse(submittedReport);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }
    const report = parseResult.data;

    incident = await db.transaction(async () => {
      const created = await incidentsModel.createIncident({
        ...report,
        reporter_id: req.user.userId,
        is_sos: false,
      });
      for (const file of files) {
        await incidentsModel.addIncidentMedia(
          created.id,
          file.mimeType,
          file.size,
          file.buffer,
          req.user.userId,
        );
      }
      return created;
    });

    const media = await incidentsModel.getIncidentMedia(incident.id);
    incident = { ...incident, media };
    (await auditLog(req, 'CREATE', 'incident', incident.id, null, incident));
    emitIncidentUpdate(incident, 'created');
    res.status(201).json(presentIncident(incident, req.user));
  } catch (err) {
    console.error('POST /incidents/report error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// GET /api/incidents/:id/media/:mediaId - authorization follows incident visibility.
router.get('/:id/media/:mediaId', requireAuth, async (req, res) => {
  if (!z.string().uuid().safeParse(req.params.mediaId).success) {
    return res.status(400).json({ error: 'Invalid resource identifier.' });
  }
  try {
    const incident = await incidentsModel.getIncidentById(req.params.id);
    if (!incident) return res.status(404).json({ error: 'Incident not found.' });
    if (!canViewIncident(req.user, incident)) {
      return res.status(403).json({ error: 'Not authorized to view this incident.' });
    }
    const media = await incidentsModel.getIncidentMediaById(req.params.id, req.params.mediaId);
    if (!media?.file_data) return res.status(404).json({ error: 'Incident image not found.' });

    res.set({
      'Content-Type': media.mime_type,
      'Content-Length': media.file_size,
      'Content-Disposition': `inline; filename="incident-evidence.${media.mime_type === 'image/png' ? 'png' : 'jpg'}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.status(200).send(media.file_data);
  } catch (err) {
    console.error('GET /incidents/:id/media/:mediaId error:', err.message);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// PATCH /api/incidents/:id - Update incident
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const parseResult = incidentUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await incidentsModel.getIncidentById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const userRoles = req.user.roles;
    const canUpdate = canViewIncident(req.user, existing);

    if (!canUpdate) {
      return res.status(403).json({ error: 'Not authorized to update this incident.' });
    }

    // Reporters can only update their own incidents and only certain fields
    if (!canManageIncident(req.user, existing)) {
      const allowedForReporter = ['title', 'description', 'location_text'];
      const reporterUpdates = Object.keys(parseResult.data).filter(k => !allowedForReporter.includes(k));
      if (reporterUpdates.length > 0) {
        return res.status(403).json({ error: 'Reporters can only update title, description, and location_text.' });
      }
    }

    if (parseResult.data.category && !canManageIncident(req.user, { category: parseResult.data.category })) {
      return res.status(403).json({ error: 'Not authorized for the destination category.' });
    }
    const updated = (await incidentsModel.updateIncident(req.params.id, parseResult.data, req.user.userId));
    (await auditLog(req, 'UPDATE', 'incident', req.params.id, existing, updated));
    const presented = presentIncident(updated, req.user);
    emitIncidentUpdate(updated, 'updated');
    res.json(presented);
  } catch (err) {
    console.error('PATCH /incidents/:id error:', err);
    (await auditLog(req, 'UPDATE', 'incident', req.params.id, null, req.body, false, err.message));
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// PATCH /api/incidents/:id/status - Update incident status (specialized endpoint)
router.patch('/:id/status', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const statusSchema = z.object({
      status: z.enum(['Submitted', 'Received', 'Under Review', 'Assigned', 'Responding', 'Resolved', 'Closed', 'Cancelled']),
      note: z.string().optional(),
    });

    const parseResult = statusSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await incidentsModel.getIncidentById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const canUpdate = canManageIncident(req.user, existing);

    if (!canUpdate) {
      return res.status(403).json({ error: 'Not authorized to update status for this incident category.' });
    }

    const updated = (await incidentsModel.updateIncidentStatus(req.params.id, parseResult.data.status, req.user.userId, parseResult.data.note));
    (await auditLog(req, 'STATUS_CHANGE', 'incident', req.params.id, { status: existing.status }, { status: parseResult.data.status, note: parseResult.data.note }));
    emitIncidentUpdate(updated, 'status-changed');
    res.json(presentIncident(updated, req.user));
  } catch (err) {
    console.error('PATCH /incidents/:id/status error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// POST /api/incidents/:id/assign - Assign incident to responder
router.post('/:id/assign', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const assignSchema = z.object({
      assignee_id: z.string().uuid(),
      note: z.string().optional(),
    });

    const parseResult = assignSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await incidentsModel.getIncidentById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    if (!canManageIncident(req.user, existing)) {
      return res.status(403).json({ error: 'Not authorized to assign this incident.' });
    }

    const updated = (await incidentsModel.assignIncident(req.params.id, parseResult.data.assignee_id, req.user.userId, parseResult.data.note));
    (await auditLog(req, 'ASSIGN', 'incident', req.params.id, { assignee_id: existing.assignee_id }, { assignee_id: parseResult.data.assignee_id }));
    emitIncidentUpdate(updated, 'assigned');
    res.json(presentIncident(updated, req.user));
  } catch (err) {
    console.error('POST /incidents/:id/assign error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// GET /api/incidents/:id/history - Get incident status history
router.get('/:id/history', requireAuth, async (req, res) => {
  try {
    const incident = (await incidentsModel.getIncidentById(req.params.id));
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    if (!canViewIncident(req.user, incident)) {
      return res.status(403).json({ error: 'Not authorized to view this incident.' });
    }
    const history = (await incidentsModel.getIncidentStatusHistory(req.params.id));
    res.json(presentIncident({ ...incident, history }, req.user).history);
  } catch (err) {
    console.error('GET /incidents/:id/history error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

// DELETE /api/incidents/:id - Soft delete incident
router.delete('/:id', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const existing = (await incidentsModel.getIncidentById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const deleted = (await incidentsModel.deleteIncident(req.params.id));
    if (deleted) {
      (await auditLog(req, 'DELETE', 'incident', req.params.id, existing, null));
      emitIncidentUpdate({ ...existing, deleted_at: new Date().toISOString() }, 'deleted');
      res.json({ deleted: true });
    } else {
      res.status(404).json({ error: 'Incident not found.' });
    }
  } catch (err) {
    console.error('DELETE /incidents/:id error:', err);
    res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Internal server error.' });
  }
});

export default router;

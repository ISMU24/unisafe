import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as auditModel from '../models/audit.js';

const router = express.Router();

const querySchema = z.object({
  user_id: z.string().uuid().optional(),
  action: z.string().optional(),
  resource_type: z.string().optional(),
  resource_id: z.string().uuid().optional(),
  success: z.enum(['true', 'false']).transform(value => value === 'true').optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

// GET /api/audit-logs - List audit logs (admin only)
router.get('/', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
    }

    const logs = (await auditModel.listAuditLogs(parseResult.data));
    res.json(logs);
  } catch (err) {
    console.error('GET /audit-logs error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

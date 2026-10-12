import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as recycleBin from '../models/recycle-bin.js';
import { createAuditLog } from '../models/audit.js';
import {
  emitIncidentUpdate,
  emitSosUpdate,
  emitAlertUpdate,
  emitAssistanceUpdate,
  emitAppealUpdate,
} from '../realtime.js';

const router = express.Router();
const recordTypeSchema = z.enum(['incident', 'sos', 'alert', 'assistance', 'appeal', 'user']);
const idSchema = z.string().uuid();
const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const adminOnly = [requireAuth, requireRole('ADMIN', 'ICT_ADMIN')];

router.get('/', ...adminOnly, asyncHandler(async (_req, res) => {
  res.json({ items: await recycleBin.listRecycleBin() });
}));

router.get('/records', ...adminOnly, asyncHandler(async (req, res) => {
  res.json({ records: await recycleBin.listActiveRecords(req.user.userId) });
}));

router.delete('/:type/:id', ...adminOnly, asyncHandler(async (req, res) => {
  const type = recordTypeSchema.safeParse(req.params.type);
  const id = idSchema.safeParse(req.params.id);
  if (!type.success || !id.success) return res.status(400).json({ error: 'Invalid recycle-bin record.' });

  const record = await recycleBin.moveToRecycleBin(type.data, id.data, req.user.userId);
  if (!record) return res.status(404).json({ error: 'Record not found or already in the Recycle Bin.' });

  await createAuditLog({
    user_id: req.user.userId,
    action: 'RECYCLE',
    resource_type: type.data,
    resource_id: id.data,
    old_values: { deleted_at: null },
    new_values: { deleted_at: record.deleted_at },
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });

  emitRecordUpdate(type.data, record, 'deleted');
  res.json({ recycled: true });
}));

router.post('/:type/:id/restore', ...adminOnly, asyncHandler(async (req, res) => {
  const type = recordTypeSchema.safeParse(req.params.type);
  const id = idSchema.safeParse(req.params.id);
  if (!type.success || !id.success) return res.status(400).json({ error: 'Invalid recycle-bin record.' });

  const restored = await recycleBin.restoreFromRecycleBin(type.data, id.data);
  if (!restored) return res.status(404).json({ error: 'Record not found in the Recycle Bin.' });

  await createAuditLog({
    user_id: req.user.userId,
    action: 'RESTORE',
    resource_type: type.data,
    resource_id: id.data,
    old_values: { deleted_at: 'set' },
    new_values: { deleted_at: null },
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });

  emitRecordUpdate(type.data, { id: id.data }, 'restored');
  res.json({ restored: true });
}));

router.delete('/:type/:id/permanent', ...adminOnly, asyncHandler(async (req, res) => {
  const type = recordTypeSchema.safeParse(req.params.type);
  const id = idSchema.safeParse(req.params.id);
  if (!type.success || !id.success) return res.status(400).json({ error: 'Invalid recycle-bin record.' });
  if (type.data === 'user' && id.data === req.user.userId) {
    return res.status(400).json({ error: 'You cannot permanently delete your own account.' });
  }

  const items = await recycleBin.listRecycleBin();
  const item = items.find(entry => entry.type === type.data && entry.id === id.data);
  if (!item) return res.status(404).json({ error: 'Record not found in the Recycle Bin.' });

  const deleted = await recycleBin.permanentlyDelete(type.data, id.data);
  if (!deleted) return res.status(404).json({ error: 'Record not found in the Recycle Bin.' });

  await createAuditLog({
    user_id: req.user.userId,
    action: 'PERMANENT_DELETE',
    resource_type: type.data,
    resource_id: id.data,
    old_values: type.data === 'user' ? null : { label: item.label },
    new_values: null,
    ip_address: req.ip,
    user_agent: req.get('user-agent'),
  });

  emitRecordUpdate(type.data, { id: id.data }, 'deleted');
  res.json({ permanentlyDeleted: true });
}));

function emitRecordUpdate(type, record, action) {
  if (type === 'incident') emitIncidentUpdate(record, action);
  else if (type === 'sos') emitSosUpdate(record, action);
  else if (type === 'alert') emitAlertUpdate(record, action);
  else if (type === 'assistance') emitAssistanceUpdate(record, action);
  else if (type === 'appeal') emitAppealUpdate(record, action);
}

export default router;

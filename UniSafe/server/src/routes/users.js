import express from 'express';
import z from 'zod';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as usersModel from '../models/users.js';
import * as auditModel from '../models/audit.js';
import { hashPassword } from '../auth/passwords.js';
import { revokeAllUserRefreshTokens } from '../auth/database.js';

const router = express.Router();
router.param('id', (req, res, next, id) => {
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ error: 'Invalid resource identifier.' });
  next();
});

const userUpdateSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  student_or_staff_id: z.string().max(64).optional(),
  phone: z.string().max(32).optional(),
  avatar_url: z.string().url().optional(),
  is_active: z.boolean().optional(),
});

const userRoleSchema = z.object({
  role: z.enum(['STUDENT', 'STAFF', 'SECURITY', 'MEDICAL', 'ADMIN', 'ICT_ADMIN']),
});

const querySchema = z.object({
  role: z.enum(['STUDENT', 'STAFF', 'SECURITY', 'MEDICAL', 'ADMIN', 'ICT_ADMIN']).optional(),
  is_active: z.coerce.boolean().optional(),
  search: z.string().optional(),
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

// GET /api/users - List users (admin only)
router.get('/', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = querySchema.safeParse(req.query);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid query parameters', details: parseResult.error.flatten() });
    }

    const [users, total] = [
      (await usersModel.listUsers(parseResult.data)),
      (await usersModel.countUsers(parseResult.data)),
    ];

    res.json({ users, total, limit: parseResult.data.limit || 50, offset: parseResult.data.offset || 0 });
  } catch (err) {
    console.error('GET /users error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/users/roles - Get all roles
router.get('/roles', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const roles = (await usersModel.getAllRoles());
    res.json(roles);
  } catch (err) {
    console.error('GET /users/roles error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/users/by-role/:roleName - Get users by role
router.get('/by-role/:roleName', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const users = (await usersModel.getUsersByRole(req.params.roleName));
    res.json(users);
  } catch (err) {
    console.error('GET /users/by-role/:roleName error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/users/:id - Get single user
router.get('/responders', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const roles = req.user.roles;
    const directoryRoles = roles.includes('ADMIN') || roles.includes('ICT_ADMIN')
      ? ['SECURITY', 'MEDICAL'] : ['SECURITY', 'MEDICAL'].filter(role => roles.includes(role));
    const users = (await Promise.all(directoryRoles.map(role => usersModel.getUsersByRole(role)))).flat();
    const unique = new Map(users.filter(user => user.is_active).map(user => [user.id, {
      id: user.id, full_name: user.full_name, roles: user.roles,
    }]));
    res.json([...unique.values()]);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

router.get('/:id', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const user = (await usersModel.getUserById(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(user);
  } catch (err) {
    console.error('GET /users/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// PATCH /api/users/:id - Update user (admin only)
router.patch('/:id', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = userUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const existing = (await usersModel.getUserById(req.params.id));
    if (!existing) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Prevent self-deactivation
    if (req.params.id === req.user.userId && parseResult.data.is_active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account.' });
    }

    // If email is being changed, check for uniqueness
    if (parseResult.data.email && parseResult.data.email !== existing.email) {
      const emailExists = (await usersModel.getUserByEmail(parseResult.data.email));
      if (emailExists) {
        return res.status(409).json({ error: 'Email already in use.' });
      }
    }

    const updated = (await usersModel.updateUser(req.params.id, parseResult.data, req.user.userId));
    (await auditLog(req, 'UPDATE', 'user', req.params.id, existing, updated));
    res.json(updated);
  } catch (err) {
    console.error('PATCH /users/:id error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/users/:id/roles - Assign role to user
router.post('/:id/roles', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const parseResult = userRoleSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const user = (await usersModel.getUserById(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const updated = (await usersModel.assignUserRole(req.params.id, parseResult.data.role, req.user.userId));
    (await auditLog(req, 'ASSIGN_ROLE', 'user', req.params.id, { roles: user.roles }, { roles: updated.roles }));
    res.json(updated);
  } catch (err) {
    console.error('POST /users/:id/roles error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// DELETE /api/users/:id/roles/:roleName - Remove role from user
router.delete('/:id/roles/:roleName', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const user = (await usersModel.getUserById(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Prevent removing last admin
    if (req.params.roleName === 'ADMIN') {
      const admins = (await usersModel.getUsersByRole('ADMIN'));
      if (admins.length <= 1 && admins[0].id === req.params.id) {
        return res.status(400).json({ error: 'Cannot remove the last admin.' });
      }
    }

    // Prevent self-role removal for admin
    if (req.params.id === req.user.userId && req.params.roleName === 'ADMIN') {
      return res.status(400).json({ error: 'Cannot remove your own admin role.' });
    }

    const updated = (await usersModel.removeUserRole(req.params.id, req.params.roleName));
    (await auditLog(req, 'REMOVE_ROLE', 'user', req.params.id, { roles: user.roles }, { roles: updated.roles }));
    res.json(updated);
  } catch (err) {
    console.error('DELETE /users/:id/roles/:roleName error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// POST /api/users/:id/reset-password - Reset user password (admin only)
router.post('/:id/reset-password', requireAuth, requireRole('ADMIN', 'ICT_ADMIN'), async (req, res) => {
  try {
    const schema = z.object({
      new_password: z.string().min(8).regex(/\d/),
    });

    const parseResult = schema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid input', details: parseResult.error.flatten() });
    }

    const user = (await usersModel.getUserById(req.params.id));
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const password_hash = await hashPassword(parseResult.data.new_password);
    (await usersModel.updateUser(req.params.id, { password_hash }, req.user.userId));
    
    // Revoke all refresh tokens to force re-login
    await revokeAllUserRefreshTokens(req.params.id);

    (await auditLog(req, 'RESET_PASSWORD', 'user', req.params.id, null, { reset_by: req.user.userId }));
    res.json({ message: 'Password reset successfully. User must log in again.' });
  } catch (err) {
    console.error('POST /users/:id/reset-password error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;

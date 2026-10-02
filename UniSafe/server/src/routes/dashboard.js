import express from 'express';
import { requireAuth, requireRole } from '../auth/middleware.js';
import * as incidentsModel from '../models/incidents.js';
import * as sosModel from '../models/sos.js';
import * as alertsModel from '../models/alerts.js';
import * as assistanceModel from '../models/assistance.js';
import * as appealsModel from '../models/appeals.js';
import * as usersModel from '../models/users.js';
import * as auditModel from '../models/audit.js';
import { incidentFilters } from '../auth/incident-access.js';

const router = express.Router();

// GET /api/dashboard/stats - Get dashboard statistics
router.get('/stats', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    const userRoles = req.user.roles || [];
    
    // Counts follow the same category scoping as the incident list, so a
    // SECURITY officer's totals never reveal Ambulance figures they cannot list.
    const incidentStats = (await incidentsModel.getIncidentStats(incidentFilters(req.user)));
    const activeSosCount = (await sosModel.getActiveSosCount());
    const pendingAssistance = (await assistanceModel.listAssistanceRequests({ status: 'Pending', limit: 1 })).length;
    const pendingAppeals = (await appealsModel.listAppeals({ status: 'Submitted', limit: 1 })).length;
    const activeAlerts = (await alertsModel.listAlerts({ is_active: true, limit: 1 })).length;

    res.json({
      incidents: incidentStats,
      active_sos: activeSosCount,
      pending_assistance: pendingAssistance,
      pending_appeals: pendingAppeals,
      active_alerts: activeAlerts,
    });
  } catch (err) {
    console.error('GET /dashboard/stats error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// GET /api/dashboard/recent - Get recent activity for dashboard
router.get('/recent', requireAuth, requireRole('ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'), async (req, res) => {
  try {
    // Shared helper, so recent activity honours exactly the same category
    // scoping as the incident list and the statistics above.
    const recentIncidents = (await incidentsModel.listIncidents(incidentFilters(req.user, { limit: 10 })));
    const recentSos = (await sosModel.listSosEvents({ limit: 5 }));
    const recentAssistance = (await assistanceModel.listAssistanceRequests({ limit: 5 }));
    const recentAppeals = (await appealsModel.listAppeals({ limit: 5 }));

    res.json({
      incidents: recentIncidents,
      sos: recentSos,
      assistance: recentAssistance,
      appeals: recentAppeals,
    });
  } catch (err) {
    console.error('GET /dashboard/recent error:', err);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;
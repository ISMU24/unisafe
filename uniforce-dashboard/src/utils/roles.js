// Role helpers shared by the pages, routes and sidebar.
//
// Role names come from the server (`roles` table / JWT claim) and are always
// UPPERCASE: ADMIN, ICT_ADMIN, SECURITY, MEDICAL, STAFF, STUDENT.

export const RESPONDER_ROLES = ['ADMIN', 'ICT_ADMIN', 'SECURITY', 'MEDICAL'];
export const ADMIN_ROLES = ['ADMIN', 'ICT_ADMIN'];

function normalizeRole(role) {
  return String(role || '').trim().toUpperCase();
}

/** True when the signed-in account holds at least one of `allowed` roles. */
export function hasAnyRole(roles, allowed) {
  if (!Array.isArray(roles)) return false;
  return roles.some((role) => allowed.includes(normalizeRole(role)));
}

export function isResponder(roles) {
  return hasAnyRole(roles, RESPONDER_ROLES);
}

export function isAdmin(roles) {
  return hasAnyRole(roles, ADMIN_ROLES);
}

const ROLE_LABELS = {
  ADMIN: 'Administrator',
  ICT_ADMIN: 'ICT Administrator',
  SECURITY: 'Security Officer',
  MEDICAL: 'Medical Responder',
  STAFF: 'Staff',
  STUDENT: 'Student',
};

/** Human-readable label for the account's primary role. */
export function roleLabel(roles, fallbackRole) {
  const primary = normalizeRole((roles && roles[0]) || fallbackRole);
  return ROLE_LABELS[primary] || fallbackRole || 'Signed in';
}

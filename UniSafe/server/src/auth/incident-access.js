export function isAdministrator(user) {
  return user.roles.some(role => ['ADMIN', 'ICT_ADMIN'].includes(role));
}

export function canManageIncident(user, incident) {
  return isAdministrator(user) ||
    (user.roles.includes('SECURITY') && ['Security', 'Fire', 'Other'].includes(incident.category)) ||
    (user.roles.includes('MEDICAL') && incident.category === 'Ambulance');
}

export function canViewIncident(user, incident) {
  return canManageIncident(user, incident) || incident.reporter_id === user.userId;
}

export function incidentFilters(user, filters = {}) {
  if (isAdministrator(user) || (user.roles.includes('SECURITY') && user.roles.includes('MEDICAL'))) return { ...filters };
  if (user.roles.includes('SECURITY')) return { ...filters, categories: ['Security', 'Fire', 'Other'] };
  if (user.roles.includes('MEDICAL')) return { ...filters, categories: ['Ambulance'] };
  return { ...filters, reporter_id: user.userId };
}

export function presentIncident(incident, user) {
  if (!incident.is_anonymous || incident.reporter_id === user.userId) return incident;
  const output = { ...incident, reporter_id: null, reporter_name: null, reporter_id_str: null };
  if (output.history) output.history = output.history.map(entry => entry.changed_by === incident.reporter_id
    ? { ...entry, changed_by: null, changed_by_name: null } : entry);
  if (output.media) output.media = output.media.map(item => item.uploaded_by === incident.reporter_id
    ? { ...item, uploaded_by: null } : item);
  return output;
}

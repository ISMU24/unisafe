export function normalizeIncident(incident) {
  return {
    ...incident,
    submittedAt: incident.created_at,
    anonymous: Boolean(incident.is_anonymous),
    location: incident.location_text || (
      incident.latitude != null && incident.longitude != null
        ? { lat: Number(incident.latitude), lng: Number(incident.longitude) }
        : null
    ),
    timeline: (incident.history || []).map(event => ({
      status: event.new_status,
      note: event.note,
      time: event.created_at,
    })),
  };
}

export function normalizeAppeal(appeal) {
  return { ...appeal, category: appeal.type, submittedAt: appeal.created_at };
}

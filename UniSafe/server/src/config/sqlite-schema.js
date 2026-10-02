import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';


export default function openSqlite(filename) {
if (filename !== ':memory:') fs.mkdirSync(path.dirname(filename), { recursive: true });
const db = new Database(filename);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  -- ============================================================
  -- ROLES & USERS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS roles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  INSERT OR IGNORE INTO roles (name, description) VALUES
    ('STUDENT', 'PNGUoT student'),
    ('STAFF', 'PNGUoT academic or administrative staff'),
    ('SECURITY', 'Campus security officer'),
    ('MEDICAL', 'Medical/first aid responder'),
    ('ADMIN', 'System administrator'),
    ('ICT_ADMIN', 'ICT technical administrator');

  CREATE TABLE IF NOT EXISTS users (
    id                      TEXT PRIMARY KEY,
    email                   TEXT UNIQUE NOT NULL,
    password_hash           TEXT NOT NULL,
    full_name               TEXT NOT NULL,
    student_or_staff_id     TEXT,
    phone                   TEXT,
    avatar_url              TEXT,
    is_active               INTEGER NOT NULL DEFAULT 1,
    last_login_at           TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at              TEXT
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id      INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
    assigned_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, role_id)
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_staff_id ON users(student_or_staff_id);
  CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);

  -- ============================================================
  -- INCIDENTS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS incidents (
    id                  TEXT PRIMARY KEY,
    reporter_id         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category            TEXT NOT NULL CHECK(category IN ('Security', 'Fire', 'Ambulance', 'Other')),
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    latitude            REAL,
    longitude           REAL,
    location_text       TEXT,
    priority            TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')),
    status              TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Received', 'Under Review', 'Assigned', 'Responding', 'Resolved', 'Closed', 'Cancelled')),
    is_anonymous        INTEGER NOT NULL DEFAULT 0,
    is_sos              INTEGER NOT NULL DEFAULT 0,
    assignee_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at     TEXT,
    assigned_at         TEXT,
    responding_at       TEXT,
    resolved_at         TEXT,
    closed_at           TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at          TEXT
  );

  CREATE TABLE IF NOT EXISTS incident_media (
    id              TEXT PRIMARY KEY,
    incident_id     TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    file_url        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    uploaded_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incident_status_history (
    id              TEXT PRIMARY KEY,
    incident_id     TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    changed_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incident_assignments (
    id              TEXT PRIMARY KEY,
    incident_id     TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    assignee_id     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status          TEXT NOT NULL DEFAULT 'Assigned',
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at    TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_incidents_reporter ON incidents(reporter_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_category ON incidents(category);
  CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
  CREATE INDEX IF NOT EXISTS idx_incidents_priority ON incidents(priority);
  CREATE INDEX IF NOT EXISTS idx_incidents_assignee ON incidents(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_incidents_created ON incidents(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_incident_media_incident ON incident_media(incident_id);
  CREATE INDEX IF NOT EXISTS idx_incident_status_history_incident ON incident_status_history(incident_id);
  CREATE INDEX IF NOT EXISTS idx_incident_assignments_incident ON incident_assignments(incident_id);
  CREATE INDEX IF NOT EXISTS idx_incident_assignments_assignee ON incident_assignments(assignee_id);

  -- ============================================================
  -- SOS EVENTS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS sos_events (
    id                  TEXT PRIMARY KEY,
    reporter_id         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    latitude            REAL,
    longitude           REAL,
    location_text       TEXT,
    status              TEXT NOT NULL DEFAULT 'Active' CHECK(status IN ('Active', 'Acknowledged', 'Responding', 'Resolved', 'Cancelled')),
    acknowledged_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at     TEXT,
    responder_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
    responding_at       TEXT,
    resolved_at         TEXT,
    cancelled_at        TEXT,
    cancellation_reason TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sos_status_history (
    id              TEXT PRIMARY KEY,
    sos_id          TEXT NOT NULL REFERENCES sos_events(id) ON DELETE CASCADE,
    old_status      TEXT,
    new_status      TEXT NOT NULL,
    changed_by      TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    note            TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_sos_events_reporter ON sos_events(reporter_id);
  CREATE INDEX IF NOT EXISTS idx_sos_events_status ON sos_events(status);
  CREATE INDEX IF NOT EXISTS idx_sos_events_created ON sos_events(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sos_status_history_sos ON sos_status_history(sos_id);

  -- ============================================================
  -- SAFETY ALERTS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS safety_alerts (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    message         TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'Info' CHECK(severity IN ('Info', 'Warning', 'Critical')),
    target_roles    TEXT DEFAULT '[]',
    target_all      INTEGER NOT NULL DEFAULT 0,
    sent_by         TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sent_at         TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS alert_deliveries (
    id              TEXT PRIMARY KEY,
    alert_id        TEXT NOT NULL REFERENCES safety_alerts(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivered_at    TEXT NOT NULL DEFAULT (datetime('now')),
    read_at         TEXT,
    UNIQUE (alert_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_safety_alerts_active ON safety_alerts(is_active, expires_at) WHERE is_active = 1;
  CREATE INDEX IF NOT EXISTS idx_alert_deliveries_user ON alert_deliveries(user_id, read_at);

  -- ============================================================
  -- ASSISTANCE REQUESTS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS assistance_requests (
    id                  TEXT PRIMARY KEY,
    requester_id        TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type                TEXT NOT NULL DEFAULT 'General' CHECK(type IN ('Security', 'Medical', 'Fire', 'General')),
    title               TEXT NOT NULL,
    description         TEXT,
    latitude            REAL,
    longitude           REAL,
    location_text       TEXT,
    status              TEXT NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled')),
    priority            TEXT NOT NULL DEFAULT 'Medium' CHECK(priority IN ('Low', 'Medium', 'High', 'Critical')),
    assignee_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at          TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at        TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_assistance_requester ON assistance_requests(requester_id);
  CREATE INDEX IF NOT EXISTS idx_assistance_status ON assistance_requests(status);
  CREATE INDEX IF NOT EXISTS idx_assistance_assignee ON assistance_requests(assignee_id);

  -- ============================================================
  -- APPEALS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS appeals (
    id                      TEXT PRIMARY KEY,
    appellant_id            TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    related_incident_id     TEXT REFERENCES incidents(id) ON DELETE SET NULL,
    type                    TEXT NOT NULL DEFAULT 'Other' CHECK(type IN ('Incident Decision', 'Disciplinary Action', 'Access Decision', 'Other')),
    title                   TEXT NOT NULL,
    description             TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'Submitted' CHECK(status IN ('Submitted', 'Under Review', 'Additional Info Required', 'Approved', 'Rejected', 'Closed')),
    reviewer_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
    decision                TEXT,
    decided_at              TEXT,
    created_at              TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS appeal_documents (
    id              TEXT PRIMARY KEY,
    appeal_id       TEXT NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
    file_url        TEXT NOT NULL,
    mime_type       TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    uploaded_by     TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_appeals_appellant ON appeals(appellant_id);
  CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);
  CREATE INDEX IF NOT EXISTS idx_appeals_incident ON appeals(related_incident_id);

  -- ============================================================
  -- POLICIES (for RAG)
  -- ============================================================

  CREATE TABLE IF NOT EXISTS policies (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    category        TEXT NOT NULL,
    filename        TEXT NOT NULL,
    folder          TEXT NOT NULL,
    page_count      INTEGER,
    content_hash    TEXT,
    is_indexed      INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS policy_chunks (
    id              TEXT PRIMARY KEY,
    policy_id       TEXT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    page_number     INTEGER,
    text            TEXT NOT NULL,
    embedding       TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_policies_category ON policies(category);
  CREATE INDEX IF NOT EXISTS idx_policy_chunks_policy ON policy_chunks(policy_id);

  -- ============================================================
  -- AUDIT LOGS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS audit_logs (
    id              TEXT PRIMARY KEY,
    user_id         TEXT REFERENCES users(id) ON DELETE SET NULL,
    action          TEXT NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT,
    old_values      TEXT,
    new_values      TEXT,
    ip_address      TEXT,
    user_agent      TEXT,
    success         INTEGER NOT NULL DEFAULT 1,
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);

  -- ============================================================
  -- REFRESH TOKENS / SESSIONS
  -- ============================================================

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    revoked     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked = 0;

  -- ============================================================
  -- TRIGGERS FOR updated_at
  -- ============================================================

  CREATE TRIGGER IF NOT EXISTS update_users_updated_at 
  AFTER UPDATE ON users
  BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_incidents_updated_at 
  AFTER UPDATE ON incidents
  BEGIN
    UPDATE incidents SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_sos_events_updated_at 
  AFTER UPDATE ON sos_events
  BEGIN
    UPDATE sos_events SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_safety_alerts_updated_at 
  AFTER UPDATE ON safety_alerts
  BEGIN
    UPDATE safety_alerts SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_assistance_requests_updated_at 
  AFTER UPDATE ON assistance_requests
  BEGIN
    UPDATE assistance_requests SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_appeals_updated_at 
  AFTER UPDATE ON appeals
  BEGIN
    UPDATE appeals SET updated_at = datetime('now') WHERE id = NEW.id;
  END;

  CREATE TRIGGER IF NOT EXISTS update_policies_updated_at 
  AFTER UPDATE ON policies
  BEGIN
    UPDATE policies SET updated_at = datetime('now') WHERE id = NEW.id;
  END;
`);

return db;
}
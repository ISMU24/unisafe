-- UniSafe PostgreSQL Schema
-- Normalized relational schema for campus safety system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Optional: Enable pgvector for Policy AI embeddings (requires pgvector extension)
-- Uncomment the following line if pgvector is available:
-- CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================
-- ROLES & USERS
-- ============================================================

CREATE TABLE roles (
    id          SMALLSERIAL PRIMARY KEY,
    name        VARCHAR(32) UNIQUE NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO roles (name, description) VALUES
    ('STUDENT', 'PNGUoT student'),
    ('STAFF', 'PNGUoT academic or administrative staff'),
    ('SECURITY', 'Campus security officer'),
    ('MEDICAL', 'Medical/first aid responder'),
    ('ADMIN', 'System administrator'),
    ('ICT_ADMIN', 'ICT technical administrator')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email               VARCHAR(255) UNIQUE NOT NULL,
    password_hash       VARCHAR(255) NOT NULL,
    full_name           VARCHAR(255) NOT NULL,
    student_or_staff_id VARCHAR(64),
    phone               VARCHAR(32),
    avatar_url          VARCHAR(512),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE user_roles (
    user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id  SMALLINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_staff_id ON users(student_or_staff_id);
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ============================================================
-- INCIDENTS
-- ============================================================

CREATE TYPE incident_category AS ENUM ('Security', 'Fire', 'Ambulance', 'Other');
CREATE TYPE incident_status AS ENUM (
    'Submitted', 'Received', 'Under Review', 'Assigned', 
    'Responding', 'Resolved', 'Closed', 'Cancelled'
);
CREATE TYPE incident_priority AS ENUM ('Low', 'Medium', 'High', 'Critical');

CREATE TABLE incidents (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    category            incident_category NOT NULL,
    title               VARCHAR(255) NOT NULL,
    description         TEXT NOT NULL,
    latitude            NUMERIC(10, 7),
    longitude           NUMERIC(10, 7),
    location_text       VARCHAR(512),
    priority            incident_priority NOT NULL DEFAULT 'Medium',
    status              incident_status NOT NULL DEFAULT 'Submitted',
    is_anonymous        BOOLEAN NOT NULL DEFAULT FALSE,
    is_sos              BOOLEAN NOT NULL DEFAULT FALSE,
    assignee_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at     TIMESTAMPTZ,
    assigned_at         TIMESTAMPTZ,
    responding_at       TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    closed_at           TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE incident_media (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    file_url        VARCHAR(512) NOT NULL,
    mime_type       VARCHAR(128) NOT NULL,
    file_size       INTEGER NOT NULL,
    uploaded_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE incident_status_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    old_status      incident_status,
    new_status      incident_status NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE incident_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id     UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    assignee_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    assigned_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status          incident_status NOT NULL DEFAULT 'Assigned',
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_incidents_reporter ON incidents(reporter_id);
CREATE INDEX idx_incidents_category ON incidents(category);
CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_priority ON incidents(priority);
CREATE INDEX idx_incidents_assignee ON incidents(assignee_id);
CREATE INDEX idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX idx_incidents_location ON incidents(latitude, longitude) 
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX idx_incident_media_incident ON incident_media(incident_id);
CREATE INDEX idx_incident_status_history_incident ON incident_status_history(incident_id);
CREATE INDEX idx_incident_assignments_incident ON incident_assignments(incident_id);
CREATE INDEX idx_incident_assignments_assignee ON incident_assignments(assignee_id);

-- ============================================================
-- SOS EVENTS
-- ============================================================

CREATE TYPE sos_status AS ENUM (
    'Active', 'Acknowledged', 'Responding', 'Resolved', 'Cancelled'
);

CREATE TABLE sos_events (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    latitude            NUMERIC(10, 7),
    longitude           NUMERIC(10, 7),
    location_text       VARCHAR(512),
    status              sos_status NOT NULL DEFAULT 'Active',
    acknowledged_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at     TIMESTAMPTZ,
    responder_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    responding_at       TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sos_status_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sos_id          UUID NOT NULL REFERENCES sos_events(id) ON DELETE CASCADE,
    old_status      sos_status,
    new_status      sos_status NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sos_events_reporter ON sos_events(reporter_id);
CREATE INDEX idx_sos_events_status ON sos_events(status);
CREATE INDEX idx_sos_events_created ON sos_events(created_at DESC);
CREATE INDEX idx_sos_status_history_sos ON sos_status_history(sos_id);

-- ============================================================
-- SAFETY ALERTS
-- ============================================================

CREATE TYPE alert_severity AS ENUM ('Info', 'Warning', 'Critical');

CREATE TABLE safety_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(255) NOT NULL,
    message         TEXT NOT NULL,
    severity        alert_severity NOT NULL DEFAULT 'Info',
    target_roles    SMALLINT[] DEFAULT '{}',
    target_all      BOOLEAN NOT NULL DEFAULT FALSE,
    sent_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE alert_deliveries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    alert_id        UUID NOT NULL REFERENCES safety_alerts(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at         TIMESTAMPTZ,
    UNIQUE (alert_id, user_id)
);

CREATE INDEX idx_safety_alerts_active ON safety_alerts(is_active, expires_at) 
    WHERE is_active = TRUE;
CREATE INDEX idx_alert_deliveries_user ON alert_deliveries(user_id, read_at);

-- ============================================================
-- ASSISTANCE REQUESTS
-- ============================================================

CREATE TYPE assistance_status AS ENUM (
    'Pending', 'Assigned', 'In Progress', 'Completed', 'Cancelled'
);
CREATE TYPE assistance_type AS ENUM ('Security', 'Medical', 'Fire', 'General');

CREATE TABLE assistance_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    type                assistance_type NOT NULL DEFAULT 'General',
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    latitude            NUMERIC(10, 7),
    longitude           NUMERIC(10, 7),
    location_text       VARCHAR(512),
    status              assistance_status NOT NULL DEFAULT 'Pending',
    priority            incident_priority NOT NULL DEFAULT 'Medium',
    assignee_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ
);

CREATE INDEX idx_assistance_requester ON assistance_requests(requester_id);
CREATE INDEX idx_assistance_status ON assistance_requests(status);
CREATE INDEX idx_assistance_assignee ON assistance_requests(assignee_id);

-- ============================================================
-- APPEALS
-- ============================================================

CREATE TYPE appeal_status AS ENUM (
    'Submitted', 'Under Review', 'Additional Info Required', 
    'Approved', 'Rejected', 'Closed'
);
CREATE TYPE appeal_type AS ENUM (
    'Incident Decision', 'Disciplinary Action', 'Access Decision', 'Other'
);

CREATE TABLE appeals (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appellant_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    related_incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
    type                appeal_type NOT NULL DEFAULT 'Other',
    title               VARCHAR(255) NOT NULL,
    description         TEXT NOT NULL,
    status              appeal_status NOT NULL DEFAULT 'Submitted',
    reviewer_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    decision            TEXT,
    decided_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE appeal_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appeal_id       UUID NOT NULL REFERENCES appeals(id) ON DELETE CASCADE,
    file_url        VARCHAR(512) NOT NULL,
    mime_type       VARCHAR(128) NOT NULL,
    file_size       INTEGER NOT NULL,
    uploaded_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appeals_appellant ON appeals(appellant_id);
CREATE INDEX idx_appeals_status ON appeals(status);
CREATE INDEX idx_appeals_incident ON appeals(related_incident_id);

-- ============================================================
-- POLICIES (for RAG)
-- ============================================================

CREATE TABLE policies (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title           VARCHAR(512) NOT NULL,
    category        VARCHAR(128) NOT NULL,
    filename        VARCHAR(255) NOT NULL,
    folder          VARCHAR(128) NOT NULL,
    page_count      INTEGER,
    content_hash    VARCHAR(64),
    is_indexed      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE policy_chunks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id       UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    page_number     INTEGER,
    text            TEXT NOT NULL,
    embedding       TEXT,  -- Store as JSON array; use VECTOR(1024) if pgvector extension is enabled
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_policies_category ON policies(category);
CREATE INDEX idx_policy_chunks_policy ON policy_chunks(policy_id);

-- ============================================================
-- AUDIT LOGS
-- ============================================================

CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(64) NOT NULL,
    resource_type   VARCHAR(64) NOT NULL,
    resource_id     UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    success         BOOLEAN NOT NULL DEFAULT TRUE,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================
-- REFRESH TOKENS / SESSIONS
-- ============================================================

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) 
    WHERE revoked = FALSE;

-- ============================================================
-- TRIGGERS FOR updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_incidents_updated_at BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sos_events_updated_at BEFORE UPDATE ON sos_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_safety_alerts_updated_at BEFORE UPDATE ON safety_alerts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assistance_requests_updated_at BEFORE UPDATE ON assistance_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appeals_updated_at BEFORE UPDATE ON appeals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_policies_updated_at BEFORE UPDATE ON policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Get user roles as array of role names
CREATE OR REPLACE FUNCTION get_user_roles(p_user_id UUID)
RETURNS TEXT[] AS $$
    SELECT ARRAY(
        SELECT r.name 
        FROM roles r
        JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
    );
$$ LANGUAGE sql STABLE;

-- Check if user has any of the given roles
CREATE OR REPLACE FUNCTION user_has_role(p_user_id UUID, p_role_names TEXT[])
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM roles r
        JOIN user_roles ur ON ur.role_id = r.id
        WHERE ur.user_id = p_user_id
        AND r.name = ANY(p_role_names)
    );
$$ LANGUAGE sql STABLE;

-- Get incidents visible to a user based on role
CREATE OR REPLACE FUNCTION get_visible_incidents(p_user_id UUID, p_role_names TEXT[])
RETURNS SETOF incidents AS $$
BEGIN
    -- ADMIN and ICT_ADMIN see all
    IF p_role_names && ARRAY['ADMIN', 'ICT_ADMIN'] THEN
        RETURN QUERY SELECT * FROM incidents WHERE deleted_at IS NULL;
    -- SECURITY sees Security, Fire, Other (not Ambulance unless MEDICAL also)
    ELSIF p_role_names && ARRAY['SECURITY'] THEN
        RETURN QUERY SELECT * FROM incidents 
            WHERE deleted_at IS NULL 
            AND (category IN ('Security', 'Fire', 'Other') OR 
                 (category = 'Ambulance' AND p_role_names && ARRAY['MEDICAL']));
    -- MEDICAL sees Ambulance
    ELSIF p_role_names && ARRAY['MEDICAL'] THEN
        RETURN QUERY SELECT * FROM incidents 
            WHERE deleted_at IS NULL 
            AND category = 'Ambulance';
    -- STUDENT/STAFF see only their own
    ELSE
        RETURN QUERY SELECT * FROM incidents 
            WHERE deleted_at IS NULL 
            AND reporter_id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;
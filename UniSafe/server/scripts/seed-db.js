/**
 * Seed the database with demo users and operational data.
 *
 * Works on both PostgreSQL and SQLite through the shared `db` abstraction, so
 * the same seed can be used locally and on a hosted instance.
 *
 * Credentials come from SEED_* environment variables. Anything not supplied is
 * generated with crypto randomness and printed once at the end, so no weak
 * default password is ever stored silently.
 *
 * Usage: npm run db:seed
 */
import 'dotenv/config';
import crypto from 'crypto';
import db, { arrayParameter, isPostgres, closePool, initializeDatabase } from '../src/config/db.js';
import { hashPassword } from '../src/auth/database.js';

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

function daysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 3600000).toISOString();
}

/** 18+ chars with a digit, matching the server's own password policy. */
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const pick = pool => pool[crypto.randomInt(pool.length)];

  const chars = [
    pick(upper), pick(upper),
    pick(lower), pick(lower),
    pick(digits), pick(digits), pick(digits),
    pick(symbols),
  ];
  while (chars.length < 16) chars.push(pick(all));
  // Fisher-Yates so the guaranteed characters are not always in front.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

const credentials = [];

async function seedUser({ key, envPrefix, role, email, full_name, student_or_staff_id, phone }) {
  const explicitPassword = process.env[`${envPrefix}_PASSWORD`];
  const password = explicitPassword || generatePassword();
  const resolvedEmail = process.env[`${envPrefix}_EMAIL`] || email;

  const existing = await db.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL').get(resolvedEmail);

  let userId;
  if (existing) {
    userId = existing.id;
    // Only overwrite the stored hash when a password was explicitly supplied.
    // Generating a fresh random password here would silently reset the account
    // on every re-run, invalidating credentials an operator had already
    // recorded or changed.
    if (explicitPassword) {
      await db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
        .run(await hashPassword(password), nowIso(), userId);
    }
  } else {
    userId = uuid();
    await db.prepare(`
      INSERT INTO users (id, email, password_hash, full_name, student_or_staff_id, phone, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, resolvedEmail, await hashPassword(password), full_name, student_or_staff_id, phone, true, nowIso(), nowIso());
  }

  const roleRow = await db.prepare('SELECT id FROM roles WHERE name = ?').get(role);
  if (!roleRow) throw new Error(`Role ${role} is missing. Run npm run db:init first.`);
  await db.prepare(`
    INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, ?)
    ON CONFLICT (user_id, role_id) DO NOTHING
  `).run(userId, roleRow.id, nowIso());

  // The password is only known when it was just set: either the account is new,
  // or an explicit SEED_*_PASSWORD overwrote it. Printing a generated password
  // for an untouched existing account would be a lie, so it is not printed.
  const passwordIsKnown = !existing || Boolean(explicitPassword);
  credentials.push({
    key,
    role,
    email: resolvedEmail,
    password,
    passwordIsKnown,
    action: existing ? 'password reset' : 'created',
  });
  return userId;
}

async function seedIdempotently(sql, params) {
  const result = await db.prepare(sql).run(...params);
  return (result.changes ?? 0) > 0;
}

async function main() {
  await initializeDatabase();
  console.log(`Seeding ${isPostgres() ? 'PostgreSQL' : 'SQLite'} database...`);

  await db.transaction(async () => {
    // Roles are seeded by the schema; re-assert in case of an older database.
    const roles = [
      ['STUDENT', 'PNGUoT student'],
      ['STAFF', 'PNGUoT academic or administrative staff'],
      ['SECURITY', 'Campus security officer'],
      ['MEDICAL', 'Medical/first aid responder'],
      ['ADMIN', 'System administrator'],
      ['ICT_ADMIN', 'ICT technical administrator'],
    ];
    for (const [name, description] of roles) {
      const existing = await db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
      if (!existing) {
        await db.prepare('INSERT INTO roles (name, description, created_at) VALUES (?, ?, ?)')
          .run(name, description, nowIso());
      }
    }

    // ── Users ────────────────────────────────────────────────────────────
    const adminId = await seedUser({
      key: 'Admin', envPrefix: 'SEED_ADMIN', role: 'ADMIN',
      email: 'admin@pnguot.ac.pg', full_name: 'System Administrator',
      student_or_staff_id: 'ADM-0001', phone: '+675 7123 4567',
    });
    await seedUser({
      key: 'ICT admin', envPrefix: 'SEED_ICT', role: 'ICT_ADMIN',
      email: 'ict@pnguot.ac.pg', full_name: 'ICT Administrator',
      student_or_staff_id: 'ICT-0001', phone: '+675 7123 4571',
    });
    const securityId = await seedUser({
      key: 'Security officer', envPrefix: 'SEED_SECURITY', role: 'SECURITY',
      email: 'security@pnguot.ac.pg', full_name: 'Officer T. Kaupa',
      student_or_staff_id: 'SEC-001', phone: '+675 7123 4568',
    });
    const medicalId = await seedUser({
      key: 'Medical responder', envPrefix: 'SEED_MEDICAL', role: 'MEDICAL',
      email: 'medical@pnguot.ac.pg', full_name: 'Officer M. Sogeri',
      student_or_staff_id: 'MED-001', phone: '+675 7123 4569',
    });
    const staffId = await seedUser({
      key: 'Staff', envPrefix: 'SEED_STAFF', role: 'STAFF',
      email: 'staff@pnguot.ac.pg', full_name: 'Steven Namaliu',
      student_or_staff_id: 'STF-0219', phone: '+675 7123 4570',
    });
    const studentIds = {};
    for (const student of [
      { envPrefix: 'SEED_STUDENT1', email: '23201047@student.pnguot.ac.pg', full_name: 'Israel Muge', student_or_staff_id: '23201047' },
      { envPrefix: 'SEED_STUDENT2', email: '23198812@student.pnguot.ac.pg', full_name: 'Rachel Waigani', student_or_staff_id: '23198812' },
      { envPrefix: 'SEED_STUDENT3', email: '23205511@student.pnguot.ac.pg', full_name: 'Kaupa Tolo', student_or_staff_id: '23205511' },
    ]) {
      studentIds[student.envPrefix] = await seedUser({
        key: `Student (${student.full_name})`, envPrefix: student.envPrefix, role: 'STUDENT',
        email: student.email, full_name: student.full_name,
        student_or_staff_id: student.student_or_staff_id, phone: '+675 7123 4572',
      });
    }

    // ── Incidents ────────────────────────────────────────────────────────
    // These ids are fixed UUIDs rather than the old "INC-4471" style codes.
    // The column is UUID, so PostgreSQL rejects the old strings outright, and
    // they must stay stable because re-running the seed relies on
    // ON CONFLICT (id) DO NOTHING to avoid duplicating rows.
    const incidents = [
      {
        id: '1a2b3c4d-0001-4000-8000-000000004471', reporter: studentIds.SEED_STUDENT1, assignee: securityId,
        category: 'Security', title: 'Suspicious person near Hostel 3',
        description: 'A person was loitering near the Hostel 3 entrance and appeared to be checking student bags.',
        location_text: 'Hostel 3, North Campus', priority: 'Medium', status: 'Assigned',
        is_anonymous: false, is_sos: false,
        submitted_at: daysAgo(11), acknowledged_at: daysAgo(11), assigned_at: daysAgo(10),
      },
      {
        id: '1a2b3c4d-0002-4000-8000-000000007702', reporter: studentIds.SEED_STUDENT2, assignee: securityId,
        category: 'Ambulance', title: 'Emergency SOS - student collapsed at gym',
        description: 'A student collapsed during a netball match and is not responding.',
        latitude: -6.6735, longitude: 146.9970,
        location_text: 'Sporting Facilities', priority: 'Critical', status: 'Responding',
        is_anonymous: false, is_sos: true,
        submitted_at: daysAgo(10), acknowledged_at: daysAgo(10), assigned_at: daysAgo(10),
        responding_at: daysAgo(10),
      },
      {
        id: '1a2b3c4d-0003-4000-8000-000000004468', reporter: studentIds.SEED_STUDENT1, assignee: null,
        category: 'Other', title: 'Broken perimeter light, Block C',
        description: 'The perimeter light outside Block C has been out for several nights.',
        location_text: 'Block C walkway', priority: 'Low', status: 'Submitted',
        is_anonymous: true, is_sos: false, submitted_at: daysAgo(10),
      },
      {
        id: '1a2b3c4d-0004-4000-8000-000000004463', reporter: staffId, assignee: securityId,
        category: 'Fire', title: 'Smoke reported in Chem Lab B',
        description: 'Light smoke was noticed coming from Chem Lab B. The lab was secured and checked.',
        location_text: 'Science Building, Lab B', priority: 'High', status: 'Resolved',
        is_anonymous: false, is_sos: false,
        submitted_at: daysAgo(12), acknowledged_at: daysAgo(12), assigned_at: daysAgo(12),
        resolved_at: daysAgo(12),
      },
    ];

    for (const inc of incidents) {
      const created = await seedIdempotently(`
        INSERT INTO incidents (id, reporter_id, category, title, description, latitude, longitude,
          location_text, priority, status, is_anonymous, is_sos, assignee_id,
          acknowledged_at, assigned_at, responding_at, resolved_at, closed_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO NOTHING
      `, [
        inc.id, inc.reporter, inc.category, inc.title, inc.description,
        inc.latitude ?? null, inc.longitude ?? null, inc.location_text,
        inc.priority, inc.status, Boolean(inc.is_anonymous), Boolean(inc.is_sos), inc.assignee,
        inc.acknowledged_at ?? null, inc.assigned_at ?? null,
        inc.responding_at ?? null, inc.resolved_at ?? null,
        inc.status === 'Closed' ? inc.resolved_at : null,
        inc.submitted_at, inc.resolved_at || inc.submitted_at,
      ]);
      if (!created) continue;

      const history = [[null, 'Submitted', inc.reporter, 'Report received by the security office.', inc.submitted_at]];
      if (inc.acknowledged_at) history.push(['Submitted', 'Received', inc.assignee || inc.reporter, 'Report acknowledged by security.', inc.acknowledged_at]);
      if (inc.assigned_at) history.push(['Received', 'Assigned', inc.assignee, 'Officer assigned to the report.', inc.assigned_at]);
      if (inc.responding_at) history.push(['Assigned', 'Responding', inc.assignee, 'Officer on scene.', inc.responding_at]);
      if (inc.resolved_at) history.push(['Responding', 'Resolved', inc.assignee, 'Issue resolved.', inc.resolved_at]);

      for (const [old_status, new_status, changed_by, note, created_at] of history) {
        await db.prepare(`
          INSERT INTO incident_status_history (id, incident_id, old_status, new_status, changed_by, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(uuid(), inc.id, old_status, new_status, changed_by, note, created_at);
      }

      if (inc.assignee && inc.assigned_at) {
        await db.prepare(`
          INSERT INTO incident_assignments (id, incident_id, assignee_id, assigned_by, status, note, created_at, completed_at)
          VALUES (?, ?, ?, ?, 'Assigned', ?, ?, ?)
        `).run(uuid(), inc.id, inc.assignee, inc.assignee, 'Auto-assigned on status change', inc.assigned_at,
          inc.status === 'Resolved' ? inc.resolved_at : null);
      }
    }

    // ── SOS events ───────────────────────────────────────────────────────
    const sosId = '1a2b3c4d-0002-4000-8000-000000007702';
    if (await seedIdempotently(`
      INSERT INTO sos_events (id, reporter_id, latitude, longitude, location_text, status,
        acknowledged_by, acknowledged_at, responder_id, responding_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'Responding', ?, ?, ?, ?, ?, ?)
      ON CONFLICT (id) DO NOTHING
    `, [
      sosId, studentIds.SEED_STUDENT2, -6.6735, 146.9970, 'Sporting Facilities',
      securityId, daysAgo(10), medicalId, daysAgo(10), daysAgo(10), daysAgo(10),
    ])) {
      await db.prepare(`
        INSERT INTO sos_status_history (id, sos_id, old_status, new_status, changed_by, note, created_at)
        VALUES (?, ?, NULL, 'Active', ?, 'SOS alert triggered. Help is on the way.', ?)
      `).run(uuid(), sosId, studentIds.SEED_STUDENT2, daysAgo(10));
      await db.prepare(`
        INSERT INTO sos_status_history (id, sos_id, old_status, new_status, changed_by, note, created_at)
        VALUES (?, ?, 'Active', 'Acknowledged', ?, 'SOS acknowledged by security.', ?)
      `).run(uuid(), sosId, securityId, daysAgo(10));
      await db.prepare(`
        INSERT INTO sos_status_history (id, sos_id, old_status, new_status, changed_by, note, created_at)
        VALUES (?, ?, 'Acknowledged', 'Responding', ?, 'Medical responder dispatched.', ?)
      `).run(uuid(), sosId, medicalId, daysAgo(10));
    }

    // ── Safety alerts ────────────────────────────────────────────────────
    const roleIds = [];
    for (const name of ['STUDENT', 'STAFF']) {
      const row = await db.prepare('SELECT id FROM roles WHERE name = ?').get(name);
      if (row) roleIds.push(row.id);
    }

    const alerts = [
      {
        title: 'Campus Safety Reminder',
        message: 'Always carry your student ID card when moving around campus after dark.',
        severity: 'Info', target_all: true, target_roles: [], sent_at: daysAgo(2), expires_at: daysFromNow(5),
      },
      {
        title: 'Fire Drill Scheduled',
        message: 'A campus-wide fire drill will be conducted on Friday at 10:00 AM. Please follow evacuation procedures.',
        severity: 'Warning', target_all: true, target_roles: [], sent_at: daysAgo(1), expires_at: daysFromNow(3),
      },
      {
        title: 'Staff Briefing on Incident Reporting',
        message: 'All staff must review the updated incident reporting procedure before the end of the week.',
        severity: 'Info', target_all: false, target_roles: roleIds, sent_at: hoursAgo(20), expires_at: hoursFromNow(72),
      },
    ];

    for (const alert of alerts) {
      const existing = await db.prepare('SELECT id FROM safety_alerts WHERE title = ?').get(alert.title);
      if (existing) continue;
      await db.prepare(`
        INSERT INTO safety_alerts (id, title, message, severity, target_roles, target_all, sent_by, sent_at, expires_at, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuid(), alert.title, alert.message, alert.severity,
        arrayParameter(alert.target_roles), Boolean(alert.target_all),
        adminId, alert.sent_at, alert.expires_at, true, alert.sent_at, alert.sent_at);
    }

    // ── Assistance requests ──────────────────────────────────────────────
    const assistance = [
      {
        requester: studentIds.SEED_STUDENT1, type: 'Medical', title: 'First aid needed at Library',
        description: 'A student has a minor cut and needs a bandage.',
        location_text: 'Library, Ground Floor', status: 'Completed', priority: 'Low',
        assignee: medicalId, created_at: hoursAgo(6), completed_at: hoursAgo(4),
      },
      {
        requester: studentIds.SEED_STUDENT2, type: 'Security', title: 'Escort request',
        description: 'Female student requesting an escort back to the dormitory.',
        location_text: 'Dining Hall to Female Dormitories', status: 'Assigned', priority: 'Medium',
        assignee: securityId, created_at: hoursAgo(1), completed_at: null,
      },
    ];

    for (const request of assistance) {
      const existing = await db.prepare('SELECT id FROM assistance_requests WHERE title = ? AND requester_id = ?')
        .get(request.title, request.requester);
      if (existing) continue;
      await db.prepare(`
        INSERT INTO assistance_requests (id, requester_id, type, title, description, location_text,
          status, priority, assignee_id, created_at, updated_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(uuid(), request.requester, request.type, request.title, request.description,
        request.location_text, request.status, request.priority, request.assignee,
        request.created_at, request.completed_at || request.created_at, request.completed_at);
    }

    // ── Appeals ──────────────────────────────────────────────────────────
    const anonymousIncidentId = incidents.find(
      (inc) => inc.title === 'Broken perimeter light, Block C'
    )?.id;
    const existingAppeal = await db.prepare('SELECT id FROM appeals WHERE title = ?').get('Appeal on incident handling');
    if (!existingAppeal && anonymousIncidentId) {
      await db.prepare(`
        INSERT INTO appeals (id, appellant_id, related_incident_id, type, title, description,
          status, reviewer_id, decision, decided_at, created_at, updated_at)
        VALUES (?, ?, ?, 'Incident Decision', ?, ?, 'Under Review', ?, NULL, NULL, ?, ?)
      `).run(uuid(), studentIds.SEED_STUDENT3, anonymousIncidentId,
        'Appeal on incident handling',
        'I would like to request a review of how my anonymous report was handled.',
        adminId, daysAgo(4), daysAgo(4));
    }
  });

  console.log('\nDatabase seeding complete.');
  const width = Math.max(...credentials.map(c => c.key.length));
  const printable = credentials.filter(c => c.passwordIsKnown);

  if (printable.length) {
    console.log('\n=== Seeded account credentials ===');
    for (const credential of printable) {
      console.log(
        `${credential.key.padEnd(width)}  ${credential.email.padEnd(36)}  ${credential.password}  (${credential.action})`
      );
    }
    console.log('\nThese passwords are shown once and were not read from any source.');
    console.log('Store them securely and change them before handing the system over.');
  }

  const untouched = credentials.filter(c => !c.passwordIsKnown);
  if (untouched.length) {
    console.log(`\n${untouched.length} account(s) already existed and were left unchanged:`);
    for (const credential of untouched) {
      console.log(`  ${credential.email}`);
    }
    console.log('Their passwords were NOT reset and are not shown here.');
    console.log('To set one explicitly, re-run with SEED_<ACCOUNT>_PASSWORD set.');
  }
  console.log('');
}

main()
  .then(async () => {
    await closePool();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('Database seeding failed:', error.message);
    if (process.env.DEBUG) console.error(error.stack);
    await closePool().catch(() => {});
    process.exit(1);
  });
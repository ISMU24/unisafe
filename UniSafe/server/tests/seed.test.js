import { it, expect, vi } from 'vitest';
import db from '../src/config/db.js';
import { seedDatabase } from '../scripts/seed-db.js';

it('creates fictional, labelled demo fixtures and preserves generated passwords on rerun', async () => {
  // Seed only the in-memory test database. Never emit even fixture passwords.
  const output = vi.spyOn(console, 'log').mockImplementation(() => {});
  for (const account of ['ADMIN', 'ICT', 'SECURITY', 'MEDICAL', 'STAFF', 'STUDENT1', 'STUDENT2', 'STUDENT3']) {
    vi.stubEnv(`SEED_${account}_EMAIL`, '');
    vi.stubEnv(`SEED_${account}_PASSWORD`, '');
  }
  try {
    await seedDatabase();
    const users = await db.prepare('SELECT email, full_name, student_or_staff_id, phone, password_hash FROM users ORDER BY email').all();
    expect(users).toHaveLength(8);
    for (const user of users) {
      expect(user.email).toMatch(/@example\.invalid$/);
      expect(user.full_name).toMatch(/^Demo /);
      expect(user.student_or_staff_id).toMatch(/^DEMO-/);
      expect(user.phone).toBeNull();
    }
    const checks = {
      incidents: ['title', 'description', 'location_text'],
      sos_events: ['location_text'],
      safety_alerts: ['title', 'message'],
      assistance_requests: ['title', 'description', 'location_text'],
      appeals: ['title', 'description'],
    };
    const counts = {};
    for (const [table, fields] of Object.entries(checks)) {
      const rows = await db.prepare(`SELECT * FROM ${table}`).all();
      expect(rows.length).toBeGreaterThan(0);
      counts[table] = rows.length;
      for (const row of rows) for (const field of fields) expect(row[field]).toMatch(/^DEMO ONLY/);
    }
    await seedDatabase();
    const unchanged = await db.prepare('SELECT email, full_name, student_or_staff_id, phone, password_hash FROM users ORDER BY email').all();
    // Compare as a boolean so a failure cannot print stored password hashes.
    expect(JSON.stringify(users) === JSON.stringify(unchanged)).toBe(true);
    for (const [table, count] of Object.entries(counts)) {
      expect((await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()).count).toBe(count);
    }
  } finally {
    output.mockRestore();
    vi.unstubAllEnvs();
  }
});

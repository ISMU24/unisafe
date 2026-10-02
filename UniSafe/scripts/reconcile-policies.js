#!/usr/bin/env node
/**
 * reconcile-policies.js
 *
 * - Scans assets/Unitech Policies/*.pdf
 * - Creates Assets/Policies/<CategoryFolder>/ folders if missing
 * - Moves PDFs into the matching category folder (idempotent)
 * - Writes src/data/policyCatalog.js entries (already maintained manually).
 *
 * Run:  node scripts/reconcile-policies.js
 * Safe to re-run.
 */

const fs   = require('fs');
const path = require('path');

const ROOT      = path.resolve(__dirname, '..');
const SRC_DIR   = path.join(ROOT, 'assets', 'Unitech Policies');
const DEST_ROOT = path.join(ROOT, 'Assets', 'Policies');
const CATALOG = {
  'University-Policies': [
    { filename: 'Papua-New-Guinea-University-of-Technology-Act-1986.pdf',   title: 'Papua New Guinea University of Technology Act 1986' },
    { filename: 'Higher-Education-General-Provisions-Act-2014.pdf',        title: 'Higher Education (General Provisions) Act 2014' },
    { filename: 'Policy-on-Policies.pdf',                                    title: 'Policy on Policies' },
    { filename: 'Fraud-and-Corruption-Prevention-Policy.pdf',                title: 'Fraud and Corruption Prevention Policy' },
    { filename: 'Whistle-Blower-Policy.pdf',                                 title: 'Whistle Blower Policy' },
    { filename: 'OHSE-Policy.pdf',                                           title: 'OHSE Policy' },
    { filename: 'University-Statutes.pdf',                                   title: 'University Statutes' },
  ],
  'Board-Policies': [
    { filename: 'Union-Board-Constitution.pdf',                              title: 'Union Board Constitution' },
    { filename: 'Student-Representative-Council-Constitution.pdf',          title: 'Student Representative Council Constitution' },
  ],
  'Academic-Policies': [
    { filename: 'AI-Use-Policy.pdf',                                         title: 'AI Use Policy' },
    { filename: 'Academic-Integrity-PG-Program.pdf',                         title: 'Academic Integrity Policy (Post Graduate Program)' },
    { filename: 'Policy-and-Procedures-DODL.pdf',                            title: 'Policy and Procedures (DODL)' },
    { filename: 'Postgraduate-Calendar.pdf',                                 title: 'Post Graduate Calendar' },
    { filename: 'Certification-and-Procedure-Policy-for-DODL.pdf',           title: 'Certification and Procedure Policy for DODL' },
  ],
  'Student-Policies': [
    { filename: 'Admission-Policy.pdf',                                      title: 'Admission Policy' },
    { filename: 'Student-Rules-Policy.pdf',                                  title: 'Student Rules Policy' },
    { filename: 'Student-School-Fee-and-Refund-Policy.pdf',                  title: 'Student School Fee and Refund Policy' },
  ],
  'Research-Policies': [
    { filename: 'Research-Management-Policies-and-Guidelines.pdf',           title: 'Research Management Policies and Guidelines' },
    { filename: 'Research-Conference-Guidelines.pdf',                        title: 'Research Conference Guidelines' },
  ],
  'ICT-Policies': [
    { filename: 'ICT-Policy.pdf',                                            title: 'ICT Policy' },
    { filename: 'Internet-Usage-Policy.pdf',                                 title: 'Internet Usage Policy' },
  ],
  'HR-Policies': [
    { filename: 'GEDSI-Policy.pdf',                                          title: 'GEDSI Policy' },
  ],
};

const flat = {};
for (const [folder, items] of Object.entries(CATALOG)) {
  for (const item of items) {
    flat[item.filename] = { ...item, folder };
  }
}
// POLICIES_BY_FILENAME export removed — only used inside this script.

let moved = 0;
let skipped = 0;

if (!fs.existsSync(SRC_DIR)) {
  console.warn('Source directory missing (policies already reconciled):', SRC_DIR);
  console.log(`\nDone. Moved: ${moved}, Skipped: ${skipped}`);
  process.exit(0);
}

for (const [folder, items] of Object.entries(CATALOG)) {
  const targetDir = path.join(DEST_ROOT, folder);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const item of items) {
    const src  = path.join(SRC_DIR, item.filename);
    const dest = path.join(targetDir, item.filename);

    if (!fs.existsSync(src)) {
      console.warn('  MISSING (not moved):', item.filename);
      continue;
    }
    if (fs.existsSync(dest)) {
      console.log('  Already in place:', item.filename, '→', folder);
      skipped++;
      continue;
    }
    fs.copyFileSync(src, dest);
    console.log('  Moved:', item.filename, '→', folder);
    moved++;
  }
}

// Clean up source dir if now empty (only top-level files removed).
try {
  const remaining = fs.readdirSync(SRC_DIR).filter(f => fs.statSync(path.join(SRC_DIR, f)).isFile());
  if (remaining.length === 0) {
    fs.rmdirSync(SRC_DIR);
    console.log('Removed empty source folder:', SRC_DIR);
  }
} catch (e) {
  // ignore
}

console.log(`\nDone. Moved: ${moved}, Skipped: ${skipped}`);

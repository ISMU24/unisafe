// Canonical list of every UniSafe policy PDF, grouped by category.
// filename = exact file (without folder) in /Assets/Policies/<categoryFolder>/.
// Run `npm run reconcile:policies` to materialize this on disk from
// /assets/Unitech Policies/*.pdf.

export const POLICY_CATALOG = {
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

// Flat lookup by filename (without folder) — used by the PolicyBrowser to
// resolve category/title from a single require() map keyed by filename.
const flat = {};
for (const [folder, items] of Object.entries(POLICY_CATALOG)) {
  for (const item of items) {
    flat[item.filename] = { ...item, folder };
  }
}
export const POLICIES_BY_FILENAME = flat;

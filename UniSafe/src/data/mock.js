// =============================================================
// MOCK DATA — UniSafe
// Replace every export with real API calls when backend ready.
// =============================================================

// TODO: API → POST /auth/login
export const mockUser = {
  id: 'STU-2024-0042',
  fullName: 'Victor Seng',
  name: 'Victor Seng',
  role: 'student',
  faculty: 'Accounting',
  email: '23200693vise@student.pnguot.ac.pg',
  universityId: '23200693',
};

// TODO: API → GET /announcements?limit=5
export const mockAnnouncements = [
  { id: 'ANN-001', title: 'Campus gates close at 10 PM tonight', body: 'All students must be inside residential halls by 22:00. Security patrols increased.', time: '2 hours ago', priority: 'high' },
  { id: 'ANN-002', title: 'Fire drill — A Block, Friday 09:00',  body: 'Mandatory evacuation drill for all A Block occupants.',                          time: '1 day ago',   priority: 'medium' },
];

// TODO: API → GET /notifications?userId=:id&limit=20
export const mockNotifications = [
  { id: 'NOT-001', category: 'Security',  title: 'Suspicious activity reported near Library', body: 'Security team has been dispatched. Avoid the area until further notice.', time: '10 min ago', read: false },
  { id: 'NOT-002', category: 'Ambulance', title: 'Medical assistance provided at Oval',        body: 'Situation resolved. Campus clinic on standby.',                          time: '1 hour ago', read: false },
  { id: 'NOT-003', category: 'Fire',      title: 'False alarm — Cafeteria smoke detector',     body: 'Investigated and cleared by security. No fire detected.',                time: '3 hours ago', read: true  },
  { id: 'NOT-004', category: 'Other',     title: 'Lost property found at Admin Block',         body: 'A backpack was handed in. Collect from security office.',                time: '5 hours ago', read: true  },
  { id: 'NOT-005', category: 'Security',  title: 'Gate 2 temporarily closed for maintenance',  body: 'Use Gate 1 or Gate 3 as alternative entry/exit points.',                 time: '1 day ago',  read: true  },
];

// TODO: API → GET /incidents?userId=:id
export const mockMyIncidents = [
  {
    id: 'INC-2024-0187', category: 'Security', title: 'Broken fence near Engineering Block',
    submittedAt: '2024-07-10 14:32', anonymous: false, status: 'Resolved',
    description: 'The perimeter fence near the Engineering block has a large gap. Students taking shortcuts through it.',
    location: 'Engineering Block, Gate 3',
    timeline: [
      { status: 'Submitted',   time: '2024-07-10 14:32', note: 'Report received by security office.' },
      { status: 'In Progress', time: '2024-07-10 15:10', note: 'Security officer assigned. Inspection underway.' },
      { status: 'Resolved',    time: '2024-07-11 09:00', note: 'Fence repaired. Area secured.' },
    ],
  },
  {
    id: 'INC-2024-0201', category: 'Other', title: 'Broken streetlight on main walkway',
    submittedAt: '2024-07-14 20:05', anonymous: true, status: 'In Progress',
    description: 'The streetlight between Admin and Library blocks has been out for 3 nights. Safety concern at night.',
    location: 'Main Walkway',
    timeline: [
      { status: 'Submitted',   time: '2024-07-14 20:05', note: 'Report received.' },
      { status: 'In Progress', time: '2024-07-15 08:30', note: 'Maintenance team notified.' },
    ],
  },
  {
    id: 'INC-2024-0215', category: 'Fire', title: 'Smoke smell in Lab 3B',
    submittedAt: '2024-07-16 11:20', anonymous: false, status: 'Submitted',
    description: 'Strong smell of burning plastic coming from Lab 3B. No visible fire but students coughing.',
    location: 'Science Block, Lab 3B',
    timeline: [
      { status: 'Submitted', time: '2024-07-16 11:20', note: 'Report received. Awaiting assignment.' },
    ],
  },
];

// TODO: API → GET /incidents/recent?window=15m
export const mockRecentReports = [
  { id: 'INC-2024-0220', category: 'Fire',     description: 'There is smoke coming from Chem Lab B, smells like burning plastic', timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString() },
  { id: 'INC-2024-0221', category: 'Fire',     description: 'Smoke in Chem Lab B, strong burning smell, students evacuating',      timestamp: new Date(Date.now() - 7 * 60 * 1000).toISOString() },
  { id: 'INC-2024-0222', category: 'Security', description: 'Suspicious person near the library entrance, acting strange',          timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
];

// TODO: API → GET /alerts
export const mockAlerts = [
  { id: 'ALERT-001', title: 'Fire Alarm — Engineering Block', category: 'Fire', priority: 'Critical', message: 'Fire alarm activated in Engineering Block B. Evacuate immediately via emergency exits.', createdAt: '2025-07-11T09:30:00Z' },
  { id: 'ALERT-002', title: 'Missing Student Report',         category: 'Security', priority: 'High',     message: 'A student has been reported missing since yesterday evening. Contact security if seen.',   createdAt: '2025-07-10T18:00:00Z' },
  { id: 'ALERT-003', title: 'Increased Security Patrols',    category: 'Security', priority: 'Medium',   message: 'Security patrols have been increased around the campus perimeter this week.',          createdAt: '2025-07-09T08:00:00Z' },
  { id: 'ALERT-004', title: 'Clinic Hours Extended',          category: 'Ambulance', priority: 'Low',     message: 'The University Clinic will be open until 8 PM this week for student health services.',  createdAt: '2025-07-08T07:00:00Z' },
];

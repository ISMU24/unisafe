// PNGUOT (Papua New Guinea University of Technology) brand palette
// Sampled directly from the official UOT Logo 3:
//   dominant red: #A80808
//   gold/yellow:  #F8E808
//   deep maroon:  #680808

// ── Brand colors (fixed — never change with theme)
export const brand = {
  uotRed:        '#A80808',
  uotRedDark:    '#680808',
  uotRedLight:   '#D32F2F',
  uotGold:       '#F8E808',
  uotGoldDark:   '#C9BC08',
  uotGoldLight:  '#FFF9C4',
};

// ── Light theme
const light = {
  mode: 'light',
  ...brand,
  primary:       '#A80808',
  primaryDark:   '#680808',
  primaryLight:  '#D32F2F',
  accent:        '#F8E808',
  accentDark:    '#C9BC08',

  surface:       '#FAFAFA',
  surfaceCard:   '#FFFFFF',
  surfaceAlt:    '#F0F0F0',
  surfaceGold:   '#FFF9C4',
  border:        '#E5E5E5',
  borderGold:    '#F8E808',

  textPrimary:   '#1A1A1A',
  textSecondary: '#424242',
  textMuted:     '#9E9E9E',
  textOnRed:     '#FFFFFF',
  textOnGold:    '#1A1A1A',

  navy:          '#A80808',
  navyMid:       '#8B0606',
  navyLight:     '#C40808',

  security:      '#1565C0',
  fire:          '#D32F2F',
  ambulance:     '#2E7D32',
  other:         '#E65100',

  // Policies module: single neutral accent (steel/slate) — deliberately
  // distinct from the four incident-category colors above.
  policy:        '#455A64',
  policyBg:      '#ECEFF1',
  policyBorder:  '#B0BEC5',

  statusOpen:        '#D32F2F',
  statusInProgress:  '#E65100',
  statusResolved:    '#2E7D32',
  statusClosed:      '#9E9E9E',

  sos:          '#D32F2F',
  sosDark:      '#B71C1C',

  shadow:       '#000000',
  overlay:      'rgba(0,0,0,0.4)',
  modalScrim:   'rgba(168,8,8,0.4)',

  statusBar:    'dark-content',
};

// ── Dark theme
const dark = {
  mode: 'dark',
  ...brand,
  // Keep primary as UOT red so SOS/emergency/branding stay consistent
  primary:       '#D93030',     // slightly brighter red for dark backgrounds
  primaryDark:   '#A80808',
  primaryLight:  '#F05850',
  accent:        '#F8E808',     // gold accent stays
  accentDark:    '#C9BC08',

  surface:       '#0E0E0E',     // near-black background
  surfaceCard:   '#1C1C1C',     // dark card
  surfaceAlt:    '#252525',
  surfaceGold:   '#3A3306',     // dark gold-tinted for unread/special
  border:        '#2E2E2E',
  borderGold:    '#F8E808',

  textPrimary:   '#F5F5F5',
  textSecondary: '#CFCFCF',
  textMuted:     '#888888',
  textOnRed:     '#FFFFFF',
  textOnGold:    '#1A1A1A',

  navy:          '#D93030',
  navyMid:       '#A80808',
  navyLight:     '#F05850',

  security:      '#64B5F6',
  fire:          '#EF5350',
  ambulance:     '#66BB6A',
  other:         '#FFB74D',

  // Policies module — neutral slate, brighter on dark backgrounds.
  policy:        '#90A4AE',
  policyBg:      '#263238',
  policyBorder:  '#455A64',

  statusOpen:        '#EF5350',
  statusInProgress:  '#FFB74D',
  statusResolved:    '#66BB6A',
  statusClosed:      '#9E9E9E',

  sos:          '#EF5350',
  sosDark:      '#C62828',

  shadow:       '#000000',
  overlay:      'rgba(0,0,0,0.6)',
  modalScrim:   'rgba(0,0,0,0.75)',

  statusBar:    'light-content',
};

export const palettes = { light, dark };

// Backward-compat: default `colors` is the light theme (so existing
// `import { colors }` keeps working in non-themed modules).
export const colors = light;

export const radius = {
  sm: 6,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const fonts = {
  body:    'System',
  mono:    'Courier New',
  display: 'System',
};

export const categoryMeta = {
  Security:  { color: light.security,  icon: '🛡️', label: 'Security'  },
  Fire:      { color: light.fire,      icon: '🔥', label: 'Fire'      },
  Ambulance: { color: light.ambulance, icon: '🚑', label: 'Ambulance' },
  Other:     { color: light.other,     icon: '📋', label: 'Other'     },
};

export const STATUS_META = {
  Submitted:   { color: light.statusOpen,       icon: '🔴', label: 'Submitted'   },
  'Under Review': { color: light.statusInProgress, icon: '🟡', label: 'Under Review' },
  'In Progress':  { color: light.statusInProgress, icon: '🟡', label: 'In Progress'  },
  'Decision Issued': { color: light.statusResolved, icon: '🟢', label: 'Decision Issued' },
  Resolved:    { color: light.statusResolved,   icon: '🟢', label: 'Resolved'    },
  Closed:      { color: light.statusClosed,     icon: '⚪', label: 'Closed'      },
  Open:        { color: light.statusOpen,       icon: '🔴', label: 'Open'        },
};

export const PRIORITY_META = {
  Critical: { color: light.sos,          bg: '#FFEBEE', border: '#FFCDD2', icon: '🔴' },
  High:     { color: light.statusOpen,   bg: '#FFF3E0', border: '#FFE0B2', icon: '🟠' },
  Medium:   { color: light.other,        bg: '#FFFDE7', border: '#FFF59D', icon: '🟡' },
  Low:      { color: light.statusResolved, bg: '#E8F5E9', border: '#C8E6C9', icon: '🟢' },
};

// Policies module — fixed category taxonomy. Add new policies by creating
// a PDF in /Assets/Policies/<CategoryFolder>/ and appending an entry here.
export const POLICY_CATEGORIES = [
  {
    id: 'university',
    label: 'University Policies',
    icon: '🏛️',
    folder: 'University-Policies',
    desc: 'Act, statutes and core institutional policies.',
    appealsHint: null,
  },
  {
    id: 'board',
    label: 'Board Policies',
    icon: '👥',
    folder: 'Board-Policies',
    desc: 'Union Board and Student Representative Council constitutions.',
    appealsHint: null,
  },
  {
    id: 'academic',
    label: 'Academic Policies',
    icon: '🎓',
    folder: 'Academic-Policies',
    desc: 'AI use, academic integrity, calendars and certification.',
    appealsHint: 'grade',
  },
  {
    id: 'student',
    label: 'Student Policies',
    icon: '🧑\u200d🎓',
    folder: 'Student-Policies',
    desc: 'Admission, rules, fees and refunds.',
    appealsHint: 'fees',
  },
  {
    id: 'research',
    label: 'Research Policies',
    icon: '🔬',
    folder: 'Research-Policies',
    desc: 'Research management and conference guidelines.',
    appealsHint: null,
  },
  {
    id: 'ict',
    label: 'ICT Policies',
    icon: '💻',
    folder: 'ICT-Policies',
    desc: 'Acceptable use, internet and IT governance.',
    appealsHint: 'disciplinary',
  },
  {
    id: 'hr',
    label: 'HR Policies',
    icon: '🤝',
    folder: 'HR-Policies',
    desc: 'Gender equity, disability and social inclusion.',
    appealsHint: null,
  },
];

export const APPEAL_CATEGORIES = [
  { id: 'Academic',     label: 'Academic',     icon: '🎓', color: '#1565C0' },
  { id: 'Disciplinary', label: 'Disciplinary', icon: '⚖️', color: '#E65100' },
  { id: 'Fees',         label: 'Fees',         icon: '💵', color: '#2E7D32' },
  { id: 'Other',        label: 'Other',        icon: '📋', color: '#9E9E9E' },
];

export const APPEAL_STATUS_META = {
  Submitted:      { icon: '🔴', label: 'Submitted'      },
  'Under Review': { icon: '🟡', label: 'Under Review'   },
  'Decision Issued': { icon: '🟢', label: 'Decision Issued' },
};

// Map an appeal category to the policy folders most likely to govern it,
// used by the "How to Appeal" flow to surface relevant policies first.
export const APPEAL_POLICY_HINTS = {
  grade:          ['Academic-Policies', 'Student-Policies'],
  academic:       ['Academic-Policies', 'Student-Policies'],
  fees:           ['Student-Policies'],
  fee:            ['Student-Policies'],
  disciplinary:   ['Student-Policies', 'ICT-Policies'],
  other:          ['Student-Policies'],
};


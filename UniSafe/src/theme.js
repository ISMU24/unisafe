// Shared UniSafe design tokens. Keep incident accents restrained and reserve
// emergency red for SOS, urgent states, and errors.
export const brand = {
  uotRed:        '#142D4E',
  uotRedDark:    '#0E223C',
  uotRedLight:   '#344E6C',
  uotGold:       '#344E6C',
  uotGoldDark:   '#263B56',
  uotGoldLight:  '#E9EEF4',
};

const light = {
  mode: 'light',
  ...brand,
  primary:       '#142D4E',
  primaryDark:   '#0E223C',
  primaryLight:  '#344E6C',
  accent:        '#344E6C',
  accentDark:    '#263B56',

  surface:       '#F5F7FA',
  surfaceCard:   '#FFFFFF',
  surfaceAlt:    '#F5F7FA',
  surfaceGold:   '#E9EEF4',
  border:        '#E2E8F0',
  borderGold:    '#CBD5E1',

  textPrimary:   '#172B4D',
  textSecondary: '#64748B',
  textMuted:     '#64748B',
  textOnRed:     '#FFFFFF',
  textOnGold:    '#FFFFFF',

  navy:          '#142D4E',
  navyMid:       '#263B56',
  navyLight:     '#344E6C',

  security:      '#344E6C',
  fire:          '#C2410C',
  ambulance:     '#15803D',
  other:         '#7C3AED',

  policy:        '#344E6C',
  policyBg:      '#EEF2F6',
  policyBorder:  '#CBD5E1',

  statusOpen:        '#B91C1C',
  statusInProgress:  '#C2410C',
  statusResolved:    '#15803D',
  statusClosed:      '#64748B',

  sos:          '#B91C1C',
  sosDark:      '#991B1B',

  shadow:       '#000000',
  overlay:      'rgba(0,0,0,0.4)',
  modalScrim:   'rgba(20,45,78,0.42)',
  inputBackground: '#FFFFFF',
  inputBorder: '#E2E8F0',
  disabled: '#CBD5E1',

  statusBar:    'dark-content',
};

const dark = {
  mode: 'dark',
  ...brand,
  primary:       '#9CB4D0',
  primaryDark:   '#142D4E',
  primaryLight:  '#B8C9DD',
  accent:        '#9CB4D0',
  accentDark:    '#7189A5',

  surface:       '#111A27',
  surfaceCard:   '#1B2736',
  surfaceAlt:    '#233143',
  surfaceGold:   '#26364A',
  border:        '#34465B',
  borderGold:    '#52657C',

  textPrimary:   '#F1F5F9',
  textSecondary: '#C1CCDA',
  textMuted:     '#A3B1C2',
  textOnRed:     '#FFFFFF',
  textOnGold:    '#102033',

  navy:          '#9CB4D0',
  navyMid:       '#7189A5',
  navyLight:     '#B8C9DD',

  security:      '#9CB4D0',
  fire:          '#FB923C',
  ambulance:     '#4ADE80',
  other:         '#C4B5FD',

  policy:        '#9CB4D0',
  policyBg:      '#233143',
  policyBorder:  '#52657C',

  statusOpen:        '#F87171',
  statusInProgress:  '#FB923C',
  statusResolved:    '#4ADE80',
  statusClosed:      '#A3B1C2',

  sos:          '#F87171',
  sosDark:      '#B91C1C',

  shadow:       '#000000',
  overlay:      'rgba(0,0,0,0.6)',
  modalScrim:   'rgba(0,0,0,0.75)',
  inputBackground: '#1B2736',
  inputBorder: '#34465B',
  disabled: '#52657C',

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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  section: 28,
};

export const typography = {
  screenTitle: 24,
  sectionTitle: 17,
  label: 14,
  body: 15,
  supporting: 12,
};

export const shadows = {
  card: {
    shadowColor: '#142D4E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
};

export const controls = {
  input: { minHeight: 50, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md },
  primaryButton: { minHeight: 50, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  secondaryButton: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.lg },
};

export const fonts = {
  body:    'System',
  mono:    'Courier New',
  display: 'System',
};

export const categoryMeta = {
  Security:  { color: light.security,  icon: 'security', label: 'Security'  },
  Fire:      { color: light.fire,      icon: 'local-fire-department', label: 'Fire'      },
  Ambulance: { color: light.ambulance, icon: 'medical-services', label: 'Ambulance' },
  Other:     { color: light.other,     icon: 'report-problem', label: 'Other'     },
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
    icon: 'account-balance',
    folder: 'University-Policies',
    desc: 'Act, statutes and core institutional policies.',
    appealsHint: null,
  },
  {
    id: 'board',
    label: 'Board Policies',
    icon: 'groups',
    folder: 'Board-Policies',
    desc: 'Union Board and Student Representative Council constitutions.',
    appealsHint: null,
  },
  {
    id: 'academic',
    label: 'Academic Policies',
    icon: 'school',
    folder: 'Academic-Policies',
    desc: 'AI use, academic integrity, calendars and certification.',
    appealsHint: 'grade',
  },
  {
    id: 'student',
    label: 'Student Policies',
    icon: 'people',
    folder: 'Student-Policies',
    desc: 'Admission, rules, fees and refunds.',
    appealsHint: 'fees',
  },
  {
    id: 'research',
    label: 'Research Policies',
    icon: 'science',
    folder: 'Research-Policies',
    desc: 'Research management and conference guidelines.',
    appealsHint: null,
  },
  {
    id: 'ict',
    label: 'ICT Policies',
    icon: 'computer',
    folder: 'ICT-Policies',
    desc: 'Acceptable use, internet and IT governance.',
    appealsHint: 'disciplinary',
  },
  {
    id: 'hr',
    label: 'HR Policies',
    icon: 'handshake',
    folder: 'HR-Policies',
    desc: 'Gender equity, disability and social inclusion.',
    appealsHint: null,
  },
];

export const APPEAL_CATEGORIES = [
  { id: 'Academic',     label: 'Academic',     icon: 'school', color: '#344E6C' },
  { id: 'Disciplinary', label: 'Disciplinary', icon: 'gavel', color: '#C2410C' },
  { id: 'Fees',         label: 'Fees',         icon: 'payments', color: '#15803D' },
  { id: 'Other',        label: 'Other',        icon: 'description', color: '#64748B' },
];

export const APPEAL_STATUS_META = {
  Submitted:      { icon: 'error-outline', label: 'Submitted'      },
  'Under Review': { icon: 'manage-search', label: 'Under Review'   },
  'Decision Issued': { icon: 'check-circle', label: 'Decision Issued' },
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

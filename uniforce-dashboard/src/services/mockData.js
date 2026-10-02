import { Shield, Flame, Siren, HelpCircle } from "lucide-react";

export const ink = "#0B1F33";
export const paper = "#F4F5F2";
export const card = "#FFFFFF";
export const red = "#C13B2E";
export const amber = "#C97F1E";
export const teal = "#1F7A5C";
export const blue = "#2A5DA8";
export const line = "#E4E4DF";
export const textSub = "#6B7280";

export const CATEGORY = {
  Security: { icon: Shield, color: blue, bg: "#E7EFFA" },
  Fire: { icon: Flame, color: red, bg: "#FBEAE7" },
  Ambulance: { icon: Siren, color: teal, bg: "#E4F2EC" },
  Other: { icon: HelpCircle, color: amber, bg: "#FBF0DF" },
};

// Must match backend incident_status CHECK constraint exactly
export const STAGES = ["Submitted", "Received", "Under Review", "Assigned", "Responding", "Resolved", "Closed", "Cancelled"];

// Demo incidents, used only by the AI Tools sandbox page. Real dashboards
// read exclusively from the Express API (see src/api.js).
export function seedIncidents() {
  return [
    { id: "INC-4471", type: "Security", desc: "Suspicious person near Female Dormitories", reporter: "I. Muge (23201047)", status: "Assigned", time: "08:12", loc: "Female Dormitories, Taraka", assignee: "Officer T. Kaupa" },
    { id: "SOS-7702", type: "Ambulance", desc: "Emergency SOS — student collapsed at Sporting Facilities", reporter: "R. Waigani (23198812)", status: "Acknowledged", time: "08:04", loc: "Sporting Facilities", assignee: "—" },
    { id: "INC-4468", type: "Other", desc: "Broken perimeter light, Male Dormitories walkway", reporter: "Anonymous", status: "Submitted", time: "07:51", loc: "Male Dormitories", assignee: "—" },
    { id: "INC-4463", type: "Fire", desc: "Smoke reported in School of Science Lab", reporter: "S. Namaliu (staff)", status: "Resolved", time: "Yesterday", loc: "School of Science", assignee: "Officer P. Are" },
    { id: "INC-4459", type: "Ambulance", desc: "Student fainted at Sporting Facilities", reporter: "K. Tolo (23205511)", status: "Resolved", time: "Mon", loc: "Sporting Facilities", assignee: "Officer M. Sogeri" },
    { id: "INC-4451", type: "Security", desc: "Unauthorised vehicle near Administration Block", reporter: "Anonymous", status: "Resolved", time: "Mon", loc: "Administration Block", assignee: "Officer T. Kaupa" },
  ];
}

export const PERSONNEL = [
  { name: "Officer N. Pomio", role: "Field Responder", status: "On duty", cases: 2 },
  { name: "Officer W. Raka", role: "Field Responder", status: "On duty", cases: 1 },
  { name: "Officer N. Norihiko", role: "Field Responder", status: "On call", cases: 0 },
  { name: "Officer G. Tawe", role: "Field Responder", status: "Off duty", cases: 0 },
  { name: "Sgt. J. Tewi", role: "Shift Supervisor", status: "On duty", cases: 4 },
];

// PNGUoT Taraka Campus — East Taraka, Lae, Morobe Province, PNG
// Campus centre ≈ 6°40'12"S 146°59'42"E (per Wikipedia / Wikimapia).
// Buildings below are real Unitech facilities (from the official site, Campus
// Masterplan by Atlas Urban, and the 2025 campus sitemap). Coordinates are
// offset realistically around the campus centre to reflect the actual layout.
export const CAMPUS_CENTRE = [-6.6700, 146.9950]

export const CAMPUS_BUILDINGS = [
  // ── Academic core (fronting the main avenue, near the Library / Kofi Haus) ──
  { id: 'LIB',     name: 'Library',                    category: 'Academic',  position: [-6.6702, 146.9945] },
  { id: 'KOFI',    name: 'Kofi Haus (Kopi Haus)',      category: 'Social',   position: [-6.6700, 146.9940] },
  { id: 'DINE',    name: 'Dining Hall',                category: 'Social',   position: [-6.6704, 146.9938] },
  { id: 'CTF',     name: 'Central Teaching Facilities', category: 'Academic', position: [-6.6710, 146.9948] },
  { id: 'GREAT',   name: 'Great Hall',                 category: 'Social',   position: [-6.6714, 146.9952] },

  // ── Schools & departments ──
  { id: 'ENG',     name: 'School of Engineering',      category: 'Academic', position: [-6.6688, 146.9960] },
  { id: 'SCI',     name: 'School of Science',          category: 'Academic', position: [-6.6692, 146.9975] },
  { id: 'AGRI',    name: 'School of Agriculture',      category: 'Academic', position: [-6.6720, 146.9930] },
  { id: 'BUS',     name: 'School of Business Studies', category: 'Academic', position: [-6.6700, 146.9970] },
  { id: 'ADMIN',   name: 'Administration Block',       category: 'Admin',    position: [-6.6700, 146.9942] },
  { id: 'IT',      name: 'School of IT & Computing',   category: 'Academic', position: [-6.6696, 146.9958] },

  // ── Health & welfare ──
  { id: 'HEALTH',  name: 'University Health Centre',    category: 'Health',   position: [-6.6725, 146.9955] },
  { id: 'CHAP',    name: 'Chapel',                     category: 'Social',   position: [-6.6718, 146.9948] },
  { id: 'SPORT',   name: 'Sporting Facilities',        category: 'Sport',    position: [-6.6735, 146.9970] },

  // ── Student accommodation ──
  { id: 'FEM-DORM', name: 'Female Dormitories',        category: 'Residential', position: [-6.6740, 146.9920] },
  { id: 'M-DORM',   name: 'Male Dormitories',          category: 'Residential', position: [-6.6745, 146.9935] },
  { id: 'OKARI',    name: 'Okari Campus (Buimo Rd)',   category: 'Residential', position: [-6.6800, 146.9880] },
  { id: 'SQUAT',    name: 'Squatter Settlement',       category: 'Residential', position: [-6.6730, 146.9910] },

  // ── Commercial / services ──
  { id: 'ATM',      name: 'ATMs (BSP / KinaBank)',     category: 'Service',  position: [-6.6700, 146.9939] },
  { id: 'BULO',     name: 'Bulolo Forestry College',    category: 'Academic', position: [-6.6660, 147.0020] },
  { id: 'BUMB',     name: 'Bumbu Campus (Forestry)',    category: 'Academic', position: [-6.6900, 147.0100] },
];

export const MAP_MARKERS = CAMPUS_BUILDINGS.map(b => ({
  position: b.position,
  title: b.id,
  description: `${b.name} (${b.category})`,
  category: b.category,
}))

// Resolve a human-readable incident location string to a campus building
// position, so the map can place the incident circle at the real building.
export function buildingForLocation(loc) {
  if (!loc) return null
  const l = String(loc).toLowerCase()
  const byName = CAMPUS_BUILDINGS.find(b => l.includes(b.name.toLowerCase()))
  if (byName) return byName
  const aliases = {
    'female dorm': 'FEM-DORM', 'female dormitories': 'FEM-DORM',
    'male dorm': 'M-DORM', 'male dormitories': 'M-DORM',
    'dorm': 'FEM-DORM', 'hostel': 'FEM-DORM',
    'library': 'LIB', 'kofi': 'KOFI', 'kopi': 'KOFI', 'dining': 'DINE',
    'dining hall': 'DINE', 'ctf': 'CTF', 'teaching': 'CTF',
    'great hall': 'GREAT', 'engineering': 'ENG', 'science': 'SCI',
    'agriculture': 'AGRI', 'business': 'BUS', 'admin': 'ADMIN',
    'administration': 'ADMIN', 'it ': 'IT', 'computing': 'IT',
    'health centre': 'HEALTH', 'health': 'HEALTH', 'clinic': 'HEALTH',
    'chapel': 'CHAP', 'sport': 'SPORT', 'sports': 'SPORT',
    'okari': 'OKARI', 'squatter': 'SQUAT', 'atm': 'ATM',
    'bulolo': 'BULO', 'bumbu': 'BUMB',
  }
  for (const [key, id] of Object.entries(aliases)) {
    if (l.includes(key)) return CAMPUS_BUILDINGS.find(b => b.id === id)
  }
  return null
}

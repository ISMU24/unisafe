// =============================================================
// USERS — UniSafe
// This is the canonical user store for prototype/demo.
// Add new users here in the same shape.
// When a real backend is ready, replace with API calls.
// =============================================================

export const USERS = [
  {
    username: 'Israel Muge',
    email: '23201047ismu@student.pnguot.ac.pg',
    password: '0001ismu',
    fullName: 'Israel Muge',
    role: 'student',
    universityId: '23201047',
  },
  {
    username: 'Lamech Vele',
    email: '23201112lave@student.pnguot.ac.pg',
    password: '0002lave',
    fullName: 'Lamech Vele',
    role: 'student',
    universityId: '23201112',
  },
  {
    username: 'Victor Seng',
    email: '23200693vise@student.pnguot.ac.pg',
    password: '0003vise',
    fullName: 'Victor Seng',
    role: 'student',
    universityId: '23200693',
  },
  {
    username: 'Kriezchel Dokta',
    email: '22200177krdo@student.pnguot.ac.pg',
    password: '0004krdo',
    fullName: 'Kriezchel Dokta',
    role: 'student',
    universityId: '22200177',
  },
  {
    username: 'El Shammah Eka',
    email: '22200204elek@student.pnguot.ac.pg',
    password: '0005elek',
    fullName: 'El Shammah Eka',
    role: 'student',
    universityId: '22200204',
  },
  {
    username: 'Shantelle Yapo',
    email: '24201467shya@student.pnguot.ac.pg',
    password: '0006shya',
    fullName: 'Shantelle Yapo',
    role: 'student',
    universityId: '24201467',
  },
  {
    username: 'Steven Namaliu',
    email: 'snamaliu@pnguot.ac.pg',
    password: 'staff001',
    fullName: 'Steven Namaliu',
    role: 'staff',
    universityId: 'STF-0219',
  },
  {
    username: 'Admin',
    email: 'admin@pnguot.ac.pg',
    password: 'admin001',
    fullName: 'Security Admin',
    role: 'admin',
    universityId: 'ADM-0001',
  },
];

export function findUser(identifier, password) {
  const id = (identifier || '').trim().toLowerCase();
  const pw = (password || '').trim();
  return USERS.find(u =>
    (u.email.toLowerCase() === id || u.username.toLowerCase() === id || u.universityId === id) &&
    u.password === pw
  ) || null;
}

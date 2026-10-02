const RULES = [
  { keywords: ['fire','flame','smoke','burning','blaze','gas leak','explosion'],                          category: 'Fire',      urgency: 'Critical', weight: 10 },
  { keywords: ['unconscious','not breathing','heart attack','seizure','collapsed','overdose','bleeding'], category: 'Ambulance', urgency: 'Critical', weight: 10 },
  { keywords: ['injured','hurt','wound','fell','accident','medical','ambulance','faint','dizzy'],         category: 'Ambulance', urgency: 'High',     weight: 7  },
  { keywords: ['assault','attack','fight','weapon','knife','gun','threat','robbery','harass'],            category: 'Security',  urgency: 'Critical', weight: 10 },
  { keywords: ['suspicious','intruder','break in','trespassing','stalking','following'],                 category: 'Security',  urgency: 'High',     weight: 7  },
  { keywords: ['theft','stolen','missing','vandal','graffiti','damage'],                                 category: 'Security',  urgency: 'Medium',   weight: 5  },
  { keywords: ['noise','loud','disturbance','drunk','argument','dispute'],                               category: 'Other',     urgency: 'Low',      weight: 3  },
  { keywords: ['broken','maintenance','leak','flood','power','electricity','light'],                     category: 'Other',     urgency: 'Low',      weight: 2  },
];

const URGENCY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

export function triageDescription(description) {
  if (!description || description.trim().length < 8) return null;
  const lower = description.toLowerCase();
  const scores = {};
  for (const rule of RULES) {
    if (!rule.keywords.some(kw => lower.includes(kw))) continue;
    if (!scores[rule.category]) scores[rule.category] = { weight: 0, urgency: rule.urgency };
    scores[rule.category].weight += rule.weight;
    const cur = URGENCY_ORDER.indexOf(scores[rule.category].urgency);
    const inc = URGENCY_ORDER.indexOf(rule.urgency);
    if (inc < cur) scores[rule.category].urgency = rule.urgency;
  }
  if (!Object.keys(scores).length) return null;
  const [category, { urgency, weight }] = Object.entries(scores).sort((a, b) => b[1].weight - a[1].weight)[0];
  return { category, urgency, confidence: Math.min(95, Math.round((weight / 10) * 70 + 25)) };
}

export const URGENCY_META = {
  Critical: { color: '#dc2626', bg: '#fef2f2', border: '#fca5a5', icon: '🔴' },
  High:     { color: '#d97706', bg: '#fffbeb', border: '#fde68a', icon: '🟠' },
  Medium:   { color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: '🟡' },
  Low:      { color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', icon: '🟢' },
};

import { Match } from './models.js';
// Elo (K=24) + rolling form + venue records. Fetches only the needed fields and sorts in JS,
// because sorting full match documents inside MongoDB can exceed its 32 MB sort limit. Cached 5 min.
let cache = { at: 0, data: null };
export async function ratingsFromMatches(K = 24) {
  if (cache.data && Date.now() - cache.at < 300000) return cache.data;
  const ms = (await Match.find({ status: { $nin: ['live', 'upcoming'] } }, 'date teamA teamB winner venue').lean())
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const r = {}, hist = {}, venue = {};
  for (const m of ms) {
    if (!m.teamA || !m.teamB) continue;
    const a = (r[m.teamA] ??= 1500), b = (r[m.teamB] ??= 1500);
    if (!m.winner) continue;
    const ea = 1 / (1 + 10 ** ((b - a) / 400)), sa = m.winner === m.teamA ? 1 : 0;
    r[m.teamA] = a + K * (sa - ea); r[m.teamB] = b + K * (1 - sa - (1 - ea));
    for (const [t, w] of [[m.teamA, sa], [m.teamB, 1 - sa]]) {
      (hist[t] ??= []).push(w);
      const v = ((venue[t] ??= {})[m.venue ?? '?'] ??= { p: 0, w: 0 }); v.p++; v.w += w;
    }
  }
  const form = Object.fromEntries(Object.entries(hist).map(([t, h]) => { const l = h.slice(-5); return [t, l.reduce((s, x) => s + x, 0) / l.length - 0.5]; }));
  cache = { at: Date.now(), data: { ratings: r, form, venue } };
  return cache.data;
}
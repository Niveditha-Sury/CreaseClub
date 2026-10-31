import { Router } from 'express';
import { Player } from './models.js';
import { predict, recommendXI } from './predictor.js';
import { ratingsFromMatches } from './elo.js';
export const extra = Router();
const wrap = f => (q, r) => f(q, r).catch(e => { console.error(e); r.status(500).json({ error: e.message }); });
const kind = role => (/spin|orthodox|break|wrist|googly/i.test(role) ? 'Spin' : /fast|medium|pace|seam/i.test(role) ? 'Pace' : 'Bat');

extra.get('/api/ratings', wrap(async (_q, r) => { const { ratings, form } = await ratingsFromMatches(); r.json({ ratings, form }); }));

const matchup = async (a, b, toss) => {
  const { ratings, form } = await ratingsFromMatches();
  const p = predict({ ratingA: ratings[a] ?? 1500, ratingB: ratings[b] ?? 1500, formA: form[a] ?? 0, formB: form[b] ?? 0,
    tossWonByA: toss ? toss === a : null, venueBiasA: 0 });
  return { ...p, ratings: { [a]: Math.round(ratings[a] ?? 1500), [b]: Math.round(ratings[b] ?? 1500) } };
};
extra.get('/api/predict', wrap(async (q, r) => {
  const { a, b, toss } = q.query;
  if (!a || !b || a === b) return r.status(400).json({ error: 'Pick two different teams' });
  r.json(await matchup(a, b, toss));
}));
extra.post('/api/predict/matchup', wrap(async (q, r) => {
  const { a, b, tossWinner } = q.body || {};
  if (!a || !b || a === b) return r.status(400).json({ error: 'Pick two different teams' });
  r.json(await matchup(a, b, tossWinner));
}));

extra.get('/api/recommend-xi/:team', wrap(async (q, r) => {
  const ps = (await Player.find({ team: q.params.team }).lean()).map(p => ({ ...p, kind: kind(p.role) }));
  r.json(recommendXI(ps, q.query.pitch));
}));
extra.get('/api/matchup/:batter/:bowler', wrap(async (_q, r) =>
  r.json({ available: false, note: 'Batter-vs-bowler records are not built yet.' })));

extra.get('/api/players/:id/badges', wrap(async (q, r) => {
  const p = await Player.findById(q.params.id).lean(); const b = [];
  if (p.recent.some(x => x >= 90 && x < 100)) b.push('Nervous Nineties');
  if (p.impact >= 85) b.push('Match Winner');
  if (p.recent.filter(x => x >= 50).length >= 3) b.push('Purple Patch');
  r.json(b);
}));
import 'dotenv/config'; import mongoose from 'mongoose'; import { Match } from '../models.js';
await mongoose.connect(process.env.MONGO_URI);
const sma = await Match.find({ event: /syed mushtaq/i }, 'season date stage winner teamA teamB event').lean();
console.log(`SMAT matches in the database: ${sma.length}`);
const by = {};
sma.forEach(m => { const s = (by[m.season] ??= { matches: 0, lastMatch: '' }); s.matches++; if (m.date > s.lastMatch) s.lastMatch = m.date; });
console.table(Object.entries(by).sort().map(([season, v]) => ({ season, ...v })));
console.log('Event names seen:', [...new Set(sma.map(m => m.event))]);
console.log('Matches labelled "Final":');
console.table(sma.filter(m => /final/i.test(m.stage || '')).sort((a, b) => (a.date < b.date ? -1 : 1))
  .map(m => ({ season: m.season, date: m.date, stage: m.stage, match: `${m.teamA} v ${m.teamB}`, winner: m.winner })));
process.exit();
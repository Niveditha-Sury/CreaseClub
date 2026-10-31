import 'dotenv/config'; import mongoose from 'mongoose'; import { Match, Player } from '../models.js';
await mongoose.connect(process.env.MONGO_URI);
const rows = await Match.aggregate([
  { $group: { _id: { league: '$league', format: '$format', source: '$source' }, count: { $sum: 1 }, from: { $min: '$date' }, to: { $max: '$date' } } }, { $sort: { '_id.league': 1 } }]);
console.log('Matches by league / format / source:'); console.table(rows.map(r => ({ ...r._id, count: r.count, from: r.from, to: r.to })));
const all = await Match.find({}, 'date teamA teamB league format source').lean(), seen = {};
for (const m of all) (seen[`${m.date}|${[m.teamA, m.teamB].sort().join('v')}|${m.format || ''}`] ??= []).push(m);
const dups = Object.values(seen).filter(a => a.length > 1);
console.log(`Possible duplicate matches: ${dups.length}`);
dups.slice(0, 5).forEach(a => console.log(' ', a[0].date, a[0].teamA, 'v', a[0].teamB, '->', a.map(m => `${m.league}/${m.source ?? 'legacy'}`).join(' & ')));
console.log('Matches without a key (legacy):', await Match.countDocuments({ key: { $exists: false } }));
console.log('Players:', await Player.countDocuments(), '| with India stats:', await Player.countDocuments({ national: { $exists: true } }));
process.exit();
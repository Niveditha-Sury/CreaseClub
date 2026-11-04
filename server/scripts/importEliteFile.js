// Usage: npm run import:elite -- path/to/recentmatches.json
import 'dotenv/config'; import fs from 'fs'; import mongoose from 'mongoose';
import { findMatches, mapMatch } from '../services/elite.js'; import { store } from '../services/live.js';
const file = process.argv[2];
if (!file) { console.error('Usage: npm run import:elite -- path/to/recentmatches.json'); process.exit(1); }
await mongoose.connect(process.env.MONGO_URI);
const items = findMatches(JSON.parse(fs.readFileSync(file, 'utf8'))).map(o => mapMatch(o, 'finished')).filter(Boolean);
const r = await store(items, { trusted: true });
console.log(`${items.length} usable matches in the file, ${r.saved} saved. The rest were skipped: unknown result, leagues not covered, or already in the dataset.`);
process.exit();
import 'dotenv/config'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import mongoose from 'mongoose';
import { eliteGet, findMatches, mapMatch } from '../services/elite.js';
await mongoose.connect(process.env.MONGO_URI);
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../samples'); fs.mkdirSync(dir, { recursive: true });
for (const [ep, st] of [['getRecentMatches', 'finished'], ['getUpcomingMatches', 'upcoming'], ['getLiveMatches', 'live']]) {
  try {
    const j = await eliteGet(ep, {}, { force: true }); fs.writeFileSync(path.join(dir, `${ep}.json`), JSON.stringify(j, null, 2));
    const ms = findMatches(j); console.log(`\n${ep}: top-level keys [${Object.keys(j ?? {}).join(', ')}], ${ms.length} matches detected`);
    console.log(ms[0] ? `  first mapped: ${JSON.stringify(mapMatch(ms[0], st))}` : `  mapper found nothing. Open server/samples/${ep}.json and send me one match object.`);
  } catch (e) { console.log(`\n${ep}: ${e.message}`); }
}
process.exit();
import 'dotenv/config'; import mongoose from 'mongoose'; import { Match } from '../models.js';
await mongoose.connect(process.env.MONGO_URI);
const r = await Match.deleteMany({ source: 'live' });
console.log(`Removed ${r.deletedCount} live-sourced matches. Restart the server to refill them.`);
process.exit();
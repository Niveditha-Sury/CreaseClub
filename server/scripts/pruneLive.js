import 'dotenv/config'; import mongoose from 'mongoose'; import { Match } from '../models.js';
await mongoose.connect(process.env.MONGO_URI);
const r = await Match.deleteMany({ source: 'live', league: { $nin: ['IPL', 'WPL', 'International', 'Domestic'] } });
console.log(`Removed ${r.deletedCount} live-sourced matches outside IPL, WPL, India internationals and Indian domestic.`); process.exit();
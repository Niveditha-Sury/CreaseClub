import 'dotenv/config'; import mongoose from 'mongoose'; import { syncElite } from '../services/live.js';
await mongoose.connect(process.env.MONGO_URI);
console.log(await syncElite(process.argv[2]));
process.exit();
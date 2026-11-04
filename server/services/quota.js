import { ApiUsage } from '../models.js';
const day = () => new Date().toISOString().slice(0, 10);
const LIMITS = { cricketdata: { daily: 90 }, elite: { daily: +process.env.ELITE_DAILY || 12, total: +process.env.ELITE_TOTAL || 500, reserve: 20 } };
export const spentToday = async p => (await ApiUsage.findOne({ provider: p, day: day() }))?.count ?? 0;
export const spentTotal = async p => (await ApiUsage.aggregate([{ $match: { provider: p } }, { $group: { _id: null, n: { $sum: '$count' } } }]))[0]?.n ?? 0;
export async function canSpend(p, n = 1, cap, ignoreDaily = false) {
  const L = LIMITS[p]; if (!L) return true;
  if (!ignoreDaily && (await spentToday(p)) + n > (cap ?? L.daily)) return false;
  if (L.total && (await spentTotal(p)) + n > L.total - L.reserve) return false;
  return true;
}
export const record = (p, n = 1) => ApiUsage.updateOne({ provider: p, day: day() }, { $inc: { count: n } }, { upsert: true });
export async function status() {
  return { cricketdata: { today: await spentToday('cricketdata'), dailyCap: LIMITS.cricketdata.daily },
    elite: { today: await spentToday('elite'), dailyCap: LIMITS.elite.daily, total: await spentTotal('elite'), totalCap: LIMITS.elite.total } };
}
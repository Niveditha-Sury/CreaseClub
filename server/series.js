// Domestic tournament catalogue. A match belongs to a series when its `event` text matches all of `all` and none of `none`.
const G = { red: '🔴 Red-Ball / First-Class', odi: '⚪ 50-Over / One Day (List A)', t20: '⚡ 20-Over / T20' };
export const SERIES = [
  { id: 'ranji', group: G.red, label: "Ranji Trophy (Men's)", all: [/ranji/i] },
  { id: 'duleep', group: G.red, label: "Duleep Trophy (Men's)", all: [/duleep/i] },
  { id: 'irani', group: G.red, label: "Irani Cup (Men's)", all: [/irani/i] },
  { id: 'w-multi', group: G.red, label: "Senior Women's Multi-Day Trophy", all: [/women/i, /multi|4.?day|three.?day/i] },
  { id: 'vhr', group: G.odi, label: "Vijay Hazare Trophy (Men's)", all: [/vijay hazare/i] },
  { id: 'deodhar', group: G.odi, label: "Deodhar Trophy (Men's)", all: [/deodhar/i] },
  { id: 'w-odi', group: G.odi, label: "Senior Women's One Day Trophy", all: [/women/i, /one.?day|50.?over/i], none: [/zon/i] },
  { id: 'w-odi-zonal', group: G.odi, label: "Senior Women's Inter-Zonal One Day Trophy", all: [/women/i, /zon/i, /one.?day|50.?over/i] },
  { id: 'smat', group: G.t20, label: "Syed Mushtaq Ali Trophy (Men's)", all: [/syed mushtaq/i] },
  { id: 'w-t20', group: G.t20, label: "Senior Women's T20 Trophy", all: [/women/i, /t20|twenty/i], none: [/zon/i] },
  { id: 'w-t20-zonal', group: G.t20, label: "Senior Women's Inter-Zonal T20 Trophy", all: [/women/i, /zon/i, /t20|twenty/i] },
  { id: 'ipl', group: G.t20, label: 'Indian Premier League (IPL)', all: [/indian premier league/i], league: 'IPL' },
  { id: 'wpl', group: G.t20, label: "Women's Premier League (WPL)", all: [/women'?s premier league/i], league: 'WPL' },
];
export const eventQuery = s => ({ $and: [...s.all.map(re => ({ event: { $regex: re } })), ...(s.none || []).map(re => ({ event: { $not: re } }))] });
export const seriesQuery = s => (s.league ? { $or: [{ league: s.league }, eventQuery(s)] } : eventQuery(s));
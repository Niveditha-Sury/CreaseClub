// Logistic win-probability: rating gap + form + toss + venue bias.
const sig = x => 1 / (1 + Math.exp(-x));
export function predict({ ratingA, ratingB, formA = 0, formB = 0, tossWonByA = null, venueBiasA = 0 }) {
  const z = (ratingA - ratingB) / 400 * 1.6 + (formA - formB) * 0.5
          + (tossWonByA === null ? 0 : tossWonByA ? 0.12 : -0.12) + venueBiasA * 0.3;
  const pA = sig(z);
  return { pA: +pA.toFixed(3), pB: +(1 - pA).toFixed(3), confidence: Math.abs(pA - 0.5) > 0.2 ? 'high' : 'coin-flip' };
}
export function recommendXI(players, pitch) {
  const w = pitch === 'spin' ? { Spin: 1.3, Pace: 0.8 } : pitch === 'pace' ? { Spin: 0.8, Pace: 1.3 } : {};
  return [...players].sort((a, b) => b.impact * (w[b.kind] || 1) - a.impact * (w[a.kind] || 1)).slice(0, 11);
}

const MIN_CARD_W = 44;
const MAX_CARD_W = 92;
const MIN_PEEK = 30;

/**
 * Spread n cards evenly across the full container width.
 * Each card keeps at least MIN_PEEK px visible; card size shrinks if needed.
 */
export function computeHandSpread(n, containerWidth, baseCardWidth = MAX_CARD_W) {
  if (n === 0) {
    return { cardWidth: baseCardWidth, slots: [] };
  }

  const usable = Math.max(containerWidth - 8, 200);
  let cardWidth = Math.min(baseCardWidth, MAX_CARD_W);

  const needed = cardWidth + (n - 1) * MIN_PEEK;
  if (needed > usable) {
    cardWidth = Math.max(MIN_CARD_W, usable - (n - 1) * MIN_PEEK);
  }

  if (n === 1) {
    return {
      cardWidth,
      slots: [{ left: (usable - cardWidth) / 2, angle: 0, lift: 0 }],
    };
  }

  const span = usable - cardWidth;
  const step = span / (n - 1);
  const mid = (n - 1) / 2;
  const maxAngle = Math.min(3, 18 / n);

  const slots = Array.from({ length: n }, (_, i) => {
    const off = i - mid;
    return {
      left: i * step,
      angle: off * (maxAngle / Math.max(mid, 1)),
      lift: -Math.pow(Math.abs(off) * 0.35, 1.4),
    };
  });

  return { cardWidth, slots, totalWidth: usable };
}

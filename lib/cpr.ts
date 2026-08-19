export type DailyCandle = {
  high: number;
  low: number;
  close: number;
};

export type CPR = {
  pivot: number;
  bc: number;
  tc: number;
  width: number;
  widthPct: number;
};

export function calculateCPR(candle: DailyCandle): CPR {
  const pivot = (candle.high + candle.low + candle.close) / 3;
  const bc = (candle.high + candle.low) / 2;
  const tc = 2 * pivot - bc;
  const width = Math.abs(tc - bc);
  const widthPct = pivot === 0 ? 0 : (width / pivot) * 100;

  return { pivot, bc, tc, width, widthPct };
}

export function isNarrowCPR(widthPct: number, thresholdPct = 0.7): boolean {
  return widthPct > 0 && widthPct <= thresholdPct;
}

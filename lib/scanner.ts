import { calculateCPR, isNarrowCPR, type DailyCandle } from "./cpr";

export type ScannerInput = {
  symbol: string;
  candle: DailyCandle;
  atrPct?: number;
  relativeVolume?: number;
  trend?: "Bullish" | "Bearish" | "Neutral";
  trendStrength?: number;
  rangeExpansion?: number;
  closeLocation?: number;
  rsi?: number;
  turnoverCr?: number;
};

export type ScannerRow = {
  symbol: string;
  cprWidthPct: number;
  pivot: number;
  bc: number;
  tc: number;
  atrPct: number;
  relativeVolume: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  score: number;
  grade: "A+" | "A" | "B" | "C";
  setup: "Breakout" | "Breakdown" | "Expansion";
  pdh: number;
  pdl: number;
  close: number;
  buyAbove: number;
  sellBelow: number;
  rsi: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function scoreScannerRow(input: ScannerInput): ScannerRow | null {
  const cpr = calculateCPR(input.candle);
  if (!isNarrowCPR(cpr.widthPct)) return null;

  const atrPct = input.atrPct ?? 0;
  const relativeVolume = input.relativeVolume ?? 1;
  const trend = input.trend ?? "Neutral";
  const trendStrength = input.trendStrength ?? 0;
  const rangeExpansion = input.rangeExpansion ?? 1;
  const closeLocation = clamp(input.closeLocation ?? 0.5, 0, 1);
  const rsi = input.rsi ?? 50;
  const turnoverCr = input.turnoverCr ?? 0;

  // 100-point model: compression 20 + volatility 15 + volume 15 + trend 15
  // + range expansion 10 + directional close 10 + momentum 10 + liquidity 5.
  const cprScore = clamp((0.7 - cpr.widthPct) / 0.7 * 20, 0, 20);
  const atrScore = clamp((atrPct / 4) * 15, 0, 15);
  const volumeScore = clamp((relativeVolume / 2) * 15, 0, 15);
  const trendScore = trend === "Neutral" ? 5 : 10 + clamp(trendStrength * 5, 0, 5);
  const rangeScore = clamp(rangeExpansion * 5, 0, 10);
  const directionalCloseScore = trend === "Bullish"
    ? closeLocation * 10
    : trend === "Bearish"
      ? (1 - closeLocation) * 10
      : Math.abs(closeLocation - 0.5) * 10;
  const momentumScore = trend === "Bullish"
    ? clamp((rsi - 50) / 20 * 10, 0, 10)
    : trend === "Bearish"
      ? clamp((50 - rsi) / 20 * 10, 0, 10)
      : clamp((Math.abs(rsi - 50) / 15) * 5, 0, 5);
  const liquidityScore = turnoverCr >= 100 ? 5 : turnoverCr >= 50 ? 4 : turnoverCr >= 20 ? 3 : turnoverCr >= 10 ? 2 : 1;

  const score = Math.round(clamp(
    cprScore + atrScore + volumeScore + trendScore + rangeScore + directionalCloseScore + momentumScore + liquidityScore,
    0,
    100,
  ));

  const setup = trend === "Bullish" ? "Breakout" : trend === "Bearish" ? "Breakdown" : "Expansion";
  const grade = score >= 80 ? "A+" : score >= 70 ? "A" : score >= 60 ? "B" : "C";

  return {
    symbol: input.symbol,
    cprWidthPct: cpr.widthPct,
    pivot: cpr.pivot,
    bc: cpr.bc,
    tc: cpr.tc,
    atrPct,
    relativeVolume,
    trend,
    score,
    grade,
    setup,
    pdh: input.candle.high,
    pdl: input.candle.low,
    close: input.candle.close,
    buyAbove: input.candle.high,
    sellBelow: input.candle.low,
    rsi,
  };
}

export function rankScanner(inputs: ScannerInput[]): ScannerRow[] {
  return inputs
    .map(scoreScannerRow)
    .filter((row): row is ScannerRow => row !== null)
    .sort((a, b) => b.score - a.score);
}

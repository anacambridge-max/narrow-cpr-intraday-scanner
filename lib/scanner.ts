import { calculateCPR, isNarrowCPR, type DailyCandle } from "./cpr";

export type ScannerInput = {
  symbol: string;
  candle: DailyCandle;
  atrPct?: number;
  relativeVolume?: number;
  trend?: "Bullish" | "Bearish" | "Neutral";
  nearBreakout?: boolean;
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
  setup: "Breakout" | "Breakdown" | "Expansion";
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function scoreScannerRow(input: ScannerInput): ScannerRow | null {
  const cpr = calculateCPR(input.candle);
  if (!isNarrowCPR(cpr.widthPct)) return null;

  const atrPct = input.atrPct ?? 0;
  const relativeVolume = input.relativeVolume ?? 0;
  const trend = input.trend ?? "Neutral";

  const cprScore = clamp((0.7 - cpr.widthPct) / 0.7 * 35, 0, 35);
  const volumeScore = clamp(relativeVolume * 10, 0, 25);
  const atrScore = clamp(atrPct / 4 * 20, 0, 20);
  const trendScore = trend === "Neutral" ? 8 : 15;
  const breakoutScore = input.nearBreakout ? 5 : 0;
  const score = Math.round(cprScore + volumeScore + atrScore + trendScore + breakoutScore);

  const setup = trend === "Bullish" ? "Breakout" : trend === "Bearish" ? "Breakdown" : "Expansion";

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
    setup,
  };
}

export function rankScanner(inputs: ScannerInput[]): ScannerRow[] {
  return inputs
    .map(scoreScannerRow)
    .filter((row): row is ScannerRow => row !== null)
    .sort((a, b) => b.score - a.score);
}

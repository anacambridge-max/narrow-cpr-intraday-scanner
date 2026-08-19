import { NextResponse } from "next/server";
import { calculateCPR } from "../../../lib/cpr";
import { rankScanner, type ScannerInput } from "../../../lib/scanner";

type Instrument = {
  segment?: string;
  instrument_type?: string;
  expiry?: number | string;
  underlying_type?: string;
  underlying_key?: string;
  underlying_symbol?: string;
  instrument_key?: string;
  trading_symbol?: string;
};

type Quote = {
  prev_ohlc?: { open: number; high: number; low: number; close: number; volume: number };
};

const INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const UPSTOX_BASE = "https://api.upstox.com";
const CPR_THRESHOLD = 0.7;

function accessToken() {
  return process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN_V3 || "";
}

async function upstox(path: string) {
  const token = accessToken();
  if (!token) throw new Error("UPSTOX_ACCESS_TOKEN is not configured in Vercel.");
  const response = await fetch(`${UPSTOX_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Upstox ${response.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body);
}

async function loadInstruments(): Promise<Instrument[]> {
  const response = await fetch(INSTRUMENTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load Upstox instrument master (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const decompressed = new Response(
    new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
  );
  const text = await decompressed.text();
  const json = JSON.parse(text);
  return Array.isArray(json) ? json : json.data ?? [];
}

function expiryMs(value: number | string | undefined) {
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function getFnoUniverse(instruments: Instrument[]) {
  const now = Date.now();
  const map = new Map<string, Instrument>();

  for (const item of instruments) {
    if (item.segment !== "NSE_FO" || item.instrument_type !== "FUT") continue;
    if (item.underlying_type !== "EQUITY" || !item.underlying_key || !item.instrument_key) continue;

    const expiry = expiryMs(item.expiry);
    if (!Number.isFinite(expiry) || expiry < now) continue;

    const previous = map.get(item.underlying_key);
    if (!previous || expiry < expiryMs(previous.expiry)) map.set(item.underlying_key, item);
  }

  return [...map.entries()].map(([equityKey, future]) => ({
    equityKey,
    symbol: future.underlying_symbol || future.trading_symbol?.split(" FUT ")[0] || equityKey,
  }));
}

function indiaDate(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function ema(values: number[], period: number) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) result = values[i] * k + result * (1 - k);
  return result;
}

function parseHistorical(candles: unknown[]) {
  return candles
    .map((row: any) => ({
      open: Number(row?.[1]),
      high: Number(row?.[2]),
      low: Number(row?.[3]),
      close: Number(row?.[4]),
      volume: Number(row?.[5]),
    }))
    .filter((c) => [c.open, c.high, c.low, c.close].every(Number.isFinite));
}

export async function GET() {
  try {
    if (!accessToken()) {
      return NextResponse.json({ ok: false, error: "Upstox access token is missing." }, { status: 500 });
    }

    const instruments = await loadInstruments();
    const universe = getFnoUniverse(instruments);
    if (!universe.length) throw new Error("No current NSE equity F&O underlyings found in Upstox instrument master.");

    const equityKeys = universe.map((x) => x.equityKey).slice(0, 500);
    const quote = await upstox(
      `/v3/market-quote/ohlc?interval=1d&instrument_key=${encodeURIComponent(equityKeys.join(","))}`,
    );
    const quoteData: Record<string, Quote> = quote.data || {};
    const byKey = new Map(universe.map((x) => [x.equityKey, x]));

    // Upstox V3 returns the instrument key as the OBJECT KEY in data.
    // Do not use instrument_token here: it is not present in this response shape.
    const allCandidates = Object.entries(quoteData)
      .map(([key, q]) => {
        const prev = q?.prev_ohlc;
        const meta = byKey.get(key);
        if (!meta || !prev) return null;
        const cpr = calculateCPR(prev);
        return { key, meta, prev, cpr };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x && x.cpr.widthPct > 0));

    const narrow = allCandidates
      .filter((x) => x.cpr.widthPct <= CPR_THRESHOLD)
      .sort((a, b) => a.cpr.widthPct - b.cpr.widthPct)
      .slice(0, 40);

    const historical = await Promise.all(
      narrow.map(async (candidate) => {
        try {
          const to = indiaDate(-1);
          const from = indiaDate(-90);
          const data = await upstox(
            `/v3/historical-candle/${encodeURIComponent(candidate.key)}/days/1/${to}/${from}`,
          );
          return { candidate, candles: parseHistorical(data?.data?.candles || []) };
        } catch {
          return { candidate, candles: [] };
        }
      }),
    );

    const inputs: ScannerInput[] = historical.map(({ candidate, candles }) => {
      const closes = candles.map((c) => c.close);
      const last = candidate.prev.close;
      const trueRanges = candles.slice(1).map((c, i) => {
        const previousClose = candles[i].close;
        return Math.max(c.high - c.low, Math.abs(c.high - previousClose), Math.abs(c.low - previousClose));
      });
      const atrValues = trueRanges.slice(-14);
      const atr = atrValues.length ? atrValues.reduce((a, b) => a + b, 0) / atrValues.length : 0;
      const atrPct = last ? (atr / last) * 100 : 0;

      const priorVolumes = candles.slice(-21, -1).map((c) => c.volume).filter((v) => v > 0);
      const avgVolume = priorVolumes.length
        ? priorVolumes.reduce((a, b) => a + b, 0) / priorVolumes.length
        : 0;
      const relativeVolume = avgVolume ? candidate.prev.volume / avgVolume : 1;

      const ema20 = ema(closes.slice(-60), 20);
      const ema50 = ema(closes.slice(-100), 50);
      const trend = last > ema20 && ema20 > ema50 ? "Bullish" : last < ema20 && ema20 < ema50 ? "Bearish" : "Neutral";
      const nearBreakout = last >= candidate.prev.high * 0.995 || last <= candidate.prev.low * 1.005;

      return {
        symbol: candidate.meta.symbol,
        candle: { high: candidate.prev.high, low: candidate.prev.low, close: candidate.prev.close },
        atrPct,
        relativeVolume,
        trend,
        nearBreakout,
      } satisfies ScannerInput;
    });

    const rows = rankScanner(inputs).slice(0, 20);

    return NextResponse.json({
      ok: true,
      asOf: new Date().toISOString(),
      universe: universe.length,
      quoteCount: Object.keys(quoteData).length,
      validCprCount: allCandidates.length,
      narrowCount: rows.length,
      threshold: CPR_THRESHOLD,
      minCprWidth: allCandidates.length ? Math.min(...allCandidates.map((x) => x.cpr.widthPct)) : null,
      diagnosticWidths: allCandidates
        .sort((a, b) => a.cpr.widthPct - b.cpr.widthPct)
        .slice(0, 10)
        .map((x) => ({ symbol: x.meta.symbol, width: Number(x.cpr.widthPct.toFixed(4)) })),
      rows,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scanner failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

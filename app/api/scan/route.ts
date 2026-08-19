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
  instrument_token?: string;
  prev_ohlc?: { open: number; high: number; low: number; close: number; volume: number };
};

const INSTRUMENTS_URL = "https://assets.upstox.com/market-quote/instruments/exchange/complete.json.gz";
const UPSTOX_BASE = "https://api.upstox.com";

function token() {
  return process.env.UPSTOX_ACCESS_TOKEN || process.env.UPSTOX_ACCESS_TOKEN_V3 || "";
}

async function upstox(path: string) {
  const accessToken = token();
  if (!accessToken) throw new Error("UPSTOX_ACCESS_TOKEN is not configured in Vercel.");
  const response = await fetch(`${UPSTOX_BASE}${path}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Upstox ${response.status}: ${body.slice(0, 300)}`);
  return JSON.parse(body);
}

async function loadInstruments(): Promise<Instrument[]> {
  const response = await fetch(INSTRUMENTS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to load Upstox instrument master (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const ds = new DecompressionStream("gzip");
  const decompressed = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
  const json = JSON.parse(decompressed);
  return Array.isArray(json) ? json : json.data ?? [];
}

function nearestExpiryMap(instruments: Instrument[]) {
  const now = Date.now();
  const map = new Map<string, Instrument>();
  for (const item of instruments) {
    if (item.segment !== "NSE_FO" || item.instrument_type !== "FUT") continue;
    if (item.underlying_type !== "EQUITY" || !item.underlying_key) continue;
    const expiry = typeof item.expiry === "number" ? item.expiry : Date.parse(String(item.expiry));
    if (!Number.isFinite(expiry) || expiry < now || !item.instrument_key) continue;
    const old = map.get(item.underlying_key);
    if (!old) map.set(item.underlying_key, item);
    else {
      const oldExpiry = typeof old.expiry === "number" ? old.expiry : Date.parse(String(old.expiry));
      if (expiry < oldExpiry) map.set(item.underlying_key, item);
    }
  }
  return [...map.entries()].map(([underlyingKey, future]) => ({
    underlyingKey,
    symbol: future.underlying_symbol || future.trading_symbol?.split(" FUT ")[0] || underlyingKey,
  }));
}

function dateInIndia(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
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
    if (!token()) {
      return NextResponse.json({ ok: false, error: "Upstox access token is missing." }, { status: 500 });
    }

    const instruments = await loadInstruments();
    const universe = nearestExpiryMap(instruments);
    if (!universe.length) throw new Error("No current NSE equity F&O underlyings found in Upstox instrument master.");

    const keys = universe.map((x) => x.underlyingKey).slice(0, 500);
    const quote = await upstox(`/v3/market-quote/ohlc?interval=1d&instrument_key=${encodeURIComponent(keys.join(","))}`);
    const quoteData: Record<string, Quote> = quote.data || {};
    const byKey = new Map(universe.map((x) => [x.underlyingKey, x]));

    const narrow = Object.values(quoteData)
      .map((q) => {
        const key = q.instrument_token || "";
        const prev = q.prev_ohlc;
        const meta = byKey.get(key);
        if (!meta || !prev) return null;
        const cpr = calculateCPR(prev);
        return { key, meta, prev, cpr };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x && x.cpr.widthPct > 0 && x.cpr.widthPct <= 0.7))
      .sort((a, b) => a.cpr.widthPct - b.cpr.widthPct)
      .slice(0, 35);

    const historical = await Promise.all(
      narrow.map(async (candidate) => {
        try {
          const end = dateInIndia(-1);
          const start = dateInIndia(-45);
          const data = await upstox(`/v3/historical-candle/${encodeURIComponent(candidate.key)}/days/1/${end}/${start}`);
          const candles = parseHistorical(data?.data?.candles || []);
          return { candidate, candles };
        } catch {
          return { candidate, candles: [] };
        }
      }),
    );

    const inputs: ScannerInput[] = historical.map(({ candidate, candles }) => {
      const closes = candles.map((c) => c.close);
      const last = candidate.prev.close;
      const trValues = candles.slice(1).map((c, i) => {
        const previousClose = candles[i].close;
        return Math.max(c.high - c.low, Math.abs(c.high - previousClose), Math.abs(c.low - previousClose));
      });
      const atr = trValues.slice(-14).length
        ? trValues.slice(-14).reduce((a, b) => a + b, 0) / trValues.slice(-14).length
        : 0;
      const atrPct = last ? (atr / last) * 100 : 0;
      const priorVolumes = candles.slice(-21, -1).map((c) => c.volume).filter((v) => v > 0);
      const relativeVolume = priorVolumes.length
        ? candidate.prev.volume / (priorVolumes.reduce((a, b) => a + b, 0) / priorVolumes.length)
        : 1;
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
      };
    });

    const rows = rankScanner(inputs).slice(0, 20);
    const details = rows.map((row) => {
      const cpr = calculateCPR({ high: row.pivot + (row.tc - row.bc) / 2, low: row.pivot - (row.tc - row.bc) / 2, close: row.pivot });
      return {
        ...row,
        cprWidthPct: row.cprWidthPct,
        width: row.cprWidthPct,
        score: row.score,
        pdh: undefined,
        pdl: undefined,
        _cpr: cpr,
      };
    });

    return NextResponse.json({
      ok: true,
      asOf: new Date().toISOString(),
      universe: universe.length,
      narrowCount: rows.length,
      rows: details,
      threshold: 0.7,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scanner failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

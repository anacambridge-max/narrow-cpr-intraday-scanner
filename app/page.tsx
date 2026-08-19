"use client";

import { useCallback, useEffect, useState } from "react";

type ScannerRow = {
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

type DiagnosticWidth = { symbol: string; width: number };

type ScanResponse = {
  ok: boolean;
  asOf?: string;
  universe?: number;
  quoteCount?: number;
  validCprCount?: number;
  narrowCount?: number;
  minCprWidth?: number | null;
  diagnosticWidths?: DiagnosticWidth[];
  rows?: ScannerRow[];
  threshold?: number;
  error?: string;
};

function pct(value: number) { return `${value.toFixed(2)}%`; }
function price(value: number) { return value ? value.toFixed(2) : "—"; }

export default function Home() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const scan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/scan?t=${Date.now()}`, { cache: "no-store" });
      const json: ScanResponse = await response.json();
      if (!response.ok || !json.ok) throw new Error(json.error || "Scanner request failed.");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load scanner.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { scan(); }, [scan]);

  const rows = data?.rows ?? [];
  const bullish = rows.filter((row) => row.trend === "Bullish").length;
  const bearish = rows.filter((row) => row.trend === "Bearish").length;
  const highProbability = rows.filter((row) => row.score >= 80).length;

  return (
    <main className="page">
      <div className="shell">
        <header className="header">
          <div>
            <div className="eyebrow">Next-session scanner</div>
            <h1>Narrow CPR Intraday Scanner</h1>
            <p className="sub">Today&apos;s closing structure → tomorrow&apos;s potential intraday movers.</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button onClick={scan} disabled={loading} className="refresh">{loading ? "Scanning…" : "Refresh scan"}</button>
            <div className="pill">F&O Universe · Upstox</div>
          </div>
        </header>

        <section className="cards">
          <div className="card"><div className="card-label">Narrow CPR</div><div className="card-value">{loading ? "…" : data?.narrowCount ?? "—"}</div></div>
          <div className="card"><div className="card-label">A+ probability</div><div className="card-value">{loading ? "…" : highProbability}</div></div>
          <div className="card"><div className="card-label">Bullish setups</div><div className="card-value">{loading ? "…" : bullish}</div></div>
          <div className="card"><div className="card-label">Bearish setups</div><div className="card-value">{loading ? "…" : bearish}</div></div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Tomorrow&apos;s Watchlist</h2>
              <p>{data?.universe ? `${data.universe} current NSE equity F&O underlyings scanned · ` : ""}Narrow CPR ≤ {data?.threshold?.toFixed(2) ?? "0.70"}% · ranked by move probability</p>
            </div>
            <div className="pill">CPR ≤ {data?.threshold?.toFixed(2) ?? "0.70"}%</div>
          </div>

          {error ? (
            <div className="empty"><strong>Live scan unavailable</strong><div style={{ marginTop: 8 }}>{error}</div><div style={{ marginTop: 14 }}>Check that Vercel contains a valid <code>UPSTOX_ACCESS_TOKEN</code>, then redeploy.</div></div>
          ) : loading ? (
            <div className="empty">Scanning the current F&O universe with Upstox…</div>
          ) : rows.length === 0 ? (
            <div className="empty">
              <strong>No stocks currently meet the narrow CPR threshold.</strong>
              <div className="diagnostic-grid">
                <span>F&O universe <b>{data?.universe ?? 0}</b></span><span>Quotes received <b>{data?.quoteCount ?? 0}</b></span><span>Valid CPR <b>{data?.validCprCount ?? 0}</b></span><span>Minimum CPR <b>{data?.minCprWidth != null ? `${data.minCprWidth.toFixed(3)}%` : "—"}</b></span>
              </div>
              {!!data?.diagnosticWidths?.length && <div className="diagnostic-list"><div className="diagnostic-title">10 narrowest CPRs received</div>{data.diagnosticWidths.map((item) => <span key={item.symbol}>{item.symbol} <b>{item.width.toFixed(3)}%</b></span>)}</div>}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>#</th><th>Stock</th><th>CPR</th><th>Grade</th><th>Trend</th><th>RSI</th><th>Rel Vol</th><th>ATR</th><th>Setup</th><th>Buy Above</th><th>Sell Below</th><th>Score</th></tr></thead>
                <tbody>{rows.map((row, index) => (
                  <tr key={row.symbol}>
                    <td className="rank">{index + 1}</td>
                    <td className="symbol">{row.symbol}</td>
                    <td className="mono">{pct(row.cprWidthPct)}</td>
                    <td><span className={`grade grade-${row.grade.replace("+", "plus").toLowerCase()}`}>{row.grade}</span></td>
                    <td><span className={`badge ${row.trend === "Bullish" ? "bull" : row.trend === "Bearish" ? "bear" : "neutral"}`}>{row.trend}</span></td>
                    <td className="mono">{row.rsi.toFixed(0)}</td>
                    <td className="mono">{row.relativeVolume.toFixed(1)}x</td>
                    <td className="mono">{pct(row.atrPct)}</td>
                    <td>{row.setup}</td>
                    <td className="mono">{price(row.buyAbove)}</td>
                    <td className="mono">{price(row.sellBelow)}</td>
                    <td className="score">{row.score}/100</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <div className="metrics">
          {rows.length > 0 && <><span>Top candidate: <strong>{rows[0].symbol}</strong></span><span>CPR: <strong>{pct(rows[0].cprWidthPct)}</strong></span><span>Buy above PDH: <strong>{price(rows[0].buyAbove)}</strong></span><span>Sell below PDL: <strong>{price(rows[0].sellBelow)}</strong></span><span>Pivot: <strong>{price(rows[0].pivot)}</strong></span><span>RSI: <strong>{rows[0].rsi.toFixed(0)}</strong></span></>}
        </div>

        <p className="footer">{data?.asOf ? `Last scan: ${new Date(data.asOf).toLocaleString("en-IN")}. ` : ""}Scanner uses Upstox market data and is a screening tool, not a trade recommendation.</p>
      </div>
    </main>
  );
}

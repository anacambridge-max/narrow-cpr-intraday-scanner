type ScannerRow = {
  symbol: string;
  width: string;
  trend: "Bullish" | "Bearish" | "Neutral";
  volume: string;
  atr: string;
  setup: string;
  score: number;
};

const previewRows: ScannerRow[] = [
  { symbol: "UPL", width: "0.31%", trend: "Bullish", volume: "1.9x", atr: "3.2%", setup: "Breakout", score: 92 },
  { symbol: "RVNL", width: "0.38%", trend: "Bearish", volume: "2.1x", atr: "3.7%", setup: "Breakdown", score: 89 },
  { symbol: "IRFC", width: "0.42%", trend: "Bullish", volume: "1.6x", atr: "2.9%", setup: "Breakout", score: 86 },
  { symbol: "WIPRO", width: "0.48%", trend: "Neutral", volume: "1.8x", atr: "2.6%", setup: "Expansion", score: 82 },
  { symbol: "TATACONSUM", width: "0.55%", trend: "Bullish", volume: "1.4x", atr: "2.8%", setup: "Breakout", score: 79 },
];

export default function Home() {
  return (
    <main className="page">
      <div className="shell">
        <header className="header">
          <div>
            <div className="eyebrow">Next-session scanner</div>
            <h1>Narrow CPR Intraday Scanner</h1>
            <p className="sub">Today&apos;s closing structure → tomorrow&apos;s potential intraday movers.</p>
          </div>
          <div className="pill">F&O Universe · Upstox</div>
        </header>

        <section className="cards">
          <div className="card"><div className="card-label">Narrow CPR</div><div className="card-value">—</div></div>
          <div className="card"><div className="card-label">High probability</div><div className="card-value">—</div></div>
          <div className="card"><div className="card-label">Bullish setups</div><div className="card-value">—</div></div>
          <div className="card"><div className="card-label">Bearish setups</div><div className="card-value">—</div></div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Tomorrow&apos;s Watchlist</h2>
              <p>Preview UI is ready. Live Upstox data will populate this table after credentials are added.</p>
            </div>
            <div className="pill">CPR width ≤ 0.70%</div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Stock</th>
                  <th>CPR Width</th>
                  <th>Trend</th>
                  <th>Rel. Volume</th>
                  <th>ATR</th>
                  <th>Setup</th>
                  <th>Move Score</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, index) => (
                  <tr key={row.symbol}>
                    <td className="rank">{index + 1}</td>
                    <td className="symbol">{row.symbol}</td>
                    <td className="mono">{row.width}</td>
                    <td><span className={`badge ${row.trend === "Bullish" ? "bull" : row.trend === "Bearish" ? "bear" : "neutral"}`}>{row.trend}</span></td>
                    <td className="mono">{row.volume}</td>
                    <td className="mono">{row.atr}</td>
                    <td>{row.setup}</td>
                    <td className="score">{row.score}/100</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <p className="footer">Preview values are illustrative only. They are not live market signals.</p>
      </div>
    </main>
  );
}

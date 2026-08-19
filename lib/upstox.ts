type UpstoxCandle = [string, number, number, number, number, number, number?];

function getToken() {
  const token = process.env.UPSTOX_ACCESS_TOKEN;
  if (!token) throw new Error("Missing UPSTOX_ACCESS_TOKEN environment variable");
  return token;
}

export async function fetchUpstoxHistoricalCandles(params: {
  instrumentKey: string;
  interval: string;
  fromDate: string;
  toDate: string;
}) {
  const { instrumentKey, interval, fromDate, toDate } = params;
  const url = new URL(
    `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${interval}/${toDate}/${fromDate}`,
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upstox request failed (${response.status}): ${text}`);
  }

  const json = await response.json();
  return (json?.data?.candles ?? []) as UpstoxCandle[];
}

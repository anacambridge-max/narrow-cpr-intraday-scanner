import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Narrow CPR Intraday Scanner",
  description: "Next-session Narrow CPR scanner for liquid Indian equities and F&O stocks.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ETF Fund Flows Tracker",
  description: "Track ETF fund flows using the shares outstanding method",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5] antialiased">
        {children}
      </body>
    </html>
  );
}

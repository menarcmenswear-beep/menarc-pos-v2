import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MENARC — Offline POS",
  description: "Point of sale, inventory, and sales analytics for MENARC.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

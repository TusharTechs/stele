import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Three voices, each with one job.
 *
 * Fraunces carries the headlines. A serif is not decoration here: serifs exist because Roman
 * letterforms were cut into stone, and the whole idea of this product is a record inscribed to
 * outlast whoever made it. It is variable with optical sizing, so the same family holds at 48px and
 * at 20px instead of looking thin at one and clumsy at the other.
 *
 * Inter reads the body, because it is boring in the way body text should be. JetBrains Mono carries
 * anything the machine produced — costs, hashes, capability names, SPARQL — so numbers align and a
 * capability name never gets mistaken for prose.
 */
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["SOFT", "WONK", "opsz"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono-face", display: "swap" });

export const metadata: Metadata = {
  title: "Stele · every frame, on the record",
  description:
    "An AI studio whose memory and its receipts are the same verifiable knowledge graph. Built on Livepeer Agent and the OriginTrail DKG.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

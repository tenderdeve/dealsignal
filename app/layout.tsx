import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DealSignal — find the owners ready to sell",
  description: "Turns a raw lead export into a ranked, explained shortlist of acquisition targets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} font-sans antialiased`}>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm text-white">DS</span>
              DealSignal
            </Link>
            <span className="hidden text-sm text-muted sm:block">Acquisition-readiness for SaaSquatch lead lists</span>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

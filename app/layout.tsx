import type { Metadata } from "next";
import { Bricolage_Grotesque, Public_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { THEME_SCRIPT, ThemeToggle } from "./theme-toggle";

const display = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"] });
const body = Public_Sans({ variable: "--font-public", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DealSignal — find the owners ready to sell",
  description: "Turns a raw lead export into a ranked, explained shortlist of acquisition targets.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${display.variable} ${body.variable} font-sans antialiased`}>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
              <span aria-hidden className="h-5 w-2.5 rounded-sm bg-mark ring-1 ring-ink/20" />
              DealSignal
            </Link>
            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-muted sm:block">Acquisition-readiness for SaaSquatch lead lists</span>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}

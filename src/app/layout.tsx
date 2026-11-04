import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scouted — the daily football guessing game",
  description: "Guess the mystery footballer in ten tries.",
  icons: {
    icon: "/ball.png",
    apple: "/ball.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Sits in the layout, not a page, so every route carries it. */}
        <footer className="mx-auto mt-auto w-full max-w-3xl px-4 py-10 text-xs leading-relaxed text-ink-soft/70">
          <p>
            Scouted is a fan-made game. It is not affiliated with, endorsed by or
            associated with any club, league or governing body. Club, league and
            competition names are used only to identify the teams a player has
            played for, and remain the property of their respective owners. Player
            statistics are drawn from publicly available sources.
          </p>
        </footer>
      </body>
    </html>
  );
}

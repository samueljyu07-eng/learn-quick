import type { Metadata } from "next";
import { Literata, Source_Sans_3 } from "next/font/google";

import { SessionProvider } from "@/components/session-provider";
import "./globals.css";

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  display: "swap",
});

const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Learn Quick",
  description: "Repackage source material around what you need to do with it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${literata.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper font-sans text-ink">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}

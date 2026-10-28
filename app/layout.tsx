import type { Metadata } from "next";
import { Literata, Share_Tech_Mono, Source_Sans_3 } from "next/font/google";

import { FamiliarityLoader } from "@/components/familiarity-loader";
import { HardcoreTheme } from "@/components/hardcore-theme";
import { LearningLoader } from "@/components/learning-loader";
import { SessionProvider } from "@/components/session-provider";
import { StudyTimer } from "@/components/study-timer";
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

const led = Share_Tech_Mono({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-led",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Learn Quick",
  description: "Repackage source material around what you need to do with it.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sourceSans.variable} ${literata.variable} ${led.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper font-sans text-ink">
        <SessionProvider>
          <HardcoreTheme />
          <FamiliarityLoader />
          <LearningLoader />
          <StudyTimer />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Share_Tech_Mono } from "next/font/google";

import { AccountProvider } from "@/components/account-provider";
import { FamiliarityLoader } from "@/components/familiarity-loader";
import { HardcoreTheme } from "@/components/hardcore-theme";
import { LearningLoader } from "@/components/learning-loader";
import { SessionProvider } from "@/components/session-provider";
import { StudyShell } from "@/components/side-nav";
import "./globals.css";

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
    <html lang="en" className={`${led.variable} h-full`}>
      <body className="min-h-full bg-paper font-sans text-ink">
        <SessionProvider>
          <AccountProvider>
            <HardcoreTheme />
            <FamiliarityLoader />
            <LearningLoader />
            <StudyShell>{children}</StudyShell>
          </AccountProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

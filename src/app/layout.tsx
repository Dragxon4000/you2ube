import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "you2ube — XP, Achievements, Badges, and Rewards",
  description: "A desktop-first video platform with a progression system: earn XP, unlock achievements, collect badges, and redeem rewards. Discord integration and Rich Presence included.",
  applicationName: "you2ube",
  creator: "you2ube",
  keywords: ["you2ube", "video", "progression", "achievements", "badges", "rewards", "discord"],
};

export const viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}

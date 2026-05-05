import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GlobalNav } from "@/components/global-nav";
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
  title: "勤怠管理システム",
  description: "Next.js + Supabase + Vercel + Docker 構成の勤怠管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <GlobalNav />
        {children}
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vonat Térkép - Hungarian Railway Tracker",
  description: "Real-time train tracking and journey planning for Hungarian railways",
  keywords: ["MÁV", "train", "railway", "Hungary", "tracking", "journey planner"],
  authors: [{ name: "Vonat Térkép Team" }],
  openGraph: {
    title: "Vonat Térkép - Hungarian Railway Tracker",
    description: "Real-time train tracking and journey planning for Hungarian railways",
    type: "website",
    locale: "hu_HU",
    alternateLocale: ["en_US", "de_DE"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="hu" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2563eb",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://vonatterkep.app.jazzrabbit.eu"),
  title: "Vonat Térkép - Magyar vasúti követő",
  description: "Valós idejű vonatkövetés és útvonaltervezés a magyar vasúton. Kövesd nyomon a MÁV vonatokat élő térképen, nézd meg a késéseket és tervezd meg az utazásod.",
  keywords: ["MÁV", "vonat", "vasút", "Magyarország", "követés", "útvonaltervező", "holavonat", "vonat térkép", "elvira", "emma", "vonatinfó", "menetrend"],
  authors: [{ name: "Vonat Térkép" }],
  robots: "index, follow",
  
  // OpenGraph metadata
  openGraph: {
    title: "Vonat Térkép - Magyar vasúti követő",
    description: "Valós idejű vonatkövetés és útvonaltervezés a magyar vasúton. Kövesd nyomon a MÁV vonatokat élő térképen.",
    type: "website",
    locale: "hu_HU",
    url: "https://vonatterkep.app.jazzrabbit.eu",
    siteName: "Vonat Térkép",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Vonat Térkép - Magyar vasúti követő",
        type: "image/png",
      },
    ],
  },

  // Twitter metadata
  twitter: {
    card: "summary_large_image",
    title: "Vonat Térkép - Magyar vasúti követő",
    description: "Valós idejű vonatkövetés és útvonaltervezés a magyar vasúton. Kövesd nyomon a MÁV vonatokat élő térképen.",
    images: ["/og.png"],
    creator: "@vonatterkep",
    site: "@vonatterkep",
  },

  // Additional metadata
  other: {
    // Facebook specific
    "fb:app_id": "vonatterkep",
    
    // Additional OpenGraph
    "og:image:width": "1200",
    "og:image:height": "630",
    "og:image:type": "image/png",
    "og:locale:alternate": "en_US",
    
    // LinkedIn specific
    "linkedin:owner": "lukacsaron",
    
    // Additional meta tags
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "Vonat Térkép",
    "application-name": "Vonat Térkép",
    "mobile-web-app-capable": "yes",
    "msapplication-TileColor": "#2563eb",
    "msapplication-TileImage": "/og.png",
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

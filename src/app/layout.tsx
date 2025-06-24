import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
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
  title: "VasútTérkép - Élő vasútkövetés Magyarországon",
  description: "Kövesd nyomon a magyar vonatokat élőben. Nézd meg a késéseket és tervezd meg az utazásod.",
  keywords: ["MÁV", "vonat", "vasút", "Magyarország", "követés", "útvonaltervező", "holavonat", "vonat térkép", "elvira", "emma", "vonatinfó", "menetrend"],
  authors: [{ name: "VasútTérkép" }],
  robots: "index, follow",
  
  // OpenGraph metadata
  openGraph: {
    title: "VasútTérkép - Élő vasútkövetés Magyarországon",
    description: "Kövesd nyomon a magyar vonatokat élőben.",
    type: "website",
    locale: "hu_HU",
    url: "https://vonatterkep.app.jazzrabbit.eu",
    siteName: "VasútTérkép",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "VasútTérkép - Élő vasútkövetés Magyarországon",
        type: "image/png",
      },
    ],
  },

  // Twitter metadata
  twitter: {
    card: "summary_large_image",
    title: "VasútTérkép - Élő vasútkövetés Magyarországon",
    description: "Kövesd nyomon a magyar vonatokat élőben. Nézd meg a késéseket és tervezd meg az utazásod.",
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
    "apple-mobile-web-app-title": "VasútTérkép",
    "application-name": "VasútTérkép",
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
      <head>
        <Script
          id="gtm-script"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
              new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
              j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
              'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
              })(window,document,'script','dataLayer','GTM-MP8HLBPM');`,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-MP8HLBPM"
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import MetaPixelPageView from "./components/analytics/MetaPixelPageView";
import { Navbar } from "./components/navbar";
import PwaRegister from "./components/pwa/PwaRegister";
import RecaptchaProvider from "./components/providers/RecaptchaProvider";
import {
  getMetaPixelInitScript,
  getMetaPixelNoscriptUrl,
  META_PIXEL_ID,
} from "./lib/meta-pixel";
import Providers from "./providers";
import StyledJsxRegistry from "./registry";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hirexa AI",
  description:
    "Hirexa uses intelligent automation to help you discover better jobs, apply effortlessly, and stand out at every stage of the hiring process.",
  applicationName: "Hirexa AI",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hirexa AI",
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: [
      { url: "/icons/apple-touch-icon.png" },
      { url: "/apple-touch-icon.png" },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1024",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans antialiased">
        <Script id="meta-pixel" strategy="beforeInteractive">
          {getMetaPixelInitScript(META_PIXEL_ID)}
        </Script>
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            height="1"
            width="1"
            style={{ display: "none" }}
            src={getMetaPixelNoscriptUrl(META_PIXEL_ID)}
          />
        </noscript>
        <MetaPixelPageView />
        <StyledJsxRegistry>
          <RecaptchaProvider>
            <Providers>
              <Navbar />
              {children}
              <PwaRegister />
            </Providers>
          </RecaptchaProvider>
        </StyledJsxRegistry>
      </body>
    </html>
  );
}

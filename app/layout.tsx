import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import "./globals.css";
import { Navbar } from "./components/navbar";
import PwaRegister from "./components/pwa/PwaRegister";
import RecaptchaProvider from "./components/providers/RecaptchaProvider";
import Providers from "./providers";

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
        <RecaptchaProvider>
          <Providers>
            <Navbar />
            {children}
            <PwaRegister />
          </Providers>
        </RecaptchaProvider>
      </body>
    </html>
  );
}

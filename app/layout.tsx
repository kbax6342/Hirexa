import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import Providers from "./providers";
import SiteNav from "./components/nav/SiteNav";
import SiteHeaderClient from "./components/nav/SiteNav";
//import { GoogleReCaptchaProvider } from "react-google-recaptcha-v3";
import RecaptchaProvider from "./components/providers/RecaptchaProvider";
import { Navbar } from "./components/navbar";
import { Inter, Space_Grotesk } from "next/font/google"; // ✅ IMPORT IT


const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
})

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Hirexa AI",
  description:
    "Hirexa uses intelligent automation to help you discover better jobs, apply effortlessly, and stand out at every stage of the hiring process.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};


export const viewport: Viewport = {
  themeColor: '#0b1024',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body
        className="font-sans antialiased"
      >
        <RecaptchaProvider
        >
         <Providers>
        <Navbar/>
        {children}</Providers> 
        </RecaptchaProvider>    
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

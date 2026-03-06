import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "./providers";
import RecaptchaProvider from "./components/recaptcha/RecaptchaProvider";
import AuthProvider from "./auth-provider";
import { Navbar } from "./components/navbar";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" });

export const metadata: Metadata = {
  title: "Hirexa - Land the Right Job. Faster. Smarter.",
  description:
    "Hirexa uses intelligent automation to help you discover better jobs, apply effortlessly, and stand out at every stage of the hiring process.",
};

export const viewport: Viewport = {
  themeColor: "#0b1024",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          <RecaptchaProvider>
            <Providers>
              <Navbar />
              {children}
            </Providers>
          </RecaptchaProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

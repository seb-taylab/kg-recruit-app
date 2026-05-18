import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/system/Providers";
import "./globals.css";

// display:"swap" — render fallback metrics immediately, swap in Inter
// when it loads. Default ("block") causes FOIT on slow networks where
// text is invisible for up to 3s. swap is the recommended default per
// next/font docs.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Kampong Glam Branch — Membership Application Portal",
  description: "Access by invitation only.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="light" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-surface-page text-text-primary">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

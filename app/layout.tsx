import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import AuthSessionKeeper from "@/components/AuthSessionKeeper";
import ViewAsBanner from "@/components/ViewAsBanner";
import { ToastProvider } from "@/components/ToastProvider";
import { SITE_DESCRIPTION, SITE_TITLE } from "@/lib/site-seo";
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
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Resonale",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full w-full font-sans antialiased">
        <AuthSessionKeeper />
        <ViewAsBanner />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { LanguageProvider } from "@/lib/i18n";
import { QueryProvider } from "@/components/providers/QueryProvider";

export const metadata: Metadata = {
  title: "ADA OPS Livestream",
  description: "Livestream Operations Management",
  applicationName: "ADA OPS",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "ADA OPS",
    statusBarStyle: "default",
    startupImage: [{ url: "/pwa-splash", media: "(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" }],
  },
};

export const viewport: Viewport = { themeColor: "#07183B" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="h-full">
      <body className="min-h-full bg-background font-sans antialiased">
        <QueryProvider>
        <LanguageProvider defaultLanguage="vi">
          <ToastProvider>{children}</ToastProvider>
        </LanguageProvider>
      </QueryProvider>
      </body>
    </html>
  );
}

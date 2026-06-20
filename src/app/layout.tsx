import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import ConfirmProvider from "@/components/ConfirmDialog";
import UpgradeProvider from "@/components/UpgradeProvider";
import Analytics from "@/components/Analytics";
import CookieConsent from "@/components/CookieConsent";
import {
  SITE_URL,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_DESCRIPTION,
  SITE_OG_LOCALE,
  SITE_TWITTER,
  SITE_KEYWORDS,
} from "@/lib/site";
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
  metadataBase: new URL(SITE_URL),
  title: {
    // Las páginas internas ponen su título y se les agrega "· MarketaFlow".
    default: `${SITE_NAME} — ${SITE_TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  // OJO: no ponemos canonical aquí — se propagaría a TODAS las páginas hijas.
  // Cada página pública declara el suyo (home, pricing, blog, artículos).
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    locale: SITE_OG_LOCALE,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    site: SITE_TWITTER,
    creator: SITE_TWITTER,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        <Analytics />
        <ConfirmProvider>
          <UpgradeProvider>
            {children}
            <Toaster
              position="bottom-right"
              theme="light"
              richColors
              closeButton
              toastOptions={{
                className: "!font-sans",
              }}
            />
          </UpgradeProvider>
        </ConfirmProvider>
        <CookieConsent />
      </body>
    </html>
  );
}

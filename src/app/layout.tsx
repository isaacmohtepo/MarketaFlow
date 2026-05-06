import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import ConfirmProvider from "@/components/ConfirmDialog";
import UpgradeProvider from "@/components/UpgradeProvider";
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
  title: "MarketaFlow",
  description: "Aprobación de contenido para agencias digitales",
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
      <body suppressHydrationWarning className="min-h-full flex flex-col">
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
      </body>
    </html>
  );
}

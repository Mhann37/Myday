import type { Metadata, Viewport } from "next";
import { Figtree, Fraunces } from "next/font/google";
import { ServiceWorker } from "@/components/ServiceWorker";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"] });
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description:
    "Build a daily rhythm, track your habits, and discover what helps you feel and perform at your best.",
  applicationName: APP_NAME,
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f1e7" },
    { media: "(prefers-color-scheme: dark)", color: "#11141b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en-AU"
      className={`${figtree.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-dvh">
        <div id="app-root" className="min-h-dvh">
          {children}
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ServiceWorkerRegistrar } from "@/components/sw-registrar";
import { ProgressSyncManager } from "@/components/progress-sync-manager";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EPUB & PDF Reader",
  description: "Cross-platform EPUB and PDF reader with reading progress sync",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EPUB & PDF Reader",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}else{document.documentElement.classList.add('light')}}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ServiceWorkerRegistrar />
        <ProgressSyncManager />
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-display" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false });
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "whatsapp — Go + React. Built with Grit.",
  description: "A full-stack framework that combines Go backend with Next.js frontend. Build fast, ship faster.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dataTheme = process.env.NEXT_PUBLIC_THEME || "atlas";

  return (
    <html lang="en" data-theme={dataTheme} suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
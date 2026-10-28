import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";

const inter = Inter({ subsets: ["latin"], variable: "--font-display" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", preload: false });
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp",
  // Yours to write. This is the sentence a search result and a link preview
  // show under the name, and it shipped for a long time as Grit's description
  // of itself, which described the framework on somebody else's product.
  description: "Direct and group chats with live delivery, read receipts and photos, on the web, a phone and the desktop.",
  // <meta name="generator" content="Grit">, the convention every static site
  // generator and CMS uses and the one technology scanners read. No version:
  // knowing an app is a Grit app is fine, and knowing which release it is
  // running is a list of that release's advisories. Delete the line to opt out.
  generator: "Grit",
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
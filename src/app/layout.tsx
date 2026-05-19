import type { Metadata, Viewport } from "next";
import { Roboto_Flex, Roboto_Mono } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0a0a0a" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

const sans = Roboto_Flex({
  subsets: ["latin"],
  variable: "--font-sans",
  axes: ["opsz"],
  display: "swap",
});

const mono = Roboto_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OpenCoffer",
  description:
    "Self-hosted personal-finance with bring-your-own-LLM and a built-in MCP server.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-surface text-on-surface antialiased">{children}</body>
    </html>
  );
}

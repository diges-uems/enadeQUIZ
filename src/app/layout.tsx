import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// ─── Local Fonts (self-hosted) ────────────────────────────────────
// IMPORTANT: We use next/font/local instead of next/font/google so the
// build does NOT need network access to fonts.googleapis.com at build
// time. Many production/CI build environments block external network
// access, which would cause `next/font/google` to fail with
// "Failed to fetch `Inter` from Google Fonts" and break the deploy.
// The .ttf files live in /public/fonts/ and ship with the bundle.
const inter = localFont({
  src: [
    { path: "../../public/fonts/inter-300.ttf", weight: "300", style: "normal" },
    { path: "../../public/fonts/inter-400.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/inter-500.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/inter-600.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/inter-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-inter",
  display: "swap",
});

const spaceGrotesk = localFont({
  src: [
    { path: "../../public/fonts/space-grotesk-300.ttf", weight: "300", style: "normal" },
    { path: "../../public/fonts/space-grotesk-400.ttf", weight: "400", style: "normal" },
    { path: "../../public/fonts/space-grotesk-500.ttf", weight: "500", style: "normal" },
    { path: "../../public/fonts/space-grotesk-600.ttf", weight: "600", style: "normal" },
    { path: "../../public/fonts/space-grotesk-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ENADE Quiz — UEMS/DIGES",
  description: "Sistema de votação em tempo real para questões do ENADE. Apresentações interativas com QR Code e gráficos ao vivo.",
  keywords: ["ENADE", "UEMS", "DIGES", "quiz", "votação", "tempo real"],
  authors: [{ name: "UEMS/DIGES" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.png", type: "image/png", sizes: "64x64" },
    ],
    shortcut: "/favicon.ico",
    apple: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: 'var(--font-inter)' }}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}

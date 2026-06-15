import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ENADE Quiz — UEMS/DIGES",
  description: "Sistema de votação em tempo real para questões do ENADE. Apresentações interativas com QR Code e gráficos ao vivo.",
  keywords: ["ENADE", "UEMS", "DIGES", "quiz", "votação", "tempo real"],
  authors: [{ name: "UEMS/DIGES" }],
  icons: {
    icon: "/logo.svg",
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

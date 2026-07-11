import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { AuthProvider } from "@/components/auth-context";
import { CookiePreferences } from "@/components/cookie-preferences";
import "./globals.css";

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

const manrope = Manrope({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestor Universitário | Turmas",
  description: "Painel de gestão das turmas da Comissão de Curso FMUP 2025–2031.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body className={`${inter.variable} ${manrope.variable}`}><AuthProvider>{children}<CookiePreferences /></AuthProvider></body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GRAIN — задачник ЧПУ",
  description: "Черга робіт фрезерування для рекламної компанії GRAIN",
};

export const viewport: Viewport = {
  themeColor: "#0b1a2b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body className="antialiased">{children}</body>
    </html>
  );
}

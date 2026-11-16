import type { Metadata } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "@board/components/ui/toaster";
import "./board.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
  display: "swap",
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "360 Cloud Board",
  description: "Internal system of record for work and customer interaction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${plusJakarta.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-surface text-ink antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}

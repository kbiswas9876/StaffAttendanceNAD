import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import NavigationWrapper from "./NavigationWrapper";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Metro Railway Kolkata S&T ERP",
  description: "Centralized Enterprise Resource Planning (ERP) System for Signalling and Telecommunication Department, Metro Railway Kolkata.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full scroll-smooth">
      <body className={`${outfit.className} h-full bg-[#FAF9F6] text-[#191919] antialiased`}>
        <NavigationWrapper>{children}</NavigationWrapper>
      </body>
    </html>
  );
}

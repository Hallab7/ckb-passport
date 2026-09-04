import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CKB Passport PoC",
  description: "Guided testnet demo for Sign-In with CKB DID.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

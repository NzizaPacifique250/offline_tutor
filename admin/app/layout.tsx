import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Clevo AI",
  description: "Clevo AI for teachers and admins: progress synced from the tablets, accounts, classes and lessons.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}

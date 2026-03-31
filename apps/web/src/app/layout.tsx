import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Skynet Telegram CRM",
  description:
    "CRM điều hành Telegram cho campaign, moderation, autopost và vận hành group.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}

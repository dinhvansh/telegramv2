import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/context/toast-context";
import { ToastContainer } from "@/components/toast-container";

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
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ToastProvider>
          {children}
          <ToastContainer />
        </ToastProvider>
      </body>
    </html>
  );
}

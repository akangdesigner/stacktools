import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import AuthProvider from "@/components/AuthProvider";
import ChatBot from "@/components/ChatBot";
import Breadcrumb from "@/components/ui/Breadcrumb";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stacktools",
  description: "小積木的工具箱",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // LIFF 頁（/liff 開頭，由 proxy.ts 帶入 x-pathname）走純淨全螢幕，
  // 不套用工具箱外框（側邊欄／麵包屑／聊天機器人）
  const pathname = (await headers()).get("x-pathname") || "";
  const bare = pathname.startsWith("/liff");

  return (
    <html
      lang="zh-TW"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      style={{ colorScheme: 'light' }}
    >
      {bare ? (
        <body className="min-h-screen">{children}</body>
      ) : (
        <body className="min-h-screen flex bg-gray-50">
          <AuthProvider>
            <Sidebar />
            <main className="flex-1 overflow-auto flex flex-col">
              <Breadcrumb />
              {children}
            </main>
            <ChatBot />
          </AuthProvider>
        </body>
      )}
    </html>
  );
}

import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LeakShield - Security Command Center",
  description: "Enterprise AI Firewall Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-gray-950 text-gray-100 antialiased flex min-h-screen`}>
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="h-16 flex items-center px-8 border-b border-gray-800 bg-gray-900/50 backdrop-blur-md sticky top-0 z-10">
            <h1 className="text-lg font-semibold text-gray-200">Security Command Center</h1>
          </div>
          <div className="p-8">
            {children}
          </div>
        </main>
      </body>
    </html>
  );
}

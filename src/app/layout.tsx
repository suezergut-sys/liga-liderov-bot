import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Лига лидеров — пульт игры",
  description: "Панель управления командной финансовой игрой",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}

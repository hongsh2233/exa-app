import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HWP → MD 편집기",
  description: "HWP 5.0 문서를 Markdown으로 바꾸고 편집하는 웹 편집기",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

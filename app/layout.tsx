import type { Metadata } from "next";
import "./globals.css";
import { Shell } from "./ui/shell";

export const metadata: Metadata = {
  title: "Neo AVO",
  description: "Observe-first operations hub",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}

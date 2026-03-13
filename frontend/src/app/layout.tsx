import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";

// Heading font: Space Grotesk (tech-startup pairing from UI spec).
// The `variable` prop injects a CSS custom property used in globals.css.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
});

// Body font: DM Sans (tech-startup pairing from UI spec).
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Tasklog",
  description: "Personal task management",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Inject font CSS variables onto the body so globals.css can reference them. */}
      <body
        className={`${spaceGrotesk.variable} ${dmSans.variable} antialiased min-h-screen bg-zinc-50`}
      >
        {/* Site header */}
        <header className="border-b border-zinc-200 bg-white">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <a
              href="/"
              className="font-heading text-xl font-semibold text-zinc-900 hover:text-blue-600 transition-colors duration-150"
              style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
            >
              Tasklog
            </a>
          </div>
        </header>

        {/* Page content */}
        <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}

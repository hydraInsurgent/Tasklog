import type { Metadata } from "next";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";
import { DoppelWidget } from "@/components/DoppelWidget";
import { TimeTrackingProvider } from "@/contexts/TimeTrackingContext";
import TrackingBar from "@/components/TrackingBar";

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
        className={`${spaceGrotesk.variable} ${dmSans.variable} antialiased min-h-screen bg-surface-raised`}
      >
        {/* Site header */}
        <header className="border-b border-border bg-surface">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <a
              href="/"
              className="font-heading text-xl font-semibold text-text-primary hover:text-accent transition-colors duration-150"
              style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
            >
              Tasklog
            </a>
          </div>
        </header>

        {/* Page content. TimeTrackingProvider shares the running timer with every page +
            the floating TrackingBar (#77). */}
        <TimeTrackingProvider>
          <main className="max-w-6xl mx-auto px-4 py-8">{children}</main>
          <TrackingBar />
        </TimeTrackingProvider>

        {/* Doppel - Manu's digital self. Fixed bottom-right, does not affect layout. */}
        <DoppelWidget />
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, DM_Sans } from "next/font/google";
import "./globals.css";
import { DoppelWidget } from "@/components/DoppelWidget";
import { TimeTrackingProvider } from "@/contexts/TimeTrackingContext";
import TrackingBar from "@/components/TrackingBar";
import ThemeToggle from "@/components/ThemeToggle";
import NavTabs from "@/components/NavTabs";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["500", "600", "700"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "Tasklog",
  description: "Personal task management",
};

// Reads localStorage before hydration to apply the saved theme class immediately,
// preventing a flash of the wrong theme on load. Light is the default: dark applies
// ONLY when the user has explicitly chosen it via the toggle (no OS-preference
// fallback - a first-time visitor always gets light).
const themeScript = `(function(){try{if(localStorage.getItem('tasklog:theme')==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${spaceGrotesk.variable} ${dmSans.variable} antialiased min-h-screen bg-bg`}>
        {/* Site header */}
        <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur-sm">
          <div className="px-4 h-14 flex items-center gap-3">
            {/* Client-side Link, NOT a raw <a>: a full-page reload here re-boots
                the theme script, and if localStorage is unavailable (some mobile
                browsers / private mode) that reload silently dropped dark mode.
                Link navigation keeps the <html> class untouched. On phones the
                wordmark shrinks to "T" so all four tabs fit without scrolling. */}
            <Link
              href="/"
              aria-label="Tasklog home"
              className="shrink-0 font-heading text-lg font-bold text-text-primary hover:text-accent transition-colors duration-150"
            >
              T<span className="hidden sm:inline">asklog</span>
            </Link>
            {/* min-w-0 lets the tab strip shrink inside the flex row instead of
                widening the page (the Sage tab made 4 tabs overflow on phones). */}
            <div className="flex-1 min-w-0 flex justify-center">
              <NavTabs />
            </div>
            <ThemeToggle />
          </div>
        </header>

        <TimeTrackingProvider>
          {/* Full-width shell. Each page sets its own reading width (document pages
              like Journal/Time/Labels center themselves with max-w-* mx-auto); the
              Tasks app-shell uses the full width so its table shows every column. */}
          <main className="px-4 pt-6 pb-28">{children}</main>
          <TrackingBar />
        </TimeTrackingProvider>

        <DoppelWidget />
      </body>
    </html>
  );
}

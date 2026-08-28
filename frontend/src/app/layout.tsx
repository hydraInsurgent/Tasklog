import type { Metadata } from "next";
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
            <a
              href="/"
              className="font-heading text-lg font-bold text-text-primary hover:text-accent transition-colors duration-150"
            >
              Tasklog
            </a>
            <div className="flex-1 flex justify-center">
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

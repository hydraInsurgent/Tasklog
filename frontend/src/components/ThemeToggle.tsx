"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("tasklog:theme", next ? "dark" : "light"); } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center justify-center w-9 h-9 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-accent transition-colors duration-150 cursor-pointer"
    >
      {dark
        ? <Sun size={17} aria-hidden="true" />
        : <Moon size={17} aria-hidden="true" />
      }
    </button>
  );
}

'use client';

import { Monitor, Moon, Sun } from 'lucide-react';

export function ThemeIcon({
  theme,
  className = 'h-4 w-4',
}: {
  theme: 'light' | 'dark' | 'system';
  className?: string;
}) {
  if (theme === 'light') {
    return <Sun className={className} aria-hidden />;
  }
  if (theme === 'dark') {
    return <Moon className={className} aria-hidden />;
  }
  return <Monitor className={className} aria-hidden />;
}

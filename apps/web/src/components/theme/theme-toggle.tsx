'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { ThemeIcon } from './theme-icon';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const current = (theme ?? 'system') as 'light' | 'dark' | 'system';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground transition hover:bg-muted"
        aria-label="Change color theme"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {mounted ? (
          <ThemeIcon theme={current === 'system' ? ((resolvedTheme as 'light' | 'dark') ?? 'light') : current} />
        ) : (
          <ThemeIcon theme="system" />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Color theme options"
          className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-xl border border-border bg-card p-1 shadow-[var(--shadow)]"
        >
          {OPTIONS.map((option) => {
            const selected = current === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-muted ${
                  selected ? 'bg-muted font-semibold text-primary' : 'text-foreground'
                }`}
                onClick={() => {
                  setTheme(option.value);
                  setOpen(false);
                }}
              >
                <ThemeIcon theme={option.value} />
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

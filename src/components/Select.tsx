"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * A dropdown that belongs to this interface.
 *
 * A native `<select>` takes its open list from the operating system: light grey panel, system font,
 * system highlight colour. On a dark, typographically deliberate page it is the one element that
 * looks like it wandered in from another application, and no amount of styling the closed state
 * fixes the open one, because the popup is not ours to style.
 *
 * So the list is rendered here. That means owning the parts the platform was giving away for free —
 * keyboard navigation, focus return, dismissal, and the ARIA that makes it a listbox to a screen
 * reader rather than a pile of divs.
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Second line, for the detail that would otherwise bloat the label. */
  hint?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    // Closing on scroll rather than repositioning: the list is anchored to the trigger, and a
    // detached popup floating over unrelated content is worse than one that gets out of the way.
    const onScroll = () => setOpen(false);

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function commit(index: number) {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        setActive(Math.max(0, options.findIndex((o) => o.value === value)));
        setOpen(true);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(active);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(options.length - 1, i + 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(options.length - 1);
    }
  }

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          setActive(Math.max(0, options.findIndex((o) => o.value === value)));
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between gap-2 rounded border bg-basalt-950 px-2.5 py-1.5 text-left text-sm transition-colors ${
          open ? "border-verdigris-500/60" : "border-basalt-700 hover:border-basalt-600"
        }`}
      >
        <span className={`min-w-0 truncate ${selected ? "text-bone-100" : "text-bone-500"}`}>
          {selected?.label ?? placeholder}
        </span>
        <svg
          viewBox="0 0 12 12"
          className={`h-3 w-3 shrink-0 text-bone-500 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          tabIndex={-1}
          className="absolute z-50 mt-1 max-h-72 w-full min-w-max overflow-y-auto rounded-lg border border-basalt-700 bg-basalt-900 py-1 shadow-2xl shadow-black/60"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => commit(index)}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors ${
                    index === active ? "bg-basalt-800" : ""
                  }`}
                >
                  <span
                    className={`mt-[3px] w-3 shrink-0 font-mono text-[10px] ${
                      isSelected ? "text-verdigris-400" : "text-transparent"
                    }`}
                    aria-hidden
                  >
                    ✓
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm ${isSelected ? "text-bone-50" : "text-bone-200"}`}>
                      {option.label}
                    </span>
                    {option.hint ? (
                      <span className="mt-0.5 block font-mono text-[10px] text-bone-500">{option.hint}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

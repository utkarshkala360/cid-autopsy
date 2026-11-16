"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

// Chip-style label editor. `suggestions` is the Team's full set of
// previously-used labels (see WorkItem.distinct("labels", ...) in the
// server pages) so a label typed once is reusable — not re-typed from
// scratch — everywhere else in the Team.
export function LabelsInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a label…",
  className = "",
}: {
  value: string[];
  onChange: (labels: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addLabel(raw: string) {
    const label = raw.trim();
    if (!label || value.length >= 20) {
      setText("");
      return;
    }
    if (value.some((l) => l.toLowerCase() === label.toLowerCase())) {
      setText("");
      return;
    }
    onChange([...value, label]);
    setText("");
  }

  function removeLabel(label: string) {
    onChange(value.filter((l) => l !== label));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addLabel(text);
    } else if (e.key === "Backspace" && text === "" && value.length > 0) {
      removeLabel(value[value.length - 1]);
    }
  }

  const filteredSuggestions = useMemo(() => {
    const selected = new Set(value.map((l) => l.toLowerCase()));
    const query = text.trim().toLowerCase();
    return suggestions
      .filter((s) => !selected.has(s.toLowerCase()))
      .filter((s) => !query || s.toLowerCase().includes(query))
      .slice(0, 8);
  }, [suggestions, value, text]);

  return (
    <div className={`relative ${className}`}>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 focus-within:border-primary focus-within:outline-none focus-within:ring-1 focus-within:ring-primary"
      >
        {value.map((label) => (
          <span
            key={label}
            className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-slate"
          >
            {label}
            <button
              type="button"
              onClick={() => removeLabel(label)}
              className="text-slate hover:text-ink"
              aria-label={`Remove ${label}`}
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            addLabel(text);
            setOpen(false);
          }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-24 flex-1 bg-transparent text-sm text-ink placeholder:text-slate focus:outline-none"
        />
      </div>
      {open && filteredSuggestions.length > 0 && (
        <div className="radix-content absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-panel shadow-md">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addLabel(s);
              }}
              className="block w-full px-2.5 py-1.5 text-left text-xs text-ink hover:bg-muted"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

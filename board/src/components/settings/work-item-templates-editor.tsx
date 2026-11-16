"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Check, X, Pencil } from "lucide-react";

export type TemplateRow = {
  id: string;
  key: string;
  label: string;
  requiresCustomer: boolean;
};

const inputClass =
  "h-8 rounded-md border border-border bg-surface px-2 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function slugify(label: string) {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// WT-1/WT-2 (Phase 16, Design 3): same CRUD-table shape as
// CustomFieldsEditor/WorkflowEditor — a Zod-validated list, add/rename/
// toggle/remove, referential-integrity check on delete surfaced as a real
// server error rather than a silent no-op.
export function WorkItemTemplatesEditor({ initialTemplates }: { initialTemplates: TemplateRow[] }) {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateRow[]>(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRequiresCustomer, setNewRequiresCustomer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function addTemplate() {
    setError(null);
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const key = slugify(trimmed);
    setPending(true);
    const res = await fetch("/dashboard/board/api/work-item-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, label: trimmed, requiresCustomer: newRequiresCustomer }),
    });
    setPending(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    const data = await res.json();
    setTemplates((prev) => [
      ...prev,
      {
        id: String(data.template._id),
        key: data.template.key,
        label: data.template.label,
        requiresCustomer: data.template.requiresCustomer,
      },
    ]);
    setNewLabel("");
    setNewRequiresCustomer(false);
    router.refresh();
  }

  async function saveLabel(id: string) {
    const trimmed = draftLabel.trim();
    if (!trimmed) return;
    setError(null);
    const res = await fetch(`/dashboard/board/api/work-item-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: trimmed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, label: trimmed } : t)));
    setEditingId(null);
    router.refresh();
  }

  async function toggleRequiresCustomer(id: string, next: boolean) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/work-item-templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requiresCustomer: next }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }
    setTemplates((prev) => prev.map((t) => (t.id === id ? { ...t, requiresCustomer: next } : t)));
    router.refresh();
  }

  async function removeTemplate(id: string) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/work-item-templates/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't delete that template.");
      return;
    }
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <p className="text-xs text-slate">No templates yet — add one below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
                <th className="pb-2 pr-4 font-semibold">Key</th>
                <th className="pb-2 pr-4 font-semibold">Label</th>
                <th className="pb-2 pr-4 font-semibold">Requires Customer</th>
                <th className="pb-2 pr-4 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="py-2.5 pr-4 font-mono text-xs text-slate">{t.key}</td>
                  <td className="py-2.5 pr-4">
                    {editingId === t.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={draftLabel}
                          onChange={(e) => setDraftLabel(e.target.value)}
                          className={`${inputClass} w-40`}
                        />
                        <button
                          type="button"
                          aria-label="Save label"
                          onClick={() => saveLabel(t.id)}
                          className="rounded-md p-1 text-status-done hover:bg-status-done-bg"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel"
                          onClick={() => setEditingId(null)}
                          className="rounded-md p-1 text-slate hover:bg-muted"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-ink">{t.label}</span>
                        <button
                          type="button"
                          aria-label={`Rename ${t.label}`}
                          onClick={() => {
                            setEditingId(t.id);
                            setDraftLabel(t.label);
                          }}
                          className="rounded-md p-1 text-slate hover:bg-muted hover:text-ink"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={t.requiresCustomer}
                      aria-label="Requires Customer"
                      onClick={() => toggleRequiresCustomer(t.id, !t.requiresCustomer)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                        t.requiresCustomer ? "bg-primary" : "bg-muted"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-panel shadow-xs transition-transform ${
                          t.requiresCustomer ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="py-2.5 pr-4">
                    <button
                      type="button"
                      aria-label={`Delete ${t.label}`}
                      onClick={() => removeTemplate(t.id)}
                      className="text-slate hover:text-status-blocked"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">New template label</label>
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Deal"
            className={`${inputClass} w-44`}
          />
        </div>
        <label className="flex h-8 items-center gap-1.5 text-xs font-medium text-ink">
          <input
            type="checkbox"
            checked={newRequiresCustomer}
            onChange={(e) => setNewRequiresCustomer(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border"
          />
          Requires Customer
        </label>
        <button
          type="button"
          onClick={addTemplate}
          disabled={pending || !newLabel.trim()}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Add template
        </button>
      </div>

      {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
    </div>
  );
}

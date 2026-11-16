"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Check, X, Pencil, ArrowUpRight } from "lucide-react";

export type CustomerTemplateRow = {
  id: string;
  key: string;
  label: string;
  description: string;
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

// Org-Admin-managed registry of Customer Templates (one per product/line of
// business), same CRUD-table shape as WorkItemTemplatesEditor — a new
// product is pure config, not a new code path (Non-Negotiable #6). Each
// row's field structure (the actual "pre-filled fields") is managed on its
// own detail page, not inline here — a template can have many fields, same
// reason CustomFieldsEditor lives on its own settings screen rather than
// inline in a table row.
export function CustomerTemplatesEditor({
  initialTemplates,
}: {
  initialTemplates: CustomerTemplateRow[];
}) {
  const router = useRouter();
  const [templates, setTemplates] = useState<CustomerTemplateRow[]>(initialTemplates);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function addTemplate() {
    setError(null);
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    const key = slugify(trimmed);
    setPending(true);
    const res = await fetch("/dashboard/board/api/customer-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, label: trimmed, description: newDescription.trim() }),
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
        description: data.template.description ?? "",
      },
    ]);
    setNewLabel("");
    setNewDescription("");
    router.refresh();
  }

  async function saveLabel(id: string) {
    const trimmed = draftLabel.trim();
    if (!trimmed) return;
    setError(null);
    const res = await fetch(`/dashboard/board/api/customer-templates/${id}`, {
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

  async function removeTemplate(id: string) {
    setError(null);
    const res = await fetch(`/dashboard/board/api/customer-templates/${id}`, { method: "DELETE" });
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
        <p className="text-xs text-slate">No Customer Templates yet — add one below.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-slate">
                <th className="pb-2 pr-4 font-semibold">Key</th>
                <th className="pb-2 pr-4 font-semibold">Label</th>
                <th className="pb-2 pr-4 font-semibold">Description</th>
                <th className="pb-2 pr-4 font-semibold">Fields</th>
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
                  <td className="py-2.5 pr-4 text-slate">{t.description || "—"}</td>
                  <td className="py-2.5 pr-4">
                    <Link
                      href={`/dashboard/board/settings/customer-templates/${t.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-hover"
                    >
                      Manage fields
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
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
            placeholder="e.g. SaaS Pro"
            className={`${inputClass} w-44`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Description (optional)</label>
          <input
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            placeholder="e.g. Cloud subscription customers"
            className={`${inputClass} w-56`}
          />
        </div>
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

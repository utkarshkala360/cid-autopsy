"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Select, SelectOption } from "@board/components/ui/select";
import { CustomFieldInput, type FieldDef } from "@board/components/work-items/custom-field-input";

const inputClass =
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-ink placeholder:text-slate focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

// CU-1 + Customer Templates: name + primary contact(s), same as before, plus
// an optional product template. Selecting one fetches that template's field
// defs and pre-fills each from its configured default — still editable
// before submit. `CustomFieldInput`/`FieldDef` are reused as-is from the
// Work Item create form; nothing here is Work-Item-specific about them.
export function CreateCustomerForm({
  templates,
  orgMembers,
}: {
  templates: { id: string; label: string }[];
  orgMembers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    fetch(`/dashboard/board/api/customer-templates/${templateId}/fields`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const defs: FieldDef[] = (data.fields ?? []).map(
          (f: { _id: string; key: string; label: string; fieldType: FieldDef["fieldType"]; options?: string[] }) => ({
            id: f._id,
            key: f.key,
            label: f.label,
            fieldType: f.fieldType,
            options: f.options,
          })
        );
        setFields(defs);
        const defaults: Record<string, string> = {};
        for (const f of data.fields ?? []) {
          if (f.defaultValue !== undefined && f.defaultValue !== null) {
            defaults[f.key] = String(f.defaultValue);
          }
        }
        setCustomFieldValues(defaults);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (!id) {
      setFields([]);
      setCustomFieldValues({});
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const contacts = contactName.trim()
      ? [{ name: contactName.trim(), email: contactEmail.trim(), phone: contactPhone.trim() }]
      : [];

    const res = await fetch("/dashboard/board/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        contacts,
        customerTemplateId: templateId || undefined,
        customFields: templateId ? customFieldValues : undefined,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    setName("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setTemplateId("");
    setFields([]);
    setCustomFieldValues({});
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Customer name (e.g. Acme Corp)"
          required
          className={inputClass}
        />
        <input
          value={contactName}
          onChange={(e) => setContactName(e.target.value)}
          placeholder="Primary contact name (optional)"
          className={inputClass}
        />
        <input
          value={contactEmail}
          onChange={(e) => setContactEmail(e.target.value)}
          placeholder="Contact email (optional)"
          className={inputClass}
        />
        <input
          value={contactPhone}
          onChange={(e) => setContactPhone(e.target.value)}
          placeholder="Contact phone (optional)"
          className={inputClass}
        />
      </div>

      {templates.length > 0 && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Product template (optional)</label>
          <Select
            value={templateId || "__none__"}
            onValueChange={(v) => handleTemplateChange(v === "__none__" ? "" : v)}
            className={inputClass}
          >
            <SelectOption value="__none__">No template</SelectOption>
            {templates.map((t) => (
              <SelectOption key={t.id} value={t.id}>
                {t.label}
              </SelectOption>
            ))}
          </Select>
        </div>
      )}

      {fields.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate">
            Template fields
          </div>
          <div className="grid grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                <label className="text-xs font-medium text-ink">{field.label}</label>
                <CustomFieldInput
                  field={field}
                  value={customFieldValues[field.key] ?? ""}
                  onChange={(v) => setCustomFieldValues((prev) => ({ ...prev, [field.key]: v }))}
                  teamMembers={orgMembers}
                  mentionCandidates={orgMembers}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" />
        Create Customer
      </button>
    </form>
  );
}

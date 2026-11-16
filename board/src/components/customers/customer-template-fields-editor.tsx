"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import {
  CUSTOM_FIELD_TYPES,
  CUSTOM_FIELD_TYPE_LABEL,
  type CustomFieldType,
} from "@board/lib/status-categories";
import { Select, SelectOption } from "@board/components/ui/select";

export type CustomerTemplateFieldRow = {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options?: string[];
  defaultValue?: string | number | boolean;
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

// Per-CustomerTemplate field editor — same add/remove shape as
// CustomFieldsEditor (Work Items' equivalent), scoped by customerTemplateId
// instead of teamId+type. The one addition: a "Default value" input per new
// field, which is what actually pre-fills the create-Customer form when
// this template is selected — not offered for user_picker (defaulting to a
// specific Member doesn't generalize across an org-wide template the way it
// does for a Team-scoped assignee field).
export function CustomerTemplateFieldsEditor({
  templateId,
  initialFields,
}: {
  templateId: string;
  initialFields: CustomerTemplateFieldRow[];
}) {
  const router = useRouter();
  const [fields, setFields] = useState<CustomerTemplateFieldRow[]>(initialFields);
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");
  const [defaultValueText, setDefaultValueText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parsedOptions = optionsText
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  async function addField() {
    setError(null);
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = slugify(trimmed);

    let defaultValue: string | number | undefined;
    if (defaultValueText.trim()) {
      defaultValue = fieldType === "number" ? Number(defaultValueText) : defaultValueText.trim();
    }

    setPending(true);
    const res = await fetch(`/dashboard/board/api/customer-templates/${templateId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key,
        label: trimmed,
        fieldType,
        options: fieldType === "dropdown" ? parsedOptions : undefined,
        defaultValue,
      }),
    });
    setPending(false);

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong.");
      return;
    }

    const data = await res.json();
    setFields((prev) => [
      ...prev,
      {
        id: String(data.field._id),
        key: data.field.key,
        label: data.field.label,
        fieldType: data.field.fieldType,
        options: data.field.options,
        defaultValue: data.field.defaultValue,
      },
    ]);
    setLabel("");
    setOptionsText("");
    setDefaultValueText("");
    router.refresh();
  }

  async function removeField(fieldId: string) {
    const res = await fetch(`/dashboard/board/api/customer-templates/${templateId}/fields/${fieldId}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      {fields.length > 0 && (
        <ul className="space-y-1.5">
          {fields.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between rounded-md border border-border bg-surface/60 px-3 py-2"
            >
              <div className="text-xs">
                <span className="font-medium text-ink">{f.label}</span>{" "}
                <span className="text-slate">
                  ({CUSTOM_FIELD_TYPE_LABEL[f.fieldType]}
                  {f.options?.length ? `: ${f.options.join(", ")}` : ""}
                  {f.defaultValue !== undefined && f.defaultValue !== "" ? ` · default: ${f.defaultValue}` : ""})
                </span>
              </div>
              <button
                type="button"
                aria-label={`Remove ${f.label}`}
                onClick={() => removeField(f.id)}
                className="text-slate hover:text-status-blocked"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Field label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Plan Tier"
            className={`${inputClass} w-44`}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-ink">Type</label>
          <Select
            value={fieldType}
            onValueChange={(v) => {
              setFieldType(v as CustomFieldType);
              setDefaultValueText("");
            }}
            className={inputClass}
          >
            {CUSTOM_FIELD_TYPES.map((t) => (
              <SelectOption key={t} value={t}>
                {CUSTOM_FIELD_TYPE_LABEL[t]}
              </SelectOption>
            ))}
          </Select>
        </div>
        {fieldType === "dropdown" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Options (comma-separated)</label>
            <input
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              placeholder="Starter, Pro, Enterprise"
              className={`${inputClass} w-56`}
            />
          </div>
        )}
        {fieldType !== "user_picker" && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink">Default value (optional)</label>
            {fieldType === "dropdown" ? (
              <Select
                value={defaultValueText}
                onValueChange={setDefaultValueText}
                className={`${inputClass} w-44`}
              >
                <SelectOption value="">No default</SelectOption>
                {parsedOptions.map((o) => (
                  <SelectOption key={o} value={o}>
                    {o}
                  </SelectOption>
                ))}
              </Select>
            ) : (
              <input
                value={defaultValueText}
                onChange={(e) => setDefaultValueText(e.target.value)}
                type={fieldType === "number" ? "number" : fieldType === "date" ? "date" : "text"}
                className={`${inputClass} w-40`}
              />
            )}
          </div>
        )}
        <button
          type="button"
          onClick={addField}
          disabled={pending}
          className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-3.5 w-3.5" />
          Add field
        </button>
      </div>

      {error && <p className="text-xs font-medium text-status-blocked">{error}</p>}
    </div>
  );
}

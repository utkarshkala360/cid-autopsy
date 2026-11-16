import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { CustomFieldDef, type CustomFieldDefDoc } from "@board/models/CustomFieldDef";

export async function getFieldDefs(
  teamId: string,
  type: string
): Promise<CustomFieldDefDoc[]> {
  await connectDB();
  return CustomFieldDef.find({ teamId, type }).sort({ createdAt: 1 }).lean<CustomFieldDefDoc[]>();
}

type FieldDefLike = {
  key: string;
  label: string;
  fieldType: string;
  options?: string[] | null;
};

/**
 * Validates/coerces a submitted customFields payload against the Team's
 * field definitions for a Work Item type. Unknown keys are rejected outright
 * — a custom field must be defined by a Team Admin before it can be set.
 */
export function validateCustomFieldValues(
  defs: FieldDefLike[],
  input: Record<string, unknown>
): { ok: true; values: Record<string, unknown> } | { ok: false; error: string } {
  const defByKey = new Map(defs.map((d) => [d.key, d]));
  const values: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(input)) {
    const def = defByKey.get(key);
    if (!def) {
      return { ok: false, error: `"${key}" is not a defined custom field for this Work Item type.` };
    }

    if (raw === null || raw === "" || raw === undefined) {
      values[key] = null;
      continue;
    }

    switch (def.fieldType) {
      case "text":
        values[key] = String(raw);
        break;
      case "number": {
        const n = Number(raw);
        if (!Number.isFinite(n)) {
          return { ok: false, error: `"${def.label}" must be a number.` };
        }
        values[key] = n;
        break;
      }
      case "dropdown":
        if (!def.options?.includes(String(raw))) {
          return {
            ok: false,
            error: `"${def.label}" must be one of: ${def.options?.join(", ") ?? "(no options configured)"}.`,
          };
        }
        values[key] = String(raw);
        break;
      case "date": {
        const d = new Date(String(raw));
        if (Number.isNaN(d.getTime())) {
          return { ok: false, error: `"${def.label}" must be a valid date.` };
        }
        values[key] = d.toISOString();
        break;
      }
      case "user_picker":
        if (!mongoose.isValidObjectId(raw)) {
          return { ok: false, error: `"${def.label}" must reference a valid Member.` };
        }
        values[key] = String(raw);
        break;
      default:
        return { ok: false, error: `Unsupported field type for "${key}".` };
    }
  }

  return { ok: true, values };
}

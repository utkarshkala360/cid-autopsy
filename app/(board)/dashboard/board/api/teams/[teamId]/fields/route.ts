import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { getFieldDefs } from "@board/lib/custom-fields";
import { connectDB } from "@board/lib/mongodb";
import { CustomFieldDef } from "@board/models/CustomFieldDef";
import { CUSTOM_FIELD_TYPES } from "@board/lib/status-categories";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const type = (request.nextUrl.searchParams.get("type") || "task").toLowerCase();
  const fields = await getFieldDefs(teamId, type);
  return NextResponse.json({ fields });
}

const createSchema = z
  .object({
    type: z.string().trim().toLowerCase().min(1).max(40),
    key: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, or underscores."),
    label: z.string().trim().min(1).max(60),
    fieldType: z.enum(CUSTOM_FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
  })
  .refine((data) => data.fieldType !== "dropdown" || (data.options && data.options.length > 0), {
    message: "Dropdown fields need at least one option.",
    path: ["options"],
  });

// Team Admin (or Org Admin, inherited) only — WF-2.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid field." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  await connectDB();
  const existing = await CustomFieldDef.findOne({ teamId, type: data.type, key: data.key });
  if (existing) {
    return NextResponse.json(
      { error: `A field with key "${data.key}" already exists for this Work Item type.` },
      { status: 400 }
    );
  }

  const field = await CustomFieldDef.create({
    teamId,
    type: data.type,
    key: data.key,
    label: data.label,
    fieldType: data.fieldType,
    options: data.fieldType === "dropdown" ? data.options : undefined,
    createdBy: authz.member._id,
  });

  return NextResponse.json({ field }, { status: 201 });
}

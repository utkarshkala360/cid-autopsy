import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { getCustomerTemplateFieldDefs } from "@board/lib/customer-templates";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateDef } from "@board/models/CustomerTemplateDef";
import { CustomerTemplateFieldDef } from "@board/models/CustomerTemplateFieldDef";
import { CUSTOM_FIELD_TYPES } from "@board/lib/status-categories";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { templateId } = await params;
  if (!mongoose.isValidObjectId(templateId)) {
    return NextResponse.json({ fields: [] });
  }

  await connectDB();
  const template = await CustomerTemplateDef.findOne({
    _id: templateId,
    organizationId: member.organizationId,
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const fields = await getCustomerTemplateFieldDefs(templateId);
  return NextResponse.json({ fields });
}

const createSchema = z
  .object({
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
    defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .refine((data) => data.fieldType !== "dropdown" || (data.options && data.options.length > 0), {
    message: "Dropdown fields need at least one option.",
    path: ["options"],
  })
  .refine(
    (data) =>
      data.fieldType !== "dropdown" ||
      data.defaultValue === undefined ||
      data.options?.includes(String(data.defaultValue)),
    { message: "Default value must be one of the dropdown's options.", path: ["defaultValue"] }
  );

// Org Admin only — a product's field structure is an org-wide decision, same
// floor CustomerTemplateDef itself (and StageTrack) already use.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { templateId } = await params;
  if (!mongoose.isValidObjectId(templateId)) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
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
  const template = await CustomerTemplateDef.findOne({
    _id: templateId,
    organizationId: authz.member.organizationId,
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const existing = await CustomerTemplateFieldDef.findOne({
    customerTemplateId: templateId,
    key: data.key,
  });
  if (existing) {
    return NextResponse.json(
      { error: `A field with key "${data.key}" already exists for this template.` },
      { status: 400 }
    );
  }

  const field = await CustomerTemplateFieldDef.create({
    customerTemplateId: templateId,
    key: data.key,
    label: data.label,
    fieldType: data.fieldType,
    options: data.fieldType === "dropdown" ? data.options : undefined,
    defaultValue: data.defaultValue,
    createdBy: authz.member._id,
  });

  return NextResponse.json({ field }, { status: 201 });
}

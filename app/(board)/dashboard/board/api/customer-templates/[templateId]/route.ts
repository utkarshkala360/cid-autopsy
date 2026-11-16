import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateDef } from "@board/models/CustomerTemplateDef";
import { CustomerTemplateFieldDef } from "@board/models/CustomerTemplateFieldDef";
import { Customer } from "@board/models/Customer";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  description: z.string().trim().max(500).optional(),
});

// `key` is deliberately not editable here — same "identity fields don't get
// a rename API" precedent WorkItemTemplateDef.key already sets.
export async function PATCH(
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
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || (parsed.data.label === undefined && parsed.data.description === undefined)) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const template = await CustomerTemplateDef.findOne({
    _id: templateId,
    organizationId: authz.member.organizationId,
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  if (parsed.data.label !== undefined) template.label = parsed.data.label;
  if (parsed.data.description !== undefined) template.description = parsed.data.description;
  await template.save();

  return NextResponse.json({ template });
}

// Blocked with a 409 + count if any Customer still references this template
// — same referential-integrity style WorkItemTemplateDef's Team-usage check
// (and StageTrack's stage-removal check) already use.
export async function DELETE(
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

  await connectDB();
  const template = await CustomerTemplateDef.findOne({
    _id: templateId,
    organizationId: authz.member.organizationId,
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const customersUsingIt = await Customer.countDocuments({
    organizationId: authz.member.organizationId,
    customerTemplateId: templateId,
  });
  if (customersUsingIt > 0) {
    return NextResponse.json(
      {
        error: `${customersUsingIt} Customer${customersUsingIt === 1 ? "" : "s"} still use${
          customersUsingIt === 1 ? "s" : ""
        } this template — it can't be deleted while in use.`,
      },
      { status: 409 }
    );
  }

  // Field defs are only meaningful attached to their template — once no
  // Customer references the template (checked above), its field defs are
  // deleted alongside it rather than left as orphaned rows.
  await CustomerTemplateFieldDef.deleteMany({ customerTemplateId: templateId });
  await template.deleteOne();
  return NextResponse.json({ ok: true });
}

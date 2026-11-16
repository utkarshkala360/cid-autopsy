import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { WorkItemTemplateDef } from "@board/models/WorkItemTemplateDef";
import { Team } from "@board/models/Team";

const patchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  requiresCustomer: z.boolean().optional(),
});

// `key` is deliberately not editable here — same "identity fields don't get
// a rename API" precedent Team.slug already sets.
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
  if (
    !parsed.success ||
    (parsed.data.label === undefined && parsed.data.requiresCustomer === undefined)
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const template = await WorkItemTemplateDef.findOne({
    _id: templateId,
    organizationId: authz.member.organizationId,
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  if (parsed.data.label !== undefined) template.label = parsed.data.label;
  if (parsed.data.requiresCustomer !== undefined) {
    template.requiresCustomer = parsed.data.requiresCustomer;
  }
  await template.save();

  return NextResponse.json({ template });
}

// Blocked with a 409 + count if any Team currently uses this template as
// its primaryWorkItemType — same referential-integrity style Workflow's
// transition validation and (Phase 16) StageTrack's stage-removal check use.
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
  const template = await WorkItemTemplateDef.findOne({
    _id: templateId,
    organizationId: authz.member.organizationId,
  });
  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const teamsUsingIt = await Team.countDocuments({
    organizationId: authz.member.organizationId,
    primaryWorkItemType: template.key,
  });
  if (teamsUsingIt > 0) {
    return NextResponse.json(
      {
        error: `${teamsUsingIt} Team${teamsUsingIt === 1 ? "" : "s"} still use${
          teamsUsingIt === 1 ? "s" : ""
        } this template — switch ${teamsUsingIt === 1 ? "it" : "them"} to a different template first.`,
      },
      { status: 409 }
    );
  }

  await template.deleteOne();
  return NextResponse.json({ ok: true });
}

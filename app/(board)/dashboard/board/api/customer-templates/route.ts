import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateDef } from "@board/models/CustomerTemplateDef";

// Any Member may read the registry (the create-Customer form needs it);
// only an Org Admin may add one — same "read is open, write is Org Admin"
// shape /api/work-item-templates and /api/stage-tracks already use.
export async function GET() {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  await connectDB();
  const templates = await CustomerTemplateDef.find({ organizationId: member.organizationId })
    .sort({ key: 1 })
    .lean();
  return NextResponse.json({ templates });
}

const createSchema = z.object({
  key: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9_]+$/, "Key must be lowercase letters, numbers, or underscores."),
  label: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid template." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  await connectDB();
  const existing = await CustomerTemplateDef.findOne({
    organizationId: authz.member.organizationId,
    key: data.key,
  });
  if (existing) {
    return NextResponse.json(
      { error: `A template with key "${data.key}" already exists.` },
      { status: 400 }
    );
  }

  const template = await CustomerTemplateDef.create({
    organizationId: authz.member.organizationId,
    key: data.key,
    label: data.label,
    description: data.description ?? "",
    createdBy: authz.member._id,
  });

  return NextResponse.json({ template }, { status: 201 });
}

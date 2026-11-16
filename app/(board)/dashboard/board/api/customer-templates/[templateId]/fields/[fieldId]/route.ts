import { NextRequest, NextResponse } from "next/server";
import { requireOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateFieldDef } from "@board/models/CustomerTemplateFieldDef";

// Org Admin only.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string; fieldId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { templateId, fieldId } = await params;

  await connectDB();
  await CustomerTemplateFieldDef.deleteOne({ _id: fieldId, customerTemplateId: templateId });

  return NextResponse.json({ ok: true });
}

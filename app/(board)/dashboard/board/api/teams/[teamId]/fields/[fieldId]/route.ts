import { NextRequest, NextResponse } from "next/server";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { CustomFieldDef } from "@board/models/CustomFieldDef";

// Team Admin (or Org Admin, inherited) only.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; fieldId: string }> }
) {
  const { teamId, fieldId } = await params;
  const authz = await requireTeamRole(teamId, "admin");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  await connectDB();
  await CustomFieldDef.deleteOne({ _id: fieldId, teamId });

  return NextResponse.json({ ok: true });
}

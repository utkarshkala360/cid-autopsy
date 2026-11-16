import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireOrgAdmin } from "@board/lib/authz";
import { recordCustomerStageChange } from "@board/lib/work-item-history";
import { connectDB } from "@board/lib/mongodb";
import { Customer } from "@board/models/Customer";
import { getStageTrack } from "@board/lib/stage-tracks";

const patchSchema = z.object({
  journeyStage: z.string().trim().min(1).max(40).nullable(),
});

// CJ-1: "editable only by Org Admin" — a stricter floor than the rest of
// Customer's fields (name/contacts are requireAnyTeamAdmin, Phase 6), so
// this gets its own route rather than folding into the existing PATCH
// /api/customers/[customerId].
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const authz = await requireOrgAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { customerId } = await params;
  if (!mongoose.isValidObjectId(customerId)) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid stage." },
      { status: 400 }
    );
  }

  await connectDB();
  const track = await getStageTrack(authz.member.organizationId, "customer");
  if (!track?.enabled) {
    return NextResponse.json(
      { error: "The Customer Journey Stage Track is not enabled for this Organization." },
      { status: 400 }
    );
  }
  if (parsed.data.journeyStage !== null && !track.stages.some((s) => s.key === parsed.data.journeyStage)) {
    return NextResponse.json({ error: "Not a valid stage for this Stage Track." }, { status: 400 });
  }

  const customer = await Customer.findOne({
    _id: customerId,
    organizationId: authz.member.organizationId,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const oldValue = customer.journeyStage ?? null;
  const newValue = parsed.data.journeyStage;
  if (oldValue !== newValue) {
    customer.journeyStage = newValue;
    await customer.save();
    await recordCustomerStageChange({
      customerId: customer._id,
      memberId: authz.member._id,
      oldValue,
      newValue,
    });
  }

  return NextResponse.json({ customer });
}

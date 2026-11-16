import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAnyTeamAdmin } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Customer } from "@board/models/Customer";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { customerId } = await params;
  if (!mongoose.isValidObjectId(customerId)) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  await connectDB();
  const customer = await Customer.findOne({
    _id: customerId,
    organizationId: member.organizationId,
  }).lean();
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  return NextResponse.json({ customer });
}

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(60).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  contacts: z.array(contactSchema).max(20).optional(),
});

// Org Admin, or Team Admin on any Team (requireAnyTeamAdmin — see authz.ts).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const authz = await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const { customerId } = await params;
  if (!mongoose.isValidObjectId(customerId)) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || (parsed.data.name === undefined && parsed.data.contacts === undefined)) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await connectDB();
  const customer = await Customer.findOne({
    _id: customerId,
    organizationId: authz.member.organizationId,
  });
  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  if (parsed.data.name !== undefined) customer.name = parsed.data.name;
  if (parsed.data.contacts !== undefined) customer.contacts = parsed.data.contacts;
  await customer.save();

  return NextResponse.json({ customer });
}

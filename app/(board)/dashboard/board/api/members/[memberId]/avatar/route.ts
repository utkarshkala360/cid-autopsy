import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireSelfOrOrgAdmin } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { Member } from "@board/models/Member";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4 MB — plenty for a display picture.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const { memberId } = await params;
  const authz = await requireSelfOrOrgAdmin(memberId);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Use a PNG, JPEG, WebP, or GIF image." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Image is larger than the 4 MB limit." }, { status: 400 });
  }

  await connectDB();
  const member = await Member.findOne({
    _id: memberId,
    organizationId: authz.member.organizationId,
  });
  if (!member) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  const blob = await put(`avatars/${memberId}/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  member.avatarUrl = blob.url;
  await member.save();

  return NextResponse.json({ avatarUrl: member.avatarUrl });
}

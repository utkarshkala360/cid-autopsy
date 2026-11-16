import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkItemAccess, canCommentWithAccess } from "@board/lib/guest-access";
import { getOrgMentionCandidates } from "@board/lib/work-items";
import { recordComment } from "@board/lib/work-item-history";
import { notifyMentions } from "@board/lib/notifications";

const commentSchema = z.object({
  text: z.string().trim().min(1, "Comment can't be empty.").max(5000),
});

// Team Member and above may comment — and so may a Guest, but only on an
// item explicitly shared with them (Roles & Permissions Matrix: "Comment —
// Guest: only items shared with them"). This is a create-only endpoint —
// comments join the same append-only ChangeHistory feed as field changes
// and are never edited or deleted (Non-Negotiable #5).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireWorkItemAccess(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }
  if (!canCommentWithAccess(access.role)) {
    return NextResponse.json({ error: "Insufficient Team role." }, { status: 403 });
  }
  const item = access.item;

  const body = await request.json().catch(() => null);
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  const mentionCandidates = await getOrgMentionCandidates(String(access.member.organizationId));
  const comment = await recordComment({
    workItemId: item._id,
    teamId,
    memberId: access.member._id,
    commentText: parsed.data.text,
    teamMembers: mentionCandidates,
  });

  if (comment.mentions?.length) {
    await notifyMentions({
      organizationId: access.member.organizationId,
      actorId: access.member._id,
      teamId,
      workItemId: item._id,
      workItemTitle: item.title,
      mentionedMemberIds: comment.mentions,
    });
  }

  return NextResponse.json({ comment }, { status: 201 });
}

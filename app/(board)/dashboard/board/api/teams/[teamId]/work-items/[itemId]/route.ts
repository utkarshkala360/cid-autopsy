import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireTeamRole } from "@board/lib/authz";
import { requireWorkItemAccess } from "@board/lib/guest-access";
import { loadTeamWorkItem } from "@board/lib/work-items";
import {
  getEffectiveWorkflow,
  isValidStatus,
  isValidTransition,
} from "@board/lib/workflow";
import { getFieldDefs, validateCustomFieldValues } from "@board/lib/custom-fields";
import {
  diffWorkItemFields,
  diffCustomFields,
  recordFieldChanges,
} from "@board/lib/work-item-history";
import { notifyStatusChange, notifyAssignment } from "@board/lib/notifications";
import { resolveStatusMeta } from "@board/components/work-items/status-pill";
import { PRIORITIES } from "@board/lib/status-categories";
import { Customer } from "@board/models/Customer";
import { Initiative } from "@board/models/Initiative";
import { WorkItem } from "@board/models/WorkItem";
import { WorkLog } from "@board/models/WorkLog";
import { validateSubtaskParent } from "@board/lib/work-item-subtasks";
import { validateOriginInput } from "@board/lib/origin-links";
import { ORIGIN_KINDS } from "@board/lib/origin-types";
import { computeStageNudgeSuggestion, type StageNudgeSuggestion } from "@board/lib/stage-nudge";
import { missingRequiredFields, REQUIRABLE_FIELD_LABEL, type RequirableField } from "@board/lib/transition-requirements";
import { resolveServerOrder } from "@board/lib/work-item-reorder";

// MB-4: a real Team role (viewer+) is checked first; a Guest with a grant
// on this specific item (or its Initiative) gets the same read access to
// this one item, and only this item — requireWorkItemAccess is the single
// place that bypass is allowed to happen.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const access = await requireWorkItemAccess(teamId, itemId);
  if (!access.ok) {
    return NextResponse.json(
      { error: access.message },
      { status: access.status }
    );
  }

  return NextResponse.json({ workItem: access.item });
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(20000).optional(),
  status: z.string().trim().optional(),
  priority: z.enum(PRIORITIES).optional(),
  assignee: z.string().nullable().optional(),
  labels: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  dueDate: z.string().nullable().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
  customerId: z.string().nullable().optional(),
  initiativeId: z.string().nullable().optional(),
  teamInitiativeId: z.string().nullable().optional(),
  // Board/Backlog drag-to-reorder rank (BD-2/BD-7). Deliberately not in the
  // diffWorkItemFields list below — it's display metadata, not a business
  // field, so a reorder doesn't spam the audit trail with rank-change noise.
  // Kept working as-is for non-drag callers (e.g. bulk-edit) that already
  // compute/pass a raw numeric order.
  order: z.number().finite().optional(),
  // Pagination redesign — Design 2: the actual drag-and-drop path. Mutually
  // exclusive with `order` above (validated below) — KanbanBoard/
  // BacklogList send this instead of a client-computed order number, so the
  // server can re-derive the true DB-adjacent sibling rather than trusting
  // the client's belief about what's at the edge of a (possibly paginated)
  // column/list.
  reorder: z
    .object({
      scope: z.enum(["column", "team"]),
      afterItemId: z.string().nullable(),
      beforeItemId: z.string().nullable(),
    })
    .optional(),
  parentId: z.string().nullable().optional(),
  // XM-1: "originated from" — both null together (clearing) or both set
  // together (setting/changing). originatedFromKind alone with a null id
  // (or vice versa) is rejected below, same "validate at the boundary"
  // pattern as customerId/initiativeId.
  originatedFromKind: z.enum(ORIGIN_KINDS).nullable().optional(),
  originatedFromId: z.string().nullable().optional(),
  // IT-8: mutually exclusive with having a parentId — validated below.
  isEpic: z.boolean().optional(),
  // WL-2: interpreted in the owning Team's current timeTrackingUnit. Not
  // restricted to Teams with a unit configured at the schema/API layer
  // (ORG-4) — the UI simply never offers the field otherwise.
  estimate: z.number().nonnegative().finite().nullable().optional(),
});

// Team Member and above may edit Work Items (Roles & Permissions Matrix).
// Every field change is diffed and logged to the append-only ChangeHistory
// feed (CT-1) — this is the only place a WorkItem is mutated after creation.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.message },
      { status: authz.status }
    );
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json(
      { error: "Work Item not found." },
      { status: 404 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;
  if (data.order !== undefined && data.reorder !== undefined) {
    return NextResponse.json(
      { error: "Provide either order or reorder, not both." },
      { status: 400 }
    );
  }
  const before = item.toObject();
  const previousAssignee = item.assignee ? String(item.assignee) : null;

  let statusLabels: { oldLabel: string; newLabel: string } | null = null;
  if (data.status !== undefined) {
    const workflow = await getEffectiveWorkflow(teamId, item.type);
    if (!isValidStatus(workflow, data.status)) {
      return NextResponse.json(
        { error: "Not a valid status for this Work Item type." },
        { status: 400 }
      );
    }
    if (!isValidTransition(workflow, item.status, data.status)) {
      return NextResponse.json(
        { error: `Cannot move from "${item.status}" to "${data.status}".` },
        { status: 400 }
      );
    }
    if (data.status !== item.status) {
      statusLabels = {
        oldLabel: resolveStatusMeta(workflow.statuses, item.status).label,
        newLabel: resolveStatusMeta(workflow.statuses, data.status).label,
      };
    }
    item.status = data.status;
  }

  if (data.title !== undefined) item.title = data.title;
  if (data.description !== undefined) item.description = data.description;
  if (data.priority !== undefined) item.priority = data.priority;
  if (data.assignee !== undefined) item.assignee = data.assignee || null;
  if (data.labels !== undefined) item.labels = data.labels;
  if (data.order !== undefined) item.order = data.order;
  if (data.estimate !== undefined) item.estimate = data.estimate;

  // Pagination redesign — Design 2: server-side authoritative reorder.
  // Runs AFTER `item.status` above has already been updated (if this same
  // request is also a cross-column drag), so a "column" scope always
  // resolves against the item's real post-move status.
  if (data.reorder !== undefined) {
    item.order = await resolveServerOrder({
      teamId,
      type: item.type,
      itemId: item._id.toString(),
      status: item.status,
      scope: data.reorder.scope,
      afterItemId: data.reorder.afterItemId,
      beforeItemId: data.reorder.beforeItemId,
    });
  }

  if (data.customerId !== undefined) {
    // WT-1: linking a Customer is optional, including for a Ticket — a Work
    // Item can stand on its own. Only validate when a value is actually
    // given.
    if (data.customerId) {
      if (!mongoose.isValidObjectId(data.customerId)) {
        return NextResponse.json(
          { error: "That Customer doesn't exist." },
          { status: 400 }
        );
      }
      const customer = await Customer.findOne({
        _id: data.customerId,
        organizationId: authz.member.organizationId,
      }).lean();
      if (!customer) {
        return NextResponse.json(
          { error: "That Customer doesn't exist." },
          { status: 400 }
        );
      }
    }
    item.customerId = data.customerId || null;
  }

  if (data.initiativeId !== undefined) {
    if (data.initiativeId) {
      if (!mongoose.isValidObjectId(data.initiativeId)) {
        return NextResponse.json(
          { error: "That Initiative doesn't exist." },
          { status: 400 }
        );
      }
      const initiative = await Initiative.findOne({
        _id: data.initiativeId,
        organizationId: authz.member.organizationId,
      }).lean();
      if (!initiative) {
        return NextResponse.json(
          { error: "That Initiative doesn't exist." },
          { status: 400 }
        );
      }
    }
    item.initiativeId = data.initiativeId || null;
  }

  if (data.teamInitiativeId !== undefined) {
    if (data.teamInitiativeId) {
      if (!mongoose.isValidObjectId(data.teamInitiativeId)) {
        return NextResponse.json(
          { error: "That Sprint doesn't exist." },
          { status: 400 }
        );
      }
      const sprint = await Initiative.findOne({ _id: data.teamInitiativeId, teamId }).lean<{
        sprintStatus: string;
      }>();
      if (!sprint) {
        return NextResponse.json(
          { error: "That Sprint doesn't exist." },
          { status: 400 }
        );
      }
      if (sprint.sprintStatus === "completed") {
        return NextResponse.json(
          { error: "Can't move an item into a completed Sprint." },
          { status: 400 }
        );
      }
    }
    item.teamInitiativeId = data.teamInitiativeId || null;
  }

  if (data.dueDate !== undefined) {
    if (data.dueDate === null) {
      item.dueDate = null;
    } else {
      const parsedDate = new Date(data.dueDate);
      if (Number.isNaN(parsedDate.getTime())) {
        return NextResponse.json(
          { error: "Invalid due date." },
          { status: 400 }
        );
      }
      item.dueDate = parsedDate;
    }
  }

  if (data.parentId !== undefined) {
    if (data.parentId === null) {
      item.parentId = null;
    } else {
      // IT-8: an Epic can't become someone else's sub-task — same
      // "no grandchildren, no promoting a middle node" spirit
      // validateSubtaskParent already enforces for parentId itself.
      const isEpicAfter = data.isEpic !== undefined ? data.isEpic : item.isEpic;
      if (isEpicAfter) {
        return NextResponse.json(
          { error: "An Epic can't become a sub-task." },
          { status: 400 }
        );
      }
      const validated = await validateSubtaskParent(teamId, data.parentId, itemId);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      item.parentId = data.parentId;
    }
  }

  if (data.isEpic !== undefined) {
    if (data.isEpic) {
      const parentIdAfter = data.parentId !== undefined ? data.parentId : item.parentId;
      if (parentIdAfter) {
        return NextResponse.json(
          { error: "A sub-task can't be marked as an Epic." },
          { status: 400 }
        );
      }
    }
    item.isEpic = data.isEpic;
  }

  // XM-1: client always sends the pair together (either both null to clear,
  // or both set) — the picker UI never sends just one half.
  if (data.originatedFromKind !== undefined || data.originatedFromId !== undefined) {
    const kind = data.originatedFromKind ?? null;
    const id = data.originatedFromId ?? null;
    if ((kind === null) !== (id === null)) {
      return NextResponse.json(
        { error: "Origin type and reference must be set or cleared together." },
        { status: 400 }
      );
    }
    const validated = await validateOriginInput(kind, id, authz.member, itemId);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    item.originatedFromKind = validated.kind;
    item.originatedFromId = validated.id;
  }

  let customFieldDiffs: ReturnType<typeof diffCustomFields> = [];
  if (data.customFields !== undefined) {
    const defs = await getFieldDefs(teamId, item.type);
    const validated = validateCustomFieldValues(defs, data.customFields);
    if (!validated.ok) {
      return NextResponse.json({ error: validated.error }, { status: 400 });
    }
    const beforeCustomFields =
      (before.customFields as Record<string, unknown>) ?? {};
    const mergedCustomFields = { ...beforeCustomFields, ...validated.values };
    customFieldDiffs = diffCustomFields(beforeCustomFields, mergedCustomFields);
    item.customFields = mergedCustomFields;
  }

  // WF-4: checked last, against the fully-merged `item` — so a request that
  // sets e.g. both `status` and `assignee` together can satisfy an
  // assignee-required transition in the same edit, not two round trips.
  if (data.status !== undefined && data.status !== before.status) {
    const workflow = await getEffectiveWorkflow(teamId, item.type);
    const transition = workflow.transitions.find(
      (t) => t.from === before.status && t.to === data.status
    );
    const missing = missingRequiredFields(item, transition?.requiredFields);
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Moving to "${statusLabels?.newLabel ?? data.status}" requires: ${missing
            .map((f: RequirableField) => REQUIRABLE_FIELD_LABEL[f])
            .join(", ")}.`,
        },
        { status: 400 }
      );
    }
  }

  await item.save();
  const after = item.toObject();

  const diffs = [
    ...diffWorkItemFields(before, after, [
      "title",
      "description",
      "status",
      "priority",
      "assignee",
      "labels",
      "dueDate",
      "customerId",
      "initiativeId",
      "teamInitiativeId",
      "originatedFromKind",
      "originatedFromId",
      "isEpic",
      "estimate",
    ]),
    ...customFieldDiffs,
  ];

  const createdHistory = await recordFieldChanges({
    workItemId: item._id,
    teamId,
    memberId: authz.member._id,
    diffs,
  });

  // §7.11/MB-5: status changes and (re-)assignment notify — same treatment
  // for a Guest watching this item as for anyone else (getWatchersForWorkItem).
  if (statusLabels) {
    await notifyStatusChange({
      organizationId: authz.member.organizationId,
      actorId: authz.member._id,
      item,
      oldStatusLabel: statusLabels.oldLabel,
      newStatusLabel: statusLabels.newLabel,
    });
  }
  const newAssignee = item.assignee ? String(item.assignee) : null;
  if (
    data.assignee !== undefined &&
    newAssignee &&
    newAssignee !== previousAssignee
  ) {
    await notifyAssignment({
      organizationId: authz.member.organizationId,
      actorId: authz.member._id,
      item,
      assigneeId: newAssignee,
    });
  }

  // XM-3: a status move can be configured (by this Team's Admin, on the
  // workflow config screen) to suggest advancing a linked Customer's/
  // Initiative's macro stage — never applied automatically (CJ-3/PL-3).
  let stageNudge: StageNudgeSuggestion | null = null;
  if (statusLabels) {
    const workflow = await getEffectiveWorkflow(teamId, item.type);
    stageNudge = await computeStageNudgeSuggestion({
      newStatusKey: item.status,
      statuses: workflow.statuses,
      organizationId: String(authz.member.organizationId),
      customerId: item.customerId ? String(item.customerId) : null,
      initiativeId: item.initiativeId ? String(item.initiativeId) : null,
    });
  }

  // Phase 11: the client appends `history` directly instead of re-fetching
  // the whole feed after every field edit (GET .../history) — this is the
  // full set of ChangeHistory rows `recordFieldChanges` just inserted, so
  // the response already carries everything a second round trip would.
  return NextResponse.json({
    workItem: item,
    changedFields: diffs.length,
    history: createdHistory,
    stageNudge,
  });
}

// Team Member and above may delete Work Items (Roles & Permissions Matrix).
// ChangeHistory rows for this item are deliberately NOT cascade-deleted —
// the audit trail outlives its subject (Non-Negotiable #5).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ teamId: string; itemId: string }> }
) {
  const { teamId, itemId } = await params;
  const authz = await requireTeamRole(teamId, "member");
  if (!authz.ok) {
    return NextResponse.json(
      { error: authz.message },
      { status: authz.status }
    );
  }

  const item = await loadTeamWorkItem(teamId, itemId);
  if (!item) {
    return NextResponse.json(
      { error: "Work Item not found." },
      { status: 404 }
    );
  }

  await item.deleteOne();
  // Sub-tasks outlive their parent — orphaned back to top-level rather than
  // cascade-deleted, same "don't silently destroy data" principle as
  // ChangeHistory surviving the Work Item it's about (Non-Negotiable #5).
  await WorkItem.updateMany({ parentId: item._id }, { $set: { parentId: null } });
  // WL-3: unlike ChangeHistory/Attachments, a WorkLog row has no meaning or
  // reachable UI once its Work Item is gone (it's operational data scoped
  // 1:1 to the item, not an audit trail) — cascade-deleted here rather than
  // left permanently orphaned.
  await WorkLog.deleteMany({ workItemId: item._id });
  return NextResponse.json({ ok: true });
}

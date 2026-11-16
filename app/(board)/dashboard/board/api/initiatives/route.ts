import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { requireAnyTeamAdmin, requireTeamRole } from "@board/lib/authz";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Initiative, type InitiativeDoc } from "@board/models/Initiative";
import { WorkItem } from "@board/models/WorkItem";
import { Member } from "@board/models/Member";
import { getSimpleListPage } from "@board/lib/simple-view-query";
import { decodeViewConfig } from "@board/lib/view-config";
import type {
  InitiativeFilterField,
  InitiativeSortField,
  InitiativeGroupField,
} from "@board/lib/initiative-views";

const DEFAULT_PAGE_SIZE = 50;

// ORG-5: any authenticated Member can view Initiatives (Core Platform — the
// tag itself, not the Module B macro-stage field). Same "View only" floor
// as Customer (Phase 6). Optional `?teamId=` narrows to just that Team's
// Team-run Initiatives — used by Sprint-field pickers (formerly
// `Sprint.find({ teamId })`) and the Initiatives page's Team tab.
//
// Pagination redesign (Design 3): pagination applies ONLY to the org-level
// cross-team tags branch (`teamId` absent) — the plan explicitly scopes the
// Team-run "Sprints" branch (`teamId` present) out of this pass as
// naturally low-cardinality per Team, so that branch keeps its original
// full-array `{ initiatives }` shape untouched (still used by Sprint-field
// pickers that need the whole list, not a page of it).
export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const teamId = sp.get("teamId");

  await connectDB();

  if (teamId) {
    if (!mongoose.isValidObjectId(teamId)) {
      return NextResponse.json({ initiatives: [] });
    }
    const initiatives = await Initiative.find({ organizationId: member.organizationId, teamId })
      .sort({ name: 1 })
      .lean();
    return NextResponse.json({ initiatives });
  }

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || DEFAULT_PAGE_SIZE));
  const query = { organizationId: member.organizationId, teamId: null };
  const view = decodeViewConfig<InitiativeFilterField, InitiativeSortField, InitiativeGroupField>(
    sp.get("view")
  );

  const { docs: initiatives, total } = await getSimpleListPage<InitiativeDoc, InitiativeFilterField, InitiativeSortField, InitiativeGroupField>(
    Initiative,
    query,
    view,
    { page, pageSize, defaultSort: { name: 1 } }
  );

  const ids = initiatives.map((i) => i._id);
  const creatorIds = [...new Set(initiatives.map((i) => String(i.createdBy)))];
  const [itemCounts, creators] = await Promise.all([
    ids.length
      ? WorkItem.aggregate([
          { $match: { organizationId: member.organizationId, initiativeId: { $in: ids } } },
          { $group: { _id: "$initiativeId", count: { $sum: 1 } } },
        ])
      : Promise.resolve([]),
    creatorIds.length ? Member.find({ _id: { $in: creatorIds } }, "name").lean() : Promise.resolve([]),
  ]);
  const countMap = new Map(itemCounts.map((t: { _id: unknown; count: number }) => [String(t._id), t.count]));
  const nameByCreator = new Map(
    (creators as { _id: unknown; name: string }[]).map((m) => [String(m._id), m.name])
  );

  const rows = initiatives.map((i) => ({
    id: String(i._id),
    name: i.name,
    description: i.description,
    itemCount: countMap.get(String(i._id)) ?? 0,
    lifecycleStage: i.lifecycleStage ?? null,
    createdByName: nameByCreator.get(String(i.createdBy)) ?? "—",
  }));

  return NextResponse.json({
    initiatives: rows,
    total,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(160),
  description: z.string().trim().max(2000).optional(),
  // Phase 16 (Design 2, Sprint/Initiative unification): optional — when
  // set, this Initiative is "Team-run" (the former Sprint shape) instead of
  // a plain cross-team tag. `sprintGoal`/`startDate`/`endDate` are only
  // meaningful (and required) when `teamId` is set.
  teamId: z.string().nullable().optional(),
  sprintGoal: z.string().trim().max(2000).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

// ORG-5: an ordinary cross-team tag is "creatable by any Team Admin or Org
// Admin" — requireAnyTeamAdmin, the exact same rule Customer creation uses
// (Phase 6). Phase 16 (Design 2): a Team-run Initiative (teamId set) is
// instead gated by requireTeamRole(teamId, "admin") — Team-owned planning,
// not an Org-wide tag anyone with admin-somewhere could spin up (the same
// floor BD-3 Sprint creation always had).
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }
  const data = parsed.data;

  if (data.teamId && !mongoose.isValidObjectId(data.teamId)) {
    return NextResponse.json({ error: "That Team doesn't exist." }, { status: 400 });
  }

  const authz = data.teamId
    ? await requireTeamRole(data.teamId, "admin")
    : await requireAnyTeamAdmin();
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  if (data.teamId) {
    if (!data.startDate || !data.endDate) {
      return NextResponse.json(
        { error: "Start and end dates are required for a Team-run Initiative." },
        { status: 400 }
      );
    }
    startDate = new Date(data.startDate);
    endDate = new Date(data.endDate);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: "Invalid dates." }, { status: 400 });
    }
  }

  await connectDB();
  const initiative = await Initiative.create({
    organizationId: authz.member.organizationId,
    name: data.name,
    description: data.description ?? "",
    teamId: data.teamId || null,
    sprintGoal: data.teamId ? (data.sprintGoal ?? "") : "",
    startDate,
    endDate,
    sprintStatus: data.teamId ? "planned" : "none",
    createdBy: authz.member._id,
  });

  return NextResponse.json({ initiative }, { status: 201 });
}

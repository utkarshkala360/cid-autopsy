import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { SavedView } from "@board/models/SavedView";

// Team Viewer+ may list — everyone who can see the Work Items can see the
// Views built for them.
export async function GET(request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (!type) {
    return NextResponse.json({ error: "type is required." }, { status: 400 });
  }

  await connectDB();
  const views = await SavedView.find({
    teamId,
    type,
    $or: [{ visibility: "team" }, { visibility: "self", createdBy: authz.member._id }],
  })
    .sort({ name: 1 })
    .lean();

  return NextResponse.json({
    views: views.map((v) => ({
      id: String(v._id),
      name: v.name,
      visibility: v.visibility,
      config: v.config,
      mine: String(v.createdBy) === String(authz.member._id),
    })),
  });
}

const createSchema = z.object({
  type: z.string().trim().toLowerCase().min(1),
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["self", "team"]).default("self"),
  config: z.object({
    filters: z.object({ groups: z.array(z.unknown()) }),
    sort: z.array(z.unknown()),
    groupBy: z.string().nullable(),
  }),
});

// Team Viewer+ may save a "self" View (their own working list); "team"
// (shared, "for all") requires Team Member+ — a Viewer shouldn't be able to
// clutter everyone else's Views menu.
export async function POST(request: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const authz = await requireTeamRole(teamId, "viewer");
  if (!authz.ok) {
    return NextResponse.json({ error: authz.message }, { status: authz.status });
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.visibility === "team" && authz.role === "viewer") {
    return NextResponse.json(
      { error: "Team Member or Admin access required to save a View for everyone." },
      { status: 403 }
    );
  }

  await connectDB();
  const view = await SavedView.create({
    organizationId: authz.member.organizationId,
    teamId,
    type: parsed.data.type,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
    createdBy: authz.member._id,
    config: parsed.data.config,
  });

  return NextResponse.json(
    {
      view: {
        id: String(view._id),
        name: view.name,
        visibility: view.visibility,
        config: view.config,
        mine: true,
      },
    },
    { status: 201 }
  );
}

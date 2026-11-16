import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { getCurrentMember } from "@board/lib/get-current-member";
import { requireTeamRole } from "@board/lib/authz";
import { connectDB } from "@board/lib/mongodb";
import { DashboardView } from "@board/models/DashboardView";
import { widgetInstanceSchema } from "@board/lib/dashboard-view-schema";

// Any authenticated Member may list an Org-level view (no `?teamId=`); a
// Team-level view (`?teamId=`) requires at least Team Viewer — same "View
// only" floor requireTeamRole always gives read access.
export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId");

  if (teamId) {
    const authz = await requireTeamRole(teamId, "viewer");
    if (!authz.ok) {
      return NextResponse.json({ error: authz.message }, { status: authz.status });
    }
    await connectDB();
    const views = await DashboardView.find({
      organizationId: authz.member.organizationId,
      teamId,
      $or: [{ visibility: "shared" }, { visibility: "self", createdBy: authz.member._id }],
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

  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  await connectDB();
  const views = await DashboardView.find({
    organizationId: member.organizationId,
    teamId: null,
    $or: [{ visibility: "shared" }, { visibility: "self", createdBy: member._id }],
  })
    .sort({ name: 1 })
    .lean();
  return NextResponse.json({
    views: views.map((v) => ({
      id: String(v._id),
      name: v.name,
      visibility: v.visibility,
      config: v.config,
      mine: String(v.createdBy) === String(member._id),
    })),
  });
}

const createSchema = z.object({
  teamId: z.string().nullable().default(null),
  name: z.string().trim().min(1).max(80),
  visibility: z.enum(["self", "shared"]).default("self"),
  config: z.object({ widgets: z.array(widgetInstanceSchema) }),
});

// Org-level (`teamId: null`) sharing is a deliberate override of
// REQUIREMENTS.md's DB-3 "Won't (v1)" call, by direct user request: any
// authenticated Member may publish a `visibility: "shared"` Org-level view,
// no requireAnyTeamAdmin()/requireOrgAdmin() gate — see ARCHITECTURE.md's
// "Dashboard Views" Build Log entry. A TEAM-level shared view (`teamId`
// set) was never granted that override — it uses the exact same rule
// SavedView's `visibility: "team"` already does: Team Member+ required, a
// Viewer may only save a `"self"` view.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 }
    );
  }

  if (parsed.data.teamId) {
    if (!mongoose.isValidObjectId(parsed.data.teamId)) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }
    const authz = await requireTeamRole(parsed.data.teamId, "viewer");
    if (!authz.ok) {
      return NextResponse.json({ error: authz.message }, { status: authz.status });
    }
    if (parsed.data.visibility === "shared" && authz.role === "viewer") {
      return NextResponse.json(
        { error: "Team Member or Admin access required to save a View for everyone." },
        { status: 403 }
      );
    }
    await connectDB();
    const view = await DashboardView.create({
      organizationId: authz.member.organizationId,
      teamId: parsed.data.teamId,
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

  const member = await getCurrentMember();
  if (!member) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  await connectDB();
  const view = await DashboardView.create({
    organizationId: member.organizationId,
    teamId: null,
    name: parsed.data.name,
    visibility: parsed.data.visibility,
    createdBy: member._id,
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

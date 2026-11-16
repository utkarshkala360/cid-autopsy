import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { WorkItemTemplatesEditor } from "@board/components/settings/work-item-templates-editor";
import { getCurrentMember } from "@board/lib/get-current-member";
import { getWorkItemTemplateDefs } from "@board/lib/work-item-templates";
import { connectDB } from "@board/lib/mongodb";
import { WorkItemTemplateDef } from "@board/models/WorkItemTemplateDef";

// WT-1/WT-2 (Phase 16, Design 3): Org-Admin-gated CRUD over the Work Item
// template registry — same floor as /settings/teams and /settings/modules.
export default async function WorkItemTemplatesSettingsPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (member.orgRole !== "org_admin") {
    return (
      <ForbiddenState message="Managing Work Item templates is an Org Admin action (WT-2). Ask your Org Admin for access." />
    );
  }

  await connectDB();
  // getWorkItemTemplateDefs() self-heals the two seed rows (task/ticket) on
  // first read — an existing installation with none yet gets them created
  // here, byte-for-byte matching pre-Phase-16 behavior.
  await getWorkItemTemplateDefs(member.organizationId);
  const templates = await WorkItemTemplateDef.find({ organizationId: member.organizationId })
    .sort({ key: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Templates</h1>
        <p className="mt-1 text-xs text-slate">
          The Work Item templates every Team can choose from (WT-1/WT-2). Adding one here is pure
          config — no engineering required to make a new template usable.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <WorkItemTemplatesEditor
          initialTemplates={templates.map((t) => ({
            id: String(t._id),
            key: t.key as string,
            label: t.label as string,
            requiresCustomer: t.requiresCustomer as boolean,
          }))}
        />
      </div>
    </div>
  );
}

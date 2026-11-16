import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { CustomerTemplatesEditor } from "@board/components/settings/customer-templates-editor";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateDef } from "@board/models/CustomerTemplateDef";

// Org-Admin-gated CRUD over the Customer Template registry — same floor as
// /settings/templates (Work Item templates) and /settings/modules. Unlike
// Work Item templates, there's no self-healing seed: an Organization starts
// with zero Customer Templates until an Org Admin adds one.
export default async function CustomerTemplatesSettingsPage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (member.orgRole !== "org_admin") {
    return (
      <ForbiddenState message="Managing Customer Templates is an Org Admin action. Ask your Org Admin for access." />
    );
  }

  await connectDB();
  const templates = await CustomerTemplateDef.find({ organizationId: member.organizationId })
    .sort({ key: 1 })
    .lean();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">Customer Templates</h1>
        <p className="mt-1 text-xs text-slate">
          One template per product/line of business you sell. Each template defines a set of
          fields — with optional defaults — so creating a Customer for that product starts
          pre-filled, via the form or the API.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <CustomerTemplatesEditor
          initialTemplates={templates.map((t) => ({
            id: String(t._id),
            key: t.key as string,
            label: t.label as string,
            description: (t.description as string) ?? "",
          }))}
        />
      </div>
    </div>
  );
}

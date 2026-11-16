import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { CustomerTemplateFieldsEditor } from "@board/components/customers/customer-template-fields-editor";
import { getCurrentMember } from "@board/lib/get-current-member";
import { getCustomerTemplateFieldDefs } from "@board/lib/customer-templates";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateDef } from "@board/models/CustomerTemplateDef";
import type { CustomFieldType } from "@board/lib/status-categories";

export default async function CustomerTemplateFieldsPage({
  params,
}: {
  params: Promise<{ templateId: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  if (member.orgRole !== "org_admin") {
    return (
      <ForbiddenState message="Managing Customer Templates is an Org Admin action. Ask your Org Admin for access." />
    );
  }

  const { templateId } = await params;
  await connectDB();
  const template = await CustomerTemplateDef.findOne({
    _id: templateId,
    organizationId: member.organizationId,
  }).lean();
  if (!template) {
    notFound();
  }

  const fields = await getCustomerTemplateFieldDefs(templateId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/board/settings/customer-templates"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" />
          Customer Templates
        </Link>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight text-ink">
          {template!.label as string}
        </h1>
        <p className="mt-1 text-xs text-slate">
          Fields that pre-fill on the create-Customer form (and via the API) when this template is
          selected. Each field can carry an optional default value.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-panel p-5">
        <CustomerTemplateFieldsEditor
          templateId={templateId}
          initialFields={fields.map((f) => ({
            id: String(f._id),
            key: f.key,
            label: f.label,
            fieldType: f.fieldType as CustomFieldType,
            options: f.options ?? undefined,
            defaultValue: f.defaultValue as string | number | boolean | undefined,
          }))}
        />
      </div>
    </div>
  );
}

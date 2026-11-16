import "server-only";
import { cache } from "react";
import { connectDB } from "@board/lib/mongodb";
import { CustomerTemplateDef, type CustomerTemplateDefDoc } from "@board/models/CustomerTemplateDef";
import {
  CustomerTemplateFieldDef,
  type CustomerTemplateFieldDefDoc,
} from "@board/models/CustomerTemplateFieldDef";

export type CustomerTemplateLite = { id: string; key: string; label: string; description: string };

// No self-heal/seed here, unlike getWorkItemTemplateDefs — there's no
// universal default product, so an Organization legitimately starts with
// zero Customer Templates until an Org Admin adds one.
export const getCustomerTemplateDefs = cache(
  async (organizationId: string | { toString(): string }): Promise<CustomerTemplateLite[]> => {
    await connectDB();
    const defs = await CustomerTemplateDef.find({ organizationId })
      .sort({ key: 1 })
      .lean<CustomerTemplateDefDoc[]>();
    return defs.map((d) => ({
      id: String(d._id),
      key: d.key,
      label: d.label,
      description: d.description,
    }));
  }
);

export function getCustomerTemplateDef(
  templateId: string,
  templates: CustomerTemplateLite[]
): CustomerTemplateLite | undefined {
  return templates.find((t) => t.id === templateId);
}

export async function getCustomerTemplateFieldDefs(
  customerTemplateId: string
): Promise<CustomerTemplateFieldDefDoc[]> {
  await connectDB();
  return CustomerTemplateFieldDef.find({ customerTemplateId })
    .sort({ createdAt: 1 })
    .lean<CustomerTemplateFieldDefDoc[]>();
}

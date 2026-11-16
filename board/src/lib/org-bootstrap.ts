import "server-only";
import { connectDB } from "@board/lib/mongodb";
import { Organization } from "@board/models/Organization";
import { Member, type OrgRole } from "@board/models/Member";

const ORG_NAME = "360 Degree Cloud Technologies";

/**
 * v1 has exactly one Organization (ORG-1). `key: "singleton"` is unique, so
 * this upsert is the atomic find-or-create for that one row — no separate
 * existence check that could race.
 */
export async function getOrCreateOrganization() {
  await connectDB();
  return Organization.findOneAndUpdate(
    { key: "singleton" },
    { $setOnInsert: { name: ORG_NAME, key: "singleton", createdAt: new Date() } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/**
 * The first Member ever created becomes Org Admin; everyone after that
 * joins as a plain Member (see Phase 2 bootstrap rule in AGENTS.md).
 */
export async function bootstrapMember(input: {
  name: string;
  email: string;
  passwordHash?: string;
}) {
  await connectDB();
  const organization = await getOrCreateOrganization();
  const memberCount = await Member.countDocuments({
    organizationId: organization._id,
  });
  const orgRole: OrgRole = memberCount === 0 ? "org_admin" : "member";

  return Member.create({
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
    organizationId: organization._id,
    orgRole,
  });
}

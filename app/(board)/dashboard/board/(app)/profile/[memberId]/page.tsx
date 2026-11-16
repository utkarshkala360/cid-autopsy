import { redirect } from "next/navigation";
import { ForbiddenState } from "@board/components/layout/forbidden-state";
import { getCurrentMember } from "@board/lib/get-current-member";
import { connectDB } from "@board/lib/mongodb";
import { Member, type MemberDoc } from "@board/models/Member";
import { ProfileForm } from "@board/components/settings/profile-form";

// Org-Admin-only editor for another Member's profile — password changes made
// here skip the current-password check entirely (requireSelfOrOrgAdmin on
// every route ProfileForm calls). Landing here on your own id just redirects
// to the normal self-service page instead of duplicating it.
export default async function MemberProfilePage({
  params,
}: {
  params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const viewer = await getCurrentMember();
  if (!viewer) {
    redirect("/dashboard/login");
  }
  if (String(viewer._id) === memberId) {
    redirect("/dashboard/board/profile");
  }
  if (viewer.orgRole !== "org_admin") {
    return (
      <ForbiddenState
        title="Org Admin access required"
        message="Only an Org Admin can edit another Member's profile."
      />
    );
  }

  await connectDB();
  const target = await Member.findOne({
    _id: memberId,
    organizationId: viewer.organizationId,
  }).lean<MemberDoc>();
  if (!target) {
    return (
      <ForbiddenState
        title="Member not found"
        message="This Member doesn't exist or was removed."
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-ink text-2xl font-bold tracking-tight">
          {target.name}&apos;s Profile
        </h1>
        <p className="text-slate mt-1 text-xs">
          You&apos;re editing this Member&apos;s profile as Org Admin.
        </p>
      </div>
      <ProfileForm
        memberId={String(target._id)}
        isSelf={false}
        initialName={target.name}
        email={target.email}
        initialAvatarUrl={target.avatarUrl ?? null}
        hasPassword={Boolean(target.passwordHash)}
      />
    </div>
  );
}

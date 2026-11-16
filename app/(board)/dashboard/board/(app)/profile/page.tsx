import { redirect } from "next/navigation";
import { getCurrentMember } from "@board/lib/get-current-member";
import { ProfileForm } from "@board/components/settings/profile-form";

export default async function MyProfilePage() {
  const member = await getCurrentMember();
  if (!member) {
    redirect("/dashboard/login");
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-heading text-ink text-2xl font-bold tracking-tight">
          My Profile
        </h1>
        <p className="text-slate mt-1 text-xs">
          Manage your name, picture, and password.
        </p>
      </div>
      <ProfileForm
        memberId={String(member._id)}
        isSelf
        initialName={member.name}
        email={member.email}
        initialAvatarUrl={member.avatarUrl ?? null}
        hasPassword={Boolean(member.passwordHash)}
      />
    </div>
  );
}

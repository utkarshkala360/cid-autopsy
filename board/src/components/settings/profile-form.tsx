"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";

const inputClass =
  "h-8 w-full rounded-md border border-border bg-surface px-2.5 text-xs text-ink focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// One form, two modes: `isSelf` changes what the password section asks for
// (your own change needs the current password; an Org Admin changing
// someone else's — reached via /profile/[memberId] — never does, per
// requireSelfOrOrgAdmin on every route this form calls).
export function ProfileForm({
  memberId,
  isSelf,
  initialName,
  email,
  initialAvatarUrl,
  hasPassword,
}: {
  memberId: string;
  isSelf: boolean;
  initialName: string;
  email: string;
  initialAvatarUrl: string | null;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  async function saveName() {
    setNameError(null);
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setNameError("Name can't be empty.");
      return;
    }
    const res = await fetch(`/dashboard/board/api/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setNameError(body.error ?? "Something went wrong.");
      return;
    }
    setName(trimmed);
    setEditingName(false);
    router.refresh();
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/dashboard/board/api/members/${memberId}/avatar`, {
      method: "POST",
      body: formData,
    });
    setUploading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      toast.error(body.error ?? "Could not upload image.");
      return;
    }
    const data = await res.json();
    setAvatarUrl(data.avatarUrl);
    router.refresh();
    toast.success("Profile picture updated.");
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }
    if (isSelf && newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    setPasswordSubmitting(true);
    const res = await fetch(`/dashboard/board/api/members/${memberId}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isSelf
          ? { currentPassword: currentPassword || undefined, newPassword }
          : { newPassword }
      ),
    });
    setPasswordSubmitting(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setPasswordError(body.error ?? "Something went wrong.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    toast.success(isSelf ? "Password updated." : `Password updated for ${name}.`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-panel p-5 shadow-xs">
        <div className="text-slate mb-4 text-[11px] font-semibold tracking-wider uppercase">
          Profile
        </div>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center overflow-hidden rounded-full text-lg font-semibold">
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
              ) : (
                initials(name)
              )}
            </div>
            <button
              type="button"
              aria-label="Change profile picture"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="border-border bg-panel text-slate hover:bg-muted hover:text-ink absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border shadow-2xs disabled:opacity-60"
            >
              <Camera className="h-3 w-3" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  className="border-border bg-surface text-ink focus:border-primary focus:ring-primary h-8 flex-1 rounded-md border px-2.5 text-sm focus:ring-1 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={saveName}
                  className="text-status-done hover:bg-status-done-bg rounded-md p-1.5"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNameDraft(name);
                    setEditingName(false);
                    setNameError(null);
                  }}
                  className="text-slate hover:bg-muted rounded-md p-1.5"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <p className="text-ink text-sm font-semibold">{name}</p>
                <button
                  type="button"
                  onClick={() => setEditingName(true)}
                  className="text-slate hover:bg-muted hover:text-ink rounded-md p-1"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              </div>
            )}
            <p className="text-slate text-xs">{email}</p>
            {nameError && (
              <p className="text-status-blocked mt-1 text-xs font-medium">{nameError}</p>
            )}
          </div>
        </div>
      </div>

      <form
        onSubmit={handlePasswordSubmit}
        className="rounded-lg border border-border bg-panel p-5 shadow-xs"
      >
        <div className="text-slate mb-1 text-[11px] font-semibold tracking-wider uppercase">
          {isSelf ? "Change Password" : `Set a new password for ${name}`}
        </div>
        <p className="text-slate mb-4 text-xs">
          {isSelf
            ? hasPassword
              ? "Enter your current password to set a new one."
              : "You don't have a password set yet (signed in via Google) — set one to also enable email/password sign-in."
            : "As Org Admin, you can set a new password without knowing the current one."}
        </p>
        <div className="max-w-sm space-y-3">
          {isSelf && hasPassword && (
            <div className="space-y-1">
              <label className="text-ink text-xs font-medium">Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className="text-ink text-xs font-medium">New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {isSelf && (
            <div className="space-y-1">
              <label className="text-ink text-xs font-medium">Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
          )}
          {passwordError && (
            <p className="text-status-blocked text-xs font-medium">{passwordError}</p>
          )}
          <button
            type="submit"
            disabled={passwordSubmitting || !newPassword}
            className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold shadow-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            {passwordSubmitting ? "Updating…" : "Update password"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Paperclip,
  Upload,
  X,
  Download,
  History as HistoryIcon,
} from "lucide-react";
import {
  uploadAttachment,
  type UploadedAttachment,
} from "@board/lib/attachment-upload";
import { MemberHoverCard } from "@board/components/ui/member-hover-card";
import { ConfirmDialog } from "@board/components/ui/confirm-dialog";
import { fullDateTimeTitle } from "@board/lib/format-date";
import { toast } from "sonner";

export type AttachmentView = {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  blobUrl: string;
  uploadedBy: string;
  groupId: string;
  version: number;
  createdAt: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImage(contentType: string): boolean {
  return contentType.startsWith("image/");
}

// IT-9/IT-10/IT-11: Card mirrors WorkItemLinksPanel's shell/empty-state
// idiom. Unlike WorkItemLinksPanel, this is never hidden behind `isGuest` —
// a Guest with access to this Work Item must be able to view/download
// attachments, only upload/delete are gated by `canEdit` (see the POST/
// DELETE routes' requireTeamRole("member") checks, which already exclude
// Guest and plain Viewer).
export function AttachmentsPanel({
  teamId,
  itemId,
  canEdit,
  initialAttachments,
  memberNames,
  memberEmails = {},
  currentMemberId,
}: {
  teamId: string;
  itemId: string;
  canEdit: boolean;
  initialAttachments: AttachmentView[];
  memberNames: Record<string, string>;
  memberEmails?: Record<string, string>;
  currentMemberId: string;
}) {
  function uploaderName(uploadedBy: string): string {
    if (memberNames[uploadedBy]) return memberNames[uploadedBy];
    return uploadedBy === currentMemberId ? "You" : "Someone";
  }
  function uploaderNode(uploadedBy: string) {
    const name = uploaderName(uploadedBy);
    return (
      <MemberHoverCard name={name} email={memberEmails[uploadedBy]}>
        {name}
      </MemberHoverCard>
    );
  }
  const [attachments, setAttachments] =
    useState<AttachmentView[]>(initialAttachments);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<{
    url: string;
    alt: string;
  } | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [versions, setVersions] = useState<AttachmentView[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingId, setReplacingId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function toView(a: UploadedAttachment): AttachmentView {
    return {
      id: a._id,
      filename: a.filename,
      contentType: a.contentType,
      size: a.size,
      blobUrl: a.blobUrl,
      uploadedBy: a.uploadedBy,
      groupId: a.groupId,
      version: a.version,
      createdAt: a.createdAt,
    };
  }

  useEffect(() => {
    if (!previewUrl) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewUrl(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [previewUrl]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    const { attachment, error: uploadError } = await uploadAttachment(
      teamId,
      itemId,
      file
    );
    setUploading(false);
    if (uploadError || !attachment) {
      setError(uploadError ?? "Upload failed.");
      return;
    }
    setAttachments((prev) => [...prev, toView(attachment)]);
  }

  async function handleReplace(file: File, replacesAttachmentId: string) {
    setUploading(true);
    setError(null);
    const { attachment, error: uploadError } = await uploadAttachment(
      teamId,
      itemId,
      file,
      replacesAttachmentId
    );
    setUploading(false);
    if (uploadError || !attachment) {
      setError(uploadError ?? "Upload failed.");
      return;
    }
    setAttachments((prev) =>
      prev.map((a) => (a.id === replacesAttachmentId ? toView(attachment) : a))
    );
  }

  async function handleDelete() {
    if (!deleteTargetId) return;
    setDeleting(true);
    const res = await fetch(
      `/dashboard/board/api/teams/${teamId}/work-items/${itemId}/attachments/${deleteTargetId}`,
      { method: "DELETE" }
    );
    setDeleting(false);
    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== deleteTargetId));
      toast.success("Attachment deleted.");
    } else {
      const body = await res.json().catch(() => ({}));
      const message = body.error ?? "Could not delete this attachment.";
      setError(message);
      toast.error(message);
    }
    setDeleteTargetId(null);
  }

  async function toggleVersions(groupId: string) {
    if (expandedGroup === groupId) {
      setExpandedGroup(null);
      return;
    }
    setExpandedGroup(groupId);
    const res = await fetch(
      `/dashboard/board/api/teams/${teamId}/work-items/${itemId}/attachments?groupId=${groupId}`
    );
    if (!res.ok) return;
    const data = await res.json();
    setVersions(
      (data.attachments ?? []).map((a: Record<string, unknown>) => ({
        id: String(a._id),
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        blobUrl: a.blobUrl,
        uploadedBy: String(a.uploadedBy),
        groupId: String(a.groupId),
        version: a.version,
        createdAt: a.createdAt,
      }))
    );
  }

  return (
    <div className="border-border bg-panel rounded-lg border p-5 shadow-xs">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-slate text-[11px] font-semibold tracking-wider uppercase">
          Attachments
        </div>
        {canEdit && (
          <>
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="text-primary hover:text-primary-hover inline-flex items-center gap-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Upload className="h-3.5 w-3.5" />
              {uploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {error && (
        <p className="text-status-blocked mb-2 text-xs font-medium">{error}</p>
      )}

      {attachments.length === 0 ? (
        <div className="py-4 text-center">
          <div className="bg-muted text-slate mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-xl">
            <Paperclip className="h-4 w-4" />
          </div>
          <p className="text-slate text-xs">No attachments yet.</p>
        </div>
      ) : (
        <ul className="divide-border divide-y">
          {attachments.map((a) => (
            <li key={a.id} className="py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {isImage(a.contentType) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={a.blobUrl}
                      alt={a.filename}
                      onClick={() =>
                        setPreviewUrl({ url: a.blobUrl, alt: a.filename })
                      }
                      className="border-border h-12 w-12 shrink-0 cursor-pointer rounded-md border object-cover"
                    />
                  ) : (
                    <span className="border-border bg-muted text-slate flex h-12 w-12 shrink-0 items-center justify-center rounded-md border">
                      <Paperclip className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-medium">
                      {a.filename}
                      {a.version > 1 && (
                        <span className="text-slate ml-1 text-[10px] font-normal">
                          (v{a.version})
                        </span>
                      )}
                    </p>
                    <p className="text-slate text-[11px]">
                      {formatBytes(a.size)} · {uploaderNode(a.uploadedBy)} ·{" "}
                      <span title={fullDateTimeTitle(a.createdAt)}>
                        {new Date(a.createdAt).toLocaleDateString()}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleVersions(a.groupId)}
                    aria-label="Version history"
                    className="text-slate hover:bg-muted hover:text-ink rounded-md p-1.5"
                  >
                    <HistoryIcon className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={a.blobUrl}
                    download={a.filename}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Download ${a.filename}`}
                    className="text-slate hover:bg-muted hover:text-ink rounded-md p-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`Delete ${a.filename}`}
                      onClick={() => setDeleteTargetId(a.id)}
                      className="text-slate hover:bg-status-blocked-bg hover:text-status-blocked rounded-md p-1.5"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {expandedGroup === a.groupId && (
                <div className="border-border mt-2 ml-14 space-y-1 border-l pl-3">
                  {versions.length <= 1 ? (
                    <p className="text-slate text-[11px]">
                      No earlier versions.
                    </p>
                  ) : (
                    versions
                      .filter((v) => v.id !== a.id)
                      .map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2"
                        >
                          <p className="text-slate text-[11px]">
                            v{v.version} · {uploaderNode(v.uploadedBy)} ·{" "}
                            <span title={fullDateTimeTitle(v.createdAt)}>
                              {new Date(v.createdAt).toLocaleDateString()}
                            </span>
                          </p>
                          <a
                            href={v.blobUrl}
                            download={v.filename}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary-hover text-[11px] font-medium"
                          >
                            Download
                          </a>
                        </div>
                      ))
                  )}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setReplacingId(a.id);
                          replaceInputRef.current?.click();
                        }}
                        className="text-primary hover:text-primary-hover text-[11px] font-medium"
                      >
                        Upload new version
                      </button>
                    </>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <input
          ref={replaceInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && replacingId) handleReplace(file, replacingId);
            e.target.value = "";
            setReplacingId(null);
          }}
        />
      )}

      {previewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={previewUrl.alt}
          onClick={() => setPreviewUrl(null)}
          className="bg-ink/80 fixed inset-0 z-50 flex items-center justify-center p-6"
        >
          <button
            type="button"
            aria-label="Close preview"
            onClick={() => setPreviewUrl(null)}
            className="bg-panel/10 hover:bg-panel/20 absolute top-4 right-4 rounded-md p-2 text-white"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl.url}
            alt={previewUrl.alt}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
          />
        </div>
      )}
      <ConfirmDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => !open && setDeleteTargetId(null)}
        title="Delete this attachment?"
        description="All earlier versions will be removed too."
        confirmLabel="Delete"
        destructive
        pending={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

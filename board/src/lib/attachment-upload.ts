export type UploadedAttachment = {
  _id: string;
  filename: string;
  contentType: string;
  size: number;
  blobUrl: string;
  uploadedBy: string;
  groupId: string;
  version: number;
  createdAt: string;
};

/** Shared by the Attachments panel's upload button and the description/comment paste-and-drop handlers. */
export async function uploadAttachment(
  teamId: string,
  itemId: string,
  file: File,
  replacesAttachmentId?: string
): Promise<{ attachment?: UploadedAttachment; error?: string }> {
  const formData = new FormData();
  formData.append("file", file);
  if (replacesAttachmentId) formData.append("replacesAttachmentId", replacesAttachmentId);

  const res = await fetch(`/dashboard/board/api/teams/${teamId}/work-items/${itemId}/attachments`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { error: body.error ?? "Upload failed." };
  }
  const data = await res.json();
  return { attachment: data.attachment };
}

/** Reads files off a paste or drop event, uploads each, and returns markdown image refs to insert at the cursor. */
export async function uploadFilesFromEvent(
  teamId: string,
  itemId: string,
  files: FileList | File[]
): Promise<{ markdown: string; errors: string[] }> {
  const markdownParts: string[] = [];
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    const { attachment, error } = await uploadAttachment(teamId, itemId, file);
    if (error || !attachment) {
      errors.push(error ?? `Could not upload ${file.name}.`);
      continue;
    }
    markdownParts.push(`![${attachment.filename}](${attachment.blobUrl})`);
  }
  return { markdown: markdownParts.join("\n"), errors };
}

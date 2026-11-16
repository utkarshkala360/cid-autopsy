import "server-only";
import mongoose from "mongoose";
import { connectDB } from "@board/lib/mongodb";
import { ChangeHistory, type AttachmentAction, type WorkLogAction } from "@board/models/ChangeHistory";
import { extractMentionedMemberIds, type MentionableMember } from "@board/lib/mentions";
import type { WorkLogUnit } from "@board/models/WorkLog";

export type FieldDiff = { field: string; oldValue: unknown; newValue: unknown };

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  return value;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/** Diffs a fixed set of top-level fields between the before/after state of a Work Item. */
export function diffWorkItemFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const field of fields) {
    if (!valuesEqual(before[field], after[field])) {
      diffs.push({ field, oldValue: normalize(before[field]) ?? null, newValue: normalize(after[field]) ?? null });
    }
  }
  return diffs;
}

/** Diffs customFields key-by-key so each field gets its own history record (CT-1). */
export function diffCustomFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined
): FieldDiff[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const diffs: FieldDiff[] = [];
  for (const key of keys) {
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (!valuesEqual(oldValue, newValue)) {
      diffs.push({ field: `customFields.${key}`, oldValue: normalize(oldValue) ?? null, newValue: normalize(newValue) ?? null });
    }
  }
  return diffs;
}

type Id = mongoose.Types.ObjectId | string;

/** The only way a ChangeHistory document is ever created — there is no update/delete path (Non-Negotiable #5). */
export async function recordFieldChanges(params: {
  workItemId: Id;
  teamId: Id;
  memberId: Id;
  diffs: FieldDiff[];
}) {
  if (params.diffs.length === 0) return [];
  await connectDB();
  return ChangeHistory.insertMany(
    params.diffs.map((d) => ({
      workItemId: params.workItemId,
      teamId: params.teamId,
      memberId: params.memberId,
      kind: "field_change" as const,
      field: d.field,
      oldValue: d.oldValue,
      newValue: d.newValue,
      createdAt: new Date(),
    }))
  );
}

export async function recordComment(params: {
  workItemId: Id;
  teamId: Id;
  memberId: Id;
  commentText: string;
  teamMembers: MentionableMember[];
}) {
  await connectDB();
  const mentions = extractMentionedMemberIds(params.commentText, params.teamMembers);
  return ChangeHistory.create({
    workItemId: params.workItemId,
    teamId: params.teamId,
    memberId: params.memberId,
    kind: "comment",
    commentText: params.commentText,
    mentions: mentions.length ? mentions : undefined,
    createdAt: new Date(),
  });
}

/** CJ-2 (Module A): a Customer's Journey Stage change, logged the same append-only way as a Work Item field change. */
export async function recordCustomerStageChange(params: {
  customerId: Id;
  memberId: Id;
  oldValue: string | null;
  newValue: string | null;
}) {
  await connectDB();
  return ChangeHistory.create({
    customerId: params.customerId,
    memberId: params.memberId,
    kind: "field_change",
    field: "journeyStage",
    oldValue: params.oldValue,
    newValue: params.newValue,
    createdAt: new Date(),
  });
}

/** PL-2 (Module B): an Initiative's Lifecycle Stage change, same append-only pattern. */
export async function recordInitiativeStageChange(params: {
  initiativeId: Id;
  memberId: Id;
  oldValue: string | null;
  newValue: string | null;
}) {
  await connectDB();
  return ChangeHistory.create({
    initiativeId: params.initiativeId,
    memberId: params.memberId,
    kind: "field_change",
    field: "lifecycleStage",
    oldValue: params.oldValue,
    newValue: params.newValue,
    createdAt: new Date(),
  });
}

/**
 * Phase 16 (Design 1, StageTrack generalization): a Team's macroStage
 * change, logged the same append-only way as Customer.journeyStage/
 * Initiative.lifecycleStage above — the one new shape here is a row scoped
 * by `teamId` alone (no `workItemId`/`customerId`/`initiativeId`), since a
 * Team isn't itself a Work Item. `src/lib/audit-log.ts`'s CT-7 org audit
 * log already matches rows by `teamId` for the Work-Item-history case, so a
 * Team-only row surfaces there too, no separate read path needed.
 */
export async function recordTeamStageChange(params: {
  teamId: Id;
  memberId: Id;
  oldValue: string | null;
  newValue: string | null;
}) {
  await connectDB();
  return ChangeHistory.create({
    teamId: params.teamId,
    memberId: params.memberId,
    kind: "field_change",
    field: "macroStage",
    oldValue: params.oldValue,
    newValue: params.newValue,
    createdAt: new Date(),
  });
}

/** IT-9: attachment add/remove events, logged the same append-only way as everything else in this collection. */
export async function recordAttachmentChange(params: {
  workItemId: Id;
  teamId: Id;
  memberId: Id;
  action: AttachmentAction;
  attachmentId: Id;
  attachmentFilename: string;
}) {
  await connectDB();
  return ChangeHistory.create({
    workItemId: params.workItemId,
    teamId: params.teamId,
    memberId: params.memberId,
    kind: "attachment",
    attachmentAction: params.action,
    attachmentId: params.attachmentId,
    attachmentFilename: params.attachmentFilename,
    createdAt: new Date(),
  });
}

/**
 * WL-3: a WorkLog entry add/edit/remove event — an audit breadcrumb only,
 * same division of responsibility recordAttachmentChange already has (the
 * mutable row lives in its own collection; this is just the trail). Unlike
 * every other kind here, the underlying WorkLog row itself CAN later be
 * edited/deleted (confirmed with the user) — that's exactly why this is a
 * separate model rather than a ChangeHistory field_change row.
 */
export async function recordWorkLogChange(params: {
  workItemId: Id;
  teamId: Id;
  memberId: Id;
  action: WorkLogAction;
  entryId: Id;
  amount: number;
  unit: WorkLogUnit;
  date: Date;
}) {
  await connectDB();
  return ChangeHistory.create({
    workItemId: params.workItemId,
    teamId: params.teamId,
    memberId: params.memberId,
    kind: "work_log",
    workLogAction: params.action,
    workLogEntryId: params.entryId,
    workLogAmount: params.amount,
    workLogUnit: params.unit,
    workLogDate: params.date,
    createdAt: new Date(),
  });
}

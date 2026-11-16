import "server-only";
import mongoose from "mongoose";
import { WorkItem, type WorkItemDoc } from "@board/models/WorkItem";

/**
 * Enforces the sub-task hierarchy invariant — one level deep, same Team:
 * - the parent must exist on this Team,
 * - the parent can't itself be a sub-task (no grandchildren),
 * - the child can't already have sub-tasks of its own (no promoting a
 *   middle node),
 * - a Work Item can't be its own parent.
 * The only place this is checked — both the create and reparent paths call
 * through here rather than re-deriving the rules.
 */
export async function validateSubtaskParent(
  teamId: string,
  parentId: string,
  childId?: string
): Promise<{ ok: true; parent: WorkItemDoc } | { ok: false; error: string }> {
  if (!mongoose.isValidObjectId(parentId)) {
    return { ok: false, error: "Invalid parent Work Item." };
  }
  if (childId && parentId === childId) {
    return { ok: false, error: "A Work Item can't be its own sub-task." };
  }

  const parent = await WorkItem.findOne({ _id: parentId, teamId });
  if (!parent) {
    return { ok: false, error: "Parent Work Item not found on this Team." };
  }
  if (parent.parentId) {
    return {
      ok: false,
      error: "That Work Item is already a sub-task and can't have sub-tasks of its own.",
    };
  }

  if (childId) {
    const hasChildren = await WorkItem.exists({ parentId: childId });
    if (hasChildren) {
      return {
        ok: false,
        error: "This Work Item already has sub-tasks of its own and can't become one.",
      };
    }
  }

  return { ok: true, parent };
}

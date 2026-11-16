import "server-only";
import { Counter } from "@board/models/Counter";

/**
 * Next number in a Team's Work Item sequence (1, 2, 3, ...). Uses
 * findOneAndUpdate + $inc + upsert, a single atomic Mongo operation, so
 * concurrent creates on the same Team can never receive the same number —
 * and because nothing ever decrements this counter, a deleted Work Item's
 * number is never reissued.
 */
export async function nextWorkItemSeq(teamId: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { key: `workitem:${teamId}` },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  ).lean<{ seq: number }>();
  return counter!.seq;
}

/** Team-prefixed display key, e.g. "DEV-42". */
export function formatWorkItemKey(teamSlug: string, seq: number): string {
  return `${teamSlug.toUpperCase()}-${seq}`;
}

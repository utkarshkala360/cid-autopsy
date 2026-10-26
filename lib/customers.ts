import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";

export type Customer = { id: string; name: string };

export const getCustomer = cache(async (id: string): Promise<Customer | null> => {
  if (!/^\d{1,18}$/.test(id)) return null;
  const [row] = await db()`SELECT id, name FROM customers WHERE id = ${id}`;
  return row ? { id: String(row.id), name: row.name as string } : null;
});

export function customerPath(id: string, ...rest: string[]) {
  return ["/customers", id, ...rest].join("/");
}

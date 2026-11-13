// A fleet URL that names one client (`?client=`), as links from before the client hierarchy did: the
// client id and the rest of the query, so the route can move to /health/clients/<client>/….
export function withoutClient(query: Record<string, string | string[] | undefined>) {
  const client = query.client;
  if (typeof client !== "string" || !/^[\w-]{1,100}$/.test(client)) return null;
  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "client" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) rest.append(key, v);
  }
  return { client, rest: rest.size ? `?${rest}` : "" };
}

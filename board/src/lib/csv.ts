// RP-5: plain server-generated CSV, no new dependency. Shared by every CSV
// export route (dashboard report, sprint burndown/velocity) so escaping stays
// consistent in one place.

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows: unknown[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
}

export function csvResponse(filename: string, rows: unknown[][]): Response {
  const body = rowsToCsv(rows);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

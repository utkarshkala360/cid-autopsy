export function field(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

// A BIGSERIAL row id from a form; throws on anything else.
export function rowId(formData: FormData, key = "id") {
  const id = field(formData, key);
  if (!/^\d{1,18}$/.test(id)) throw new Error(`Invalid ${key}.`);
  return id;
}

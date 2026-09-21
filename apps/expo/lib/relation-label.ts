// The name to show for a related record: its name, title, a person's first and
// last name, or its email, whichever it has. The generated screens call it for
// every belongs_to field, so they never read a property the model lacks.
export function relationLabel(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  const text = (key: string) => (typeof record[key] === "string" ? (record[key] as string).trim() : "");
  const person = [text("first_name"), text("last_name")].filter(Boolean).join(" ");
  return text("name") || text("title") || person || text("label") || text("email");
}

export type FormResult = "W" | "D" | "L";

/**
 * Returns a short streak label like "3W streak" when the most recent results
 * form a run of the same outcome, otherwise null. Returns null when form is
 * missing or too short to be meaningful.
 */
export function streakLabel(form: FormResult[] | undefined | null): string | null {
  if (!form || form.length < 2) return null;
  const first = form[0];
  if (first !== "W" && first !== "L") return null;
  let count = 0;
  for (const r of form) {
    if (r !== first) break;
    count += 1;
  }
  if (count < 2) return null;
  const kind = first === "W" ? "win" : "loss";
  return `${count}-${kind} streak`;
}

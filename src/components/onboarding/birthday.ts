// Shared by first-run setup and the Settings profile, so both agree on what
// a real birthday is.

/**
 * What is wrong with a birthday, if anything. Every part is optional, but a
 * part that is given has to be a real one: day 45, the 31st of February and a
 * year in the future used to be saved as-is, and then Panda told the student
 * they were -3 years old.
 */
export function birthdayProblem(month: string, day: string, year: string): "day" | "year" | null {
  const thisYear = new Date().getFullYear();
  if (year) {
    const y = Number(year);
    if (year.length !== 4 || y > thisYear || y < thisYear - 100) return "year";
  }
  if (day) {
    const d = Number(day);
    // Without a year, Feb 29 is allowed: someone born in a leap year exists.
    const max = month ? new Date(Date.UTC(year ? Number(year) : 2000, Number(month), 0)).getUTCDate() : 31;
    if (d < 1 || d > max) return "day";
  }
  return null;
}

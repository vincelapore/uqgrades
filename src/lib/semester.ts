export type SemesterType = "Semester 1" | "Semester 2" | "Summer";
export type DeliveryMode = "Internal" | "External";

const SEMESTER_TYPES: SemesterType[] = ["Semester 1", "Semester 2", "Summer"];
const DELIVERY_MODES: DeliveryMode[] = ["Internal", "External"];

export type SemesterSelection = {
  year: number;
  semester: SemesterType;
  delivery: DeliveryMode;
};

/** Validate and parse semester type from query string. Returns null if invalid. */
export function parseSemesterType(value: string | null): SemesterType | null {
  if (!value || !SEMESTER_TYPES.includes(value as SemesterType)) return null;
  return value as SemesterType;
}

/** Validate and parse delivery mode from query string. Returns null if invalid. */
export function parseDeliveryMode(value: string | null): DeliveryMode | null {
  if (!value || !DELIVERY_MODES.includes(value as DeliveryMode)) return null;
  return value as DeliveryMode;
}

/**
 * Return the current UQ semester based on today's date (Sem 1, Sem 2, or Summer).
 */
export function getCurrentSemester(): SemesterSelection {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  // Sem 1: Feb-June (roughly months 2-6)
  // Sem 2: July-Nov (roughly months 7-11)
  // Summer: Dec-Jan (roughly months 12, 1)
  
  if (month >= 2 && month <= 6) {
    return { year, semester: "Semester 1", delivery: "Internal" };
  } else if (month >= 7 && month <= 11) {
    return { year, semester: "Semester 2", delivery: "Internal" };
  } else {
    // Dec/Jan - could be Summer or upcoming Sem 1
    // If it's Dec/early Jan, it's Summer
    // If it's late Jan, it's upcoming Sem 1
    if (month === 12 || (month === 1 && now.getDate() < 15)) {
      return { year: year - 1, semester: "Summer", delivery: "Internal" };
    } else {
      return { year, semester: "Semester 1", delivery: "Internal" };
    }
  }
}

/** Years to show in the year dropdown (current - 7 through current + 2). Updates automatically. */
export function getSelectableYears(): number[] {
  const year = new Date().getFullYear();
  const start = year - 7;
  const end = year + 2;
  const years: number[] = [];
  for (let y = start; y <= end; y++) years.push(y);
  return years;
}

export function formatSemester(sel: SemesterSelection): string {
  return `${sel.semester} ${sel.year} (${sel.delivery})`;
}

export function getSemesterDates(sel: SemesterSelection): { start: string; end: string } | null {
  // Based on UQ Academic Calendar 2026
  if (sel.semester === "Semester 1") {
    return {
      start: `${sel.year}-02-23`,
      end: `${sel.year}-06-20`,
    };
  } else if (sel.semester === "Semester 2") {
    return {
      start: `${sel.year}-07-22`,
      end: `${sel.year}-11-15`,
    };
  } else if (sel.semester === "Summer") {
    // Summer semester typically runs Nov-Dec or Dec-Jan
    if (sel.year >= 2026) {
      return {
        start: `${sel.year}-11-25`,
        end: `${sel.year + 1}-02-14`,
      };
    } else {
      return {
        start: `${sel.year}-11-25`,
        end: `${sel.year + 1}-02-14`,
      };
    }
  }
  return null;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatDate(date: Date): string {
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  return `${day} ${month}`;
}

function formatDateWithYear(date: Date): string {
  const day = date.getDate();
  const month = MONTH_NAMES[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

export function formatSemesterDates(sel: SemesterSelection): string {
  const dates = getSemesterDates(sel);
  if (!dates) return "";
  
  const startDate = new Date(dates.start + "T00:00:00");
  const endDate = new Date(dates.end + "T00:00:00");
  const startStr = formatDate(startDate);
  const endStr = formatDateWithYear(endDate);
  
  return `${startStr} - ${endStr}`;
}

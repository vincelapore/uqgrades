import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string";
import type { CourseAssessment } from "./uq-scraper";
import type { GradeBand } from "./grades";
import type { SemesterSelection } from "./semester";

export type CourseState = {
  course: CourseAssessment;
  marks: (string | number | null)[]; // Can be fraction string like "9/10", percentage number, or null
  /** Optional "out of" per assessment; when set, mark input is integer marks and we show "Need N/outOf" */
  outOf?: (number | null)[];
  goalGrade: GradeBand;
  semester?: SemesterSelection;
};

export type AppState = {
  courses: CourseState[];
  defaultSemester?: SemesterSelection;
};

/**
 * Encode app state (courses, marks, semester) into a compressed string for URL storage.
 */
export function encodeState(state: AppState): string {
  return compressToEncodedURIComponent(JSON.stringify(state));
}

/**
 * Decode app state from a compressed URL query string. Returns null if invalid or corrupted.
 */
export function decodeState(encoded: string | null): AppState | null {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as AppState).courses)) {
      return null;
    }
    return parsed as AppState;
  } catch {
    return null;
  }
}


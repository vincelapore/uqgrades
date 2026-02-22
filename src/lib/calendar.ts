export type CalendarEvent = {
  title: string;
  startDate: Date;
  endDate: Date;
  description?: string;
};

const MONTH_ABBR: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

function parseShortYear(yy: string): number {
  const n = parseInt(yy, 10);
  return n <= 50 ? 2000 + n : 1900 + n; // 23 -> 2023, 99 -> 1999
}

/**
 * Parse various date formats from UQ course profiles
 * Supports formats like:
 * - "2/04/2026 1:00 pm"
 * - "13/04/2026 - 17/04/2026"
 * - "Week 2: 4/03/2026 1:00 pm"
 * - "End of Semester Exam Period 6/06/2026 - 20/06/2026"
 * - Archive: "15 Sep 23 16:00", "24 Jul 23 - 20 Oct 23", "26 Oct 23 19:00 - 28 Oct 23 21:30"
 */
export function parseDueDate(dateString: string | null | undefined): CalendarEvent[] {
  if (!dateString) return [];

  const events: CalendarEvent[] = [];
  const trimmed = dateString.trim();

    // Handle multiple dates separated by newlines (e.g., weekly problem sets)
    const lines = trimmed.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
    for (const line of lines) {
        // Archive format: "DD MMM YY HH:MM - DD MMM YY HH:MM" (range with 24h time)
        const archiveRangeTimeMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\s+(\d{1,2}):(\d{2})\s*-\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\s+(\d{1,2}):(\d{2})/i);
        if (archiveRangeTimeMatch) {
            const [, d1, m1, y1, h1, min1, d2, m2, y2, h2, min2] = archiveRangeTimeMatch;
            const month1 = MONTH_ABBR[m1.toLowerCase()];
            const month2 = MONTH_ABBR[m2.toLowerCase()];
            if (month1 != null && month2 != null) {
                const startDate = new Date(parseShortYear(y1), month1 - 1, parseInt(d1, 10), parseInt(h1, 10), parseInt(min1, 10));
                const endDate = new Date(parseShortYear(y2), month2 - 1, parseInt(d2, 10), parseInt(h2, 10), parseInt(min2, 10));
                if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                    events.push({ title: extractTitle(line), startDate, endDate, description: line });
                }
            }
            continue;
        }

        // Archive format: "DD MMM YY - DD MMM YY" (range, no time)
        const archiveRangeMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\s*-\s*(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})/i);
        if (archiveRangeMatch) {
            const [, d1, m1, y1, d2, m2, y2] = archiveRangeMatch;
            const month1 = MONTH_ABBR[m1.toLowerCase()];
            const month2 = MONTH_ABBR[m2.toLowerCase()];
            if (month1 != null && month2 != null) {
                const startDate = new Date(parseShortYear(y1), month1 - 1, parseInt(d1, 10), 9, 0);
                const endDate = new Date(parseShortYear(y2), month2 - 1, parseInt(d2, 10), 17, 0);
                if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                    events.push({ title: extractTitle(line), startDate, endDate, description: line });
                }
            }
            continue;
        }

        // Archive format: "DD MMM YY HH:MM" (single with 24h time)
        const archiveSingleTimeMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})\s+(\d{1,2}):(\d{2})/i);
        if (archiveSingleTimeMatch) {
            const [, day, m, yy, hour, minute] = archiveSingleTimeMatch;
            const month = MONTH_ABBR[m.toLowerCase()];
            if (month != null) {
                const date = new Date(parseShortYear(yy), month - 1, parseInt(day, 10), parseInt(hour, 10), parseInt(minute, 10));
                if (!isNaN(date.getTime())) {
                    events.push({
                        title: extractTitle(line),
                        startDate: date,
                        endDate: new Date(date.getTime() + 60 * 60 * 1000),
                        description: line
                    });
                }
            }
            continue;
        }

        // Archive format: "DD MMM YY" (single, no time)
        const archiveSingleMatch = line.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{2})(?:\s|$|,)/i);
        if (archiveSingleMatch) {
            const [, day, m, yy] = archiveSingleMatch;
            const month = MONTH_ABBR[m.toLowerCase()];
            if (month != null) {
                const date = new Date(parseShortYear(yy), month - 1, parseInt(day, 10), 23, 59);
                if (!isNaN(date.getTime())) {
                    events.push({
                        title: extractTitle(line),
                        startDate: new Date(date.getTime() - 60 * 60 * 1000),
                        endDate: date,
                        description: line
                    });
                }
            }
            continue;
        }

        // Extract date patterns (Australian format: DD/MM/YYYY)
        // Pattern 1: Single date with time "DD/MM/YYYY HH:MM am/pm"
        const singleDateMatch = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
        if (singleDateMatch) {
            const [, day, month, year, hour, minute, ampm] = singleDateMatch;
            // Note: JavaScript Date uses 0-indexed months, so month - 1
            const hour24 = parseInt(hour) + (ampm.toLowerCase() === 'pm' && parseInt(hour) !== 12 ? 12 : 0) - (ampm.toLowerCase() === 'am' && parseInt(hour) === 12 ? 12 : 0);
            const date = new Date(
                parseInt(year),
                parseInt(month) - 1, // Month is 0-indexed
                parseInt(day),
                hour24,
                parseInt(minute)
            );
            // Validate date
            if (!isNaN(date.getTime())) {
                events.push({
                    title: extractTitle(line),
                    startDate: date,
                    endDate: new Date(date.getTime() + 60 * 60 * 1000), // 1 hour duration
                    description: line
                });
            }
            continue;
        }

        // Pattern 2: Date range "DD/MM/YYYY - DD/MM/YYYY"
        const dateRangeMatch = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (dateRangeMatch) {
            const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = dateRangeMatch;
            const startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay), 9, 0); // 9 AM default
            const endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay), 17, 0); // 5 PM default
            // Validate dates
            if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                events.push({
                    title: extractTitle(line),
                    startDate,
                    endDate,
                    description: line
                });
            }
            continue;
        }

        // Pattern 3: Single date without time "DD/MM/YYYY"
        const singleDateNoTimeMatch = line.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (singleDateNoTimeMatch) {
            const [, day, month, year] = singleDateNoTimeMatch;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 23, 59); // End of day
            // Validate date
            if (!isNaN(date.getTime())) {
                events.push({
                    title: extractTitle(line),
                    startDate: new Date(date.getTime() - 60 * 60 * 1000), // 1 hour before
                    endDate: date,
                    description: line
                });
            }
            continue;
        }
    }

  return events;
}

/**
 * Extract a clean title from a date string line.
 * Strips trailing date/time so we don't get "12/06/2026 3" or "3:00 pm" in the title.
 */
function extractTitle(line: string): string {
  // Remove common prefixes like "Week X:", "End of Semester Exam Period", etc.
  let cleaned = line
    .replace(/^Week\s+\d+:\s*/i, '')
    .replace(/^End\s+of\s+Semester\s+Exam\s+Period\s*/i, '')
    .trim();

  // If there's a colon, take the part before it (and strip any date/time from that part too)
  const colonIndex = cleaned.indexOf(':');
  if (colonIndex > 0) {
    cleaned = cleaned.substring(0, colonIndex).trim();
  }

  // Strip trailing date + time (AU format DD/MM/YYYY or archive DD MMM YY), including partial time like " 3" or " 3:00 pm"
  cleaned = cleaned
    .replace(/\s*-?\s*\d{1,2}\/\d{1,2}\/\d{4}\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2})?\s*$/i, '')
    .replace(/\s*-?\s*\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2}\s*(?:\d{1,2}(?::\d{2})?|\d{1,2})?\s*$/i, '')
    .trim();

  return cleaned;
}

/**
 * Format date for display
 */
export function formatEventDate(date: Date): string {
  return date.toLocaleDateString('en-AU', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Generate iCal format string (for future use)
 */
export function generateICal(events: CalendarEvent[], courseCode: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UQ Grades//Calendar Export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  events.forEach((event, index) => {
    const uid = `${courseCode}-${index}-${Date.now()}@uqgrades.com`;
    const start = formatICalDate(event.startDate);
    const end = formatICalDate(event.endDate);
    
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${escapeICalText(event.title)}`,
      event.description ? `DESCRIPTION:${escapeICalText(event.description)}` : '',
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.filter(l => l.length > 0).join('\r\n');
}

function formatICalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function escapeICalText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

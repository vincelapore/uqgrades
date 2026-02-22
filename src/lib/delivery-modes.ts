import * as cheerio from "cheerio";
import type { SemesterSelection } from "./semester";

const UQ_COURSE_URL = "https://programs-courses.uq.edu.au/course.html";

export type DeliveryModeOption = {
  delivery: "Internal" | "External";
  location?: string;
  courseProfileUrl: string;
};

async function fetchHTML(url: string): Promise<string> {
  console.log("[DeliveryModes] Fetching URL:", url);
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; uqgrades-bot/1.0; +https://uqgrades.com)",
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  return response.text();
}

export async function fetchAvailableDeliveryModes(
  courseCode: string,
  year: number,
  semester: "Semester 1" | "Semester 2" | "Summer"
): Promise<DeliveryModeOption[]> {
  console.log("[DeliveryModes] Fetching delivery modes for:", courseCode, year, semester);
  const url = `${UQ_COURSE_URL}?course_code=${encodeURIComponent(courseCode)}`;
  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  const modes: DeliveryModeOption[] = [];
  const semesterType = semester.toLowerCase();
  const yearStr = year.toString();

  // Find both current and archived offerings tables by ID
  const currentTable = $("#course-current-offerings");
  const archivedTable = $("#course-archived-offerings");
  
  const tables: cheerio.Cheerio[] = [];
  if (currentTable.length) {
    tables.push(currentTable);
    console.log("[DeliveryModes] Found current offerings table");
  }
  if (archivedTable.length) {
    tables.push(archivedTable);
    console.log("[DeliveryModes] Found archived offerings table");
  }

  if (tables.length === 0) {
    throw new Error("Could not find course offerings tables. The course may not be available or the page structure has changed.");
  }

  // Search all tables for matching semester/year
  tables.forEach((table) => {
    table.find("tbody tr").each((_, row) => {
      // Get structured data from columns
      const semesterCell = $(row).find("td").eq(0).text().trim();
      const locationCell = $(row).find(".course-offering-location").text().trim();
      const modeCell = $(row).find(".course-offering-mode").text().trim();
      const profileCell = $(row).find(".course-offering-profile");
      
      const rowText = semesterCell.toLowerCase();
      
      // Check if this row matches our semester and year
      const hasSemesterType = 
        (semesterType.includes("semester 1") && (rowText.includes("semester 1") || rowText.includes("sem 1"))) ||
        (semesterType.includes("semester 2") && (rowText.includes("semester 2") || rowText.includes("sem 2"))) ||
        (semesterType.includes("summer") && rowText.includes("summer"));
      
      const hasYear = rowText.includes(yearStr);
      
      if (hasSemesterType && hasYear) {
        // Find the course profile link
        const profileLink = profileCell.find('a[href*="course-profile"], a[href*="course-profiles"], a[href*="archive.course-profiles"]').first();
        const href = profileLink.attr("href");
        
        if (href && !href.includes("unavailable")) {
          let courseProfileUrl: string;
          if (href.startsWith("http")) {
            courseProfileUrl = href;
          } else if (href.startsWith("/")) {
            courseProfileUrl = new URL(href, "https://course-profiles.uq.edu.au").href;
          } else {
            courseProfileUrl = new URL(href, "https://course-profiles.uq.edu.au").href;
          }
          
          // Determine delivery mode from mode cell text
          const modeText = modeCell.toLowerCase();
          let delivery: "Internal" | "External" | null = null;
          
          if (modeText.includes("external")) {
            delivery = "External";
          } else if (modeText.includes("internal") || modeText.includes("in person") || modeText.includes("flexible")) {
            delivery = "Internal";
          }
          
          // Extract location
          const location = locationCell || undefined;
          
          if (delivery) {
            modes.push({ delivery, location, courseProfileUrl });
          }
        }
      }
      return undefined;
    });
  });

  // Remove duplicates based on delivery mode and URL
  const uniqueModes = modes.filter((mode, index, self) =>
    index === self.findIndex((m) => m.delivery === mode.delivery && m.courseProfileUrl === mode.courseProfileUrl)
  );

  console.log("[DeliveryModes] Found", uniqueModes.length, "delivery modes:", uniqueModes);
  return uniqueModes;
}

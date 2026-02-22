import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import { fetchUqHtml } from "./fetch-uq";
import type { SemesterSelection } from "./semester";

type CheerioElement = cheerio.Cheerio<Element>;
/** Used for variables that receive $() results (which may be AnyNode). */
type CheerioAny = cheerio.Cheerio<AnyNode>;

export type AssessmentItem = {
  name: string;
  weight: number | "pass/fail";
  dueDate?: string | null;
  isHurdle?: boolean;
  hurdleThreshold?: number | null; // Percentage threshold if clearly stated (e.g., "Pass threshold: 80%")
  hurdleRequirements?: string | null; // Specific hurdle requirements text for this assessment
};

export type CourseAssessment = {
  courseCode: string;
  title?: string | null;
  items: AssessmentItem[];
  semester?: SemesterSelection;
  courseProfileUrl?: string | null;
  hurdleInformation?: string | null; // Raw text from "Additional course grading information" section
};

const UQ_COURSE_URL = "https://programs-courses.uq.edu.au/course.html";

async function fetchHTML(url: string): Promise<string> {
  console.log("[Scraper] Fetching URL:", url);
  const html = await fetchUqHtml(url);
  console.log("[Scraper] HTML length:", html.length, "characters");
  return html;
}

export async function fetchCourseAssessment(
  courseCode: string,
  semester?: SemesterSelection,
): Promise<CourseAssessment> {
  console.log("[Scraper] Starting fetchCourseAssessment for:", courseCode);
  console.log("[Scraper] Semester:", semester);
  const url = `${UQ_COURSE_URL}?course_code=${encodeURIComponent(courseCode)}`;
  console.log("[Scraper] Target URL:", url);

  const html = await fetchHTML(url);
  const $ = cheerio.load(html);

  // Title – look for course code and name
  // The page has format: "Mathematical Foundations II (MATH1050)"
  let title: string | null = null;
  
  // Look for h1 or h2 with course name and code
  $("h1, h2").each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes(courseCode) && !text.toLowerCase().includes("university of queensland")) {
      title = text;
      console.log("[Scraper] Found title from heading:", title);
      return false;
    }
    return undefined;
  });
  
  // Fallback: extract from page title or meta
  if (!title) {
    const pageTitle = $("title").text();
    if (pageTitle && pageTitle.includes(courseCode)) {
      title = pageTitle.split("-")[0].trim();
      console.log("[Scraper] Found title from page title:", title);
    }
  }
  
  // Final fallback: just use course code
  if (!title) {
    title = courseCode;
  }
  
  console.log("[Scraper] Using title:", title);

  // Find the course profile link from the "Current course offerings" table
  // The table has rows with semester info and a "Course Profile" link
  let courseProfileLink: string | null = null;
  
  console.log("[Scraper] Looking for course offerings table...");
  
  // Find tables by their specific IDs
  const currentTable = $("#course-current-offerings");
  const archivedTable = $("#course-archived-offerings");
  
  console.log("[Scraper] Current table found:", currentTable.length > 0);
  console.log("[Scraper] Archived table found:", archivedTable.length > 0);
  
  // Helper function to search a table for matching semester
  const searchTableForSemester = (table: CheerioElement): boolean => {
    if (!table || !table.length) return false;
    
    console.log("[Scraper] Searching offerings table for matching semester...");
    const semesterMatch = semester 
      ? `${semester.semester} ${semester.year}`.toLowerCase()
      : null;
    const deliveryMatch = semester?.delivery?.toLowerCase() || null;
    
    console.log("[Scraper] Looking for semester:", semesterMatch, "delivery:", deliveryMatch);
    
    // Search table rows for matching semester
    // We need to match BOTH the semester type AND the year exactly
    const semesterType = semester?.semester?.toLowerCase() || null;
    const yearStr = semester?.year?.toString() || null;
    
    let found = false;
    table.find("tbody tr").each((_, row) => {
      // Get structured data from columns
      const semesterCell = $(row).find("td").eq(0).text().trim();
      const locationCell = $(row).find(".course-offering-location").text().trim();
      const modeCell = $(row).find(".course-offering-mode").text().trim();
      
      const rowText = semesterCell.toLowerCase();
      
      // Check if this row matches our semester
      let matches = false;
      if (semesterMatch && semesterType && yearStr) {
        // Strict matching: must contain both semester type AND year
        // Check for semester type (semester 1, semester 2, summer)
        const hasSemesterType = 
          (semesterType.includes("semester 1") && (rowText.includes("semester 1") || rowText.includes("sem 1"))) ||
          (semesterType.includes("semester 2") && (rowText.includes("semester 2") || rowText.includes("sem 2"))) ||
          (semesterType.includes("summer") && rowText.includes("summer"));
        
        // Check for exact year match
        const hasYear = rowText.includes(yearStr);
        
        matches = hasSemesterType && hasYear;
        
        if (deliveryMatch && matches) {
          // Check delivery mode from mode cell
          const modeText = modeCell.toLowerCase();
          const matchesDelivery = 
            (deliveryMatch === "external" && modeText.includes("external")) ||
            (deliveryMatch === "internal" && (modeText.includes("internal") || modeText.includes("in person") || modeText.includes("flexible")));
          matches = matches && matchesDelivery;
        }
      } else {
        // If no semester specified, take the first available
        matches = true;
      }
      
      if (matches) {
        // Find the "Course Profile" link in the profile column
        const profileCell = $(row).find(".course-offering-profile");
        const profileLink = profileCell.find('a[href*="course-profile"], a[href*="course-profiles"], a[href*="archive.course-profiles"]').first();
        const href = profileLink.attr("href");
        
        if (href && !href.includes("unavailable")) {
          if (href.startsWith("http")) {
            courseProfileLink = href;
          } else if (href.startsWith("/")) {
            courseProfileLink = new URL(href, "https://course-profiles.uq.edu.au").href;
          } else {
            courseProfileLink = new URL(href, "https://course-profiles.uq.edu.au").href;
          }
          console.log("[Scraper] Found course profile link from offerings table:", courseProfileLink);
          console.log("[Scraper] Semester cell:", semesterCell);
          console.log("[Scraper] Location:", locationCell, "Mode:", modeCell);
          console.log("[Scraper] Matched semester:", semesterType, "year:", yearStr);
          found = true;
          return false; // Stop searching
        }
      }
      return undefined;
    });
    return found;
  };
  
  // Check if we found any offerings table at all
  if (currentTable.length === 0 && archivedTable.length === 0) {
    throw new Error("Could not find course offerings tables. The course may not be available or the page structure has changed.");
  }
  
  // Search current offerings first
  if (currentTable.length > 0) {
    if (searchTableForSemester(currentTable)) {
      // Found a match, we're done
    }
  }
  
  // If not found in current offerings, search archived offerings
  if (!courseProfileLink && archivedTable.length > 0) {
    console.log("[Scraper] Not found in current offerings, checking archived offerings...");
    searchTableForSemester(archivedTable);
  }

  // If still no match found, throw an error with clear message
  if (!courseProfileLink && semester) {
    const semesterDisplay = `${semester.semester} ${semester.year} (${semester.delivery})`;
    throw new Error(`Course profile not found for ${semesterDisplay}. Please verify the semester, year, and delivery mode are correct.`);
  }
  
  // If no semester was specified but no link found, also error
  if (!courseProfileLink && !semester) {
    throw new Error("No course profile link found. Please specify a semester, year, and delivery mode.");
  }

  // If we found a course profile link, follow it; otherwise, try to find assessment table on current page
  // (TS doesn't narrow courseProfileLink here because it's assigned in a callback; after the throws above it is string)
  let assessmentHTML = html;
  const profileLink = courseProfileLink as unknown as string;
  if (profileLink !== url && !profileLink.endsWith("#")) {
    try {
      console.log("[Scraper] Following course profile link...");
      assessmentHTML = await fetchHTML(profileLink);
      console.log("[Scraper] Successfully fetched course profile page");

      // Archive course profiles use section_1 for the main link; assessment is in section_5
      const archiveSection1Match = profileLink.match(
        /^https?:\/\/archive\.course-profiles\.uq\.edu\.au\/student_section_loader\/section_1\/(\d+)(?:\/|\?|$)/i
      );
      if (archiveSection1Match) {
        const profileId = archiveSection1Match[1];
        const section5Url = `https://archive.course-profiles.uq.edu.au/student_section_loader/section_5/${profileId}`;
        try {
          console.log("[Scraper] Fetching archive assessment section (section_5)...");
          assessmentHTML = await fetchHTML(section5Url);
          console.log("[Scraper] Successfully fetched archive assessment section");
        } catch (sectionErr) {
          console.warn("[Scraper] Failed to fetch archive section_5, using section_1:", sectionErr);
        }
      }
    } catch (err) {
      // If following the link fails, fall back to current page
      console.warn("[Scraper] Failed to follow course profile link, using current page:", err);
    }
  }

  const $assessment = profileLink !== url && !profileLink.endsWith("#")
    ? cheerio.load(assessmentHTML)
    : $;
  console.log("[Scraper] Searching for assessment table...");

  // Assessment table:
  // Jac may change markup, so we:
  // 1. Find a heading containing "Assessment"
  // 2. Grab the nearest table that follows it
  // 3. Also check for tabs/sections that might contain assessment
  let assessmentTable: CheerioElement | null = null;

  const headings: string[] = [];
  $assessment("h1, h2, h3, h4, h5").each((_, el) => {
    const headingText = $assessment(el).text().trim();
    headings.push(headingText);
    const lowerText = headingText.toLowerCase();
    if (lowerText.includes("assessment") && !assessmentTable) {
      // Look for table after this heading
      const table = $assessment(el).nextAll("table").first();
      if (table && table.length) {
        assessmentTable = table;
        console.log("[Scraper] Found assessment table via heading:", headingText);
      }
      // Also check if there's a div/section with tables inside
      const nextSection = $assessment(el).nextAll("div, section").first();
      if (nextSection && nextSection.length) {
        const sectionTable = nextSection.find("table").first();
        if (sectionTable && sectionTable.length) {
          assessmentTable = sectionTable;
          console.log("[Scraper] Found assessment table in section after heading:", headingText);
        }
      }
    }
  });
  console.log("[Scraper] Found headings:", headings.slice(0, 15));
  
  // Also check for tabs/buttons that might switch to assessment view
  const tabLinks = $assessment('a[href*="#"], button, [role="tab"]').map((_, el) => {
    const text = $assessment(el).text().toLowerCase();
    const href = $assessment(el).attr("href") || "";
    return { text, href };
  }).get();
  console.log("[Scraper] Found tabs/buttons:", tabLinks.filter(t => t.text.includes("assessment") || t.href.includes("assessment")).slice(0, 5));

  const assessmentTableRef = assessmentTable as CheerioElement | null;
  if (!assessmentTableRef || !assessmentTableRef.length) {
    console.log("[Scraper] Trying fallback: searching all tables");
    const tableCount = $assessment("table").length;
    console.log("[Scraper] Total tables found:", tableCount);
    
    // Fallback: Look for tables with assessment-related headers
    $assessment("table").each((idx, el) => {
      const headerText = $assessment(el).find("th").text().toLowerCase();
      const headerCells = $assessment(el).find("th").map((_, th) => $assessment(th).text().trim()).get();
      console.log(`[Scraper] Table ${idx + 1} headers:`, headerCells);
      
      // Check if this looks like an assessment table
      const hasAssessment = headerText.includes("assessment") || headerText.includes("item");
      const hasWeight = headerText.includes("weight") || headerText.includes("%");
      const hasDue = headerText.includes("due") || headerText.includes("date");
      
      if (hasAssessment && (hasWeight || hasDue)) {
        assessmentTable = $assessment(el);
        console.log("[Scraper] Found assessment table via header match (assessment + weight/due)");
        return false;
      }
      
      // Also check if table has rows with percentage values (common in assessment tables)
      const rows = $assessment(el).find("tbody tr, tr").slice(0, 3);
      let hasPercentages = false;
      rows.each((_, row) => {
        const cells = $assessment(row).find("td").map((_, td) => $assessment(td).text().trim()).get();
        if (cells.some(c => c.includes("%") && !isNaN(parseFloat(c.replace("%", ""))))) {
          hasPercentages = true;
        }
      });
      
      if (hasPercentages && rows.length > 0) {
        assessmentTable = $assessment(el);
        console.log("[Scraper] Found assessment table via percentage detection");
        return false;
      }
      
      return undefined;
    });
  }

  if (!assessmentTableRef || !assessmentTableRef.length) {
    console.error("[Scraper] ERROR: Could not locate assessment table");
    console.error("[Scraper] Page HTML sample:", assessmentHTML.substring(0, 2000));
    console.error("[Scraper] All table structures:");
    $assessment("table").each((idx, el) => {
      const html = $assessment(el).html()?.substring(0, 500);
      console.error(`[Scraper] Table ${idx + 1}:`, html);
    });
    throw new Error("Could not locate assessment table for this course. The course profile may not have assessment information available, or the page structure may have changed.");
  }
  const tableToUse = assessmentTable as unknown as CheerioElement;
  console.log("[Scraper] Assessment table found, parsing rows...");

  // First, identify column indices by looking at table headers
  let assessmentTaskColumnIndex: number | null = null;
  let weightColumnIndex: number | null = null;
  let dueDateColumnIndex: number | null = null;

  // Look for header row (thead tr or first tr with th elements)
  const headerRow = tableToUse.find("thead tr").first();
  const headerCells = headerRow.length > 0
    ? headerRow.find("th, td")
    : tableToUse.find("tr").first().find("th, td");
  
  if (headerCells.length > 0) {
    console.log("[Scraper] Found header row with", headerCells.length, "columns");
    headerCells.each((index, cell) => {
      const headerText = $assessment(cell).text().toLowerCase().trim();
      console.log(`[Scraper] Header column ${index}: "${headerText}"`);
      
      if (headerText.includes("assessment task") || headerText.includes("assessment")) {
        assessmentTaskColumnIndex = index;
        console.log(`[Scraper] Found "Assessment task" column at index ${index}`);
      } else if (headerText.includes("weight") || headerText.includes("weighting")) {
        weightColumnIndex = index;
        console.log(`[Scraper] Found "Weight" column at index ${index}`);
      } else if (headerText.includes("due") || headerText.includes("date")) {
        dueDateColumnIndex = index;
        console.log(`[Scraper] Found "Due date" column at index ${index}`);
      }
    });
  }
  
  // If we couldn't find headers, fall back to heuristics
  if (assessmentTaskColumnIndex === null) {
    console.log("[Scraper] Could not identify 'Assessment task' column from headers, using heuristics");
  }

  const items: AssessmentItem[] = [];
  const rows = tableToUse.find("tbody tr");
  console.log("[Scraper] Found", rows.length, "table rows");

  rows
    .filter((_, el) => $assessment(el).find("td").length > 1)
    .each((_, row) => {
      const cells = $assessment(row).find("td");
      const cellCount = cells.length;
      
      // Extract name from the "Assessment task" column
      let name: string | null = null;
      if (assessmentTaskColumnIndex !== null && assessmentTaskColumnIndex < cellCount) {
        // Extract text from the assessment task column (may be a link)
        const taskCell = cells.eq(assessmentTaskColumnIndex);
        name = taskCell.text().trim();
        // If it's a link, get the link text (which is usually cleaner)
        const linkText = taskCell.find("a").text().trim();
        if (linkText) {
          name = linkText;
        }
      } else {
        // Fallback: use first cell if we couldn't identify the column
        name = cells.eq(0).text().trim();
      }
      
      const textCells = cells
        .map((__, c) => $assessment(c).text().trim())
        .get()
        .filter(Boolean);

      if (!textCells.length || !name) {
        console.log("[Scraper] Skipping empty row or missing name");
        return;
      }

      console.log("[Scraper] Parsing row with cells:", textCells);
      console.log("[Scraper] Extracted name from assessment task column:", name);

      // Extract weight from the weight column if identified, otherwise use heuristics
      let weight: number | "pass/fail" = 0;
      
      if (weightColumnIndex !== null && weightColumnIndex < cellCount) {
        const weightCellText = cells.eq(weightColumnIndex).text().trim();
        // Check for pass/fail
        if (/pass\s*\/\s*fail|pass\/fail|pass-fail/i.test(weightCellText)) {
          weight = "pass/fail";
          console.log("[Scraper] Found pass/fail weight");
        } else {
          // Extract percentage
          const m = weightCellText.match(/([\d.]+)/);
          if (m) {
            weight = parseFloat(m[1]);
            console.log("[Scraper] Found weight:", weight, "%");
          }
        }
      } else {
        // Fallback: use heuristics to find weight cell
        const passFailCell = textCells.find((t) => 
          /pass\s*\/\s*fail|pass\/fail|pass-fail/i.test(t)
        );
        
        if (passFailCell) {
          weight = "pass/fail";
          console.log("[Scraper] Found pass/fail weight (heuristic)");
        } else {
          // Look for percentage or numeric weight
          let weightCell =
            textCells.find((t) => t.includes("%")) ??
            textCells.find((t) => !Number.isNaN(parseFloat(t)));
          if (weightCell) {
            const m = weightCell.match(/([\d.]+)/);
            if (m) {
              weight = parseFloat(m[1]);
              console.log("[Scraper] Found weight (heuristic):", weight, "%");
            }
          }
        }
      }

      // Extract due date from the due date column if identified, otherwise use heuristics
      let dueCell: string | null = null;
      if (dueDateColumnIndex !== null && dueDateColumnIndex < cellCount) {
        dueCell = cells.eq(dueDateColumnIndex).text().trim() || null;
      } else {
        // Fallback: use heuristics
        dueCell = textCells.find((t) =>
          /(\d{1,2}\/\d{1,2}|\d{1,2}\s+\w+|\d{1,2}-\d{1,2})/i.test(t),
        ) || null;
      }

      // Check for hurdle indicators
      // Look in text cells for "hurdle" or "a hurdle"
      let isHurdle = textCells.some((t) => 
        /hurdle|a hurdle/i.test(t)
      );
      
      // Also check for visual indicators (icons, images) that might indicate hurdles
      // Some course profiles use icons or images to mark hurdles
      if (!isHurdle) {
        const rowHTML = $(row).html() || "";
        // Look for common patterns: warning icons, hurdle-related alt text, etc.
        if (/hurdle|warning|alert/i.test(rowHTML)) {
          // Check if there are images/icons with hurdle-related alt text or titles
          $(row).find("img, svg, [class*='icon'], [class*='warning']").each((_, el) => {
            const alt = $(el).attr("alt") || $(el).attr("title") || "";
            const className = $(el).attr("class") || "";
            if (/hurdle/i.test(alt) || /hurdle/i.test(className)) {
              isHurdle = true;
              console.log("[Scraper] Found hurdle indicator via icon/image");
              return false;
            }
            return undefined;
          });
        }
      }
      
      // Try to extract hurdle threshold percentage
      // Look for patterns like "Pass threshold is 80%", "threshold: 65%", "80% threshold"
      let hurdleThreshold: number | null = null;
      if (isHurdle) {
        for (const cell of textCells) {
          // Pattern: "Pass threshold is 80%" or "threshold: 80%" or "80% threshold"
          const thresholdMatch = cell.match(/(?:pass\s+)?threshold(?:\s+is)?(?:\s*:)?\s*(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*(?:pass\s+)?threshold/i);
          if (thresholdMatch) {
            const percent = parseFloat(thresholdMatch[1] || thresholdMatch[2]);
            if (!Number.isNaN(percent) && percent >= 0 && percent <= 100) {
              hurdleThreshold = percent;
              console.log("[Scraper] Found hurdle threshold:", hurdleThreshold, "%");
              break;
            }
          }
          // Also check for standalone percentages near "hurdle" text
          const percentMatch = cell.match(/(\d+(?:\.\d+)?)\s*%/);
          if (percentMatch && /hurdle|threshold/i.test(cell)) {
            const percent = parseFloat(percentMatch[1]);
            if (!Number.isNaN(percent) && percent >= 0 && percent <= 100) {
              hurdleThreshold = percent;
              console.log("[Scraper] Found hurdle threshold (near hurdle text):", hurdleThreshold, "%");
              break;
            }
          }
        }
      }

      if (!name || (typeof weight === "number" && weight === 0)) {
        console.log("[Scraper] Skipping row - missing name or weight:", { name, weight });
        return;
      }

      console.log("[Scraper] Parsed item:", { name, weight, dueDate: dueCell, isHurdle, hurdleThreshold });
      items.push({
        name,
        weight,
        dueDate: dueCell ?? null,
        isHurdle: isHurdle || undefined,
        hurdleThreshold: hurdleThreshold ?? undefined,
        hurdleRequirements: null, // Will be populated below
      });
    });

  console.log("[Scraper] Parsed", items.length, "assessment items");
  
  // Extract assessment-specific hurdle requirements from assessment detail sections
  // Assessment details are typically in sections with IDs like #assessment-detail-0, #assessment-detail-1, etc.
  console.log("[Scraper] Looking for assessment-specific hurdle requirements...");
  
  items.forEach((item, index) => {
    // Try to find the assessment detail section by ID (assessment-detail-{index})
    const detailId = `assessment-detail-${index}`;
    const elementWithId = $assessment(`#${detailId}, [id="${detailId}"]`).first();
    
    // Find the h3 heading for this assessment detail section
    let h3Heading: CheerioAny | null = null;
    
    if (elementWithId.length > 0) {
      console.log(`[Scraper] Found element with ID #${detailId} for item ${index}: "${item.name}"`);
      
      // If it's an anchor, find the h3 that follows it
      if (elementWithId.is("a")) {
        const nextH3 = elementWithId.nextAll("h3").first();
        if (nextH3.length > 0) {
          h3Heading = nextH3;
          console.log(`[Scraper] Found h3 after anchor: "${h3Heading.text().trim()}"`);
        }
      } else if (elementWithId.is("h3")) {
        h3Heading = elementWithId;
        console.log(`[Scraper] Element with ID is h3: "${h3Heading.text().trim()}"`);
      }
    }
    
    // Fallback: try to match by assessment name
    if (!h3Heading || h3Heading.length === 0) {
      console.log(`[Scraper] Trying to find h3 by name match for item ${index}: "${item.name}"`);
      const normalizedItemName = item.name.toLowerCase().replace(/\s+/g, " ");
      const itemNameWords = normalizedItemName.split(/\s+/).filter(w => w.length > 2);
      
      $assessment("h3").each((_, el) => {
        const headingText = $assessment(el).text().toLowerCase().trim();
        const matches = itemNameWords.filter(word => headingText.includes(word));
        if (matches.length >= 2) {
          h3Heading = $assessment(el);
          console.log(`[Scraper] Found h3 by name match: "${headingText}"`);
          return false;
        }
        return undefined;
      });
    }
    
    // Now search for "Hurdle requirements" h4 after this h3
    if (h3Heading && h3Heading.length > 0) {
      console.log(`[Scraper] Searching for hurdle requirements after h3: "${h3Heading.text().trim()}"`);
      
      let hurdleHeading: CheerioAny | null = null;
      
      h3Heading.nextAll().each((_, el) => {
        const tagName = (el as Element).tagName?.toLowerCase();
        const id = $assessment(el).attr("id") || "";
        
        // Stop if we hit another assessment detail section
        if (id.startsWith("assessment-detail-") && id !== detailId) {
          return false;
        }
        
        // Stop if we hit another h3 (next assessment)
        if (tagName === "h3") {
          return false;
        }
        
        // Check for "Hurdle requirements" h4
        if (tagName === "h4") {
          const text = $assessment(el).text().toLowerCase().trim();
          if (text.includes("hurdle requirements") || text === "hurdle requirements") {
            hurdleHeading = $assessment(el);
            console.log(`[Scraper] Found "Hurdle requirements" h4 for item ${index}`);
            return false;
          }
        }
        
        return undefined;
      });
      
      // Extract text after the hurdle heading (ref so TS accepts use after .each assignment)
      const hurdleRef = hurdleHeading as CheerioAny | null;
      if (hurdleRef && hurdleRef.length > 0) {
        // Find the next h4 heading to know where to stop
        let nextH4: CheerioAny | null = null;
        hurdleRef.nextAll("h4").each((_, el) => {
          nextH4 = $assessment(el);
          return false; // Stop at first h4
        });
        const nextH4Ref = nextH4 as CheerioAny | null;

        // Collect text from elements between the hurdle h4 and the next h4
        const hurdleTextParts: string[] = [];

        if (nextH4Ref && nextH4Ref.length > 0) {
          // We have a next h4, so collect text only between these two headings
          hurdleRef.nextAll().each((_, contentEl) => {
            // Stop when we reach the next h4
            if ($assessment(contentEl).is(nextH4Ref)) {
              return false;
            }
            
            const contentTag = (contentEl as Element).tagName?.toLowerCase();
            // Skip headings
            if (contentTag === "h2" || contentTag === "h3" || contentTag === "h4" || contentTag === "h5") {
              return undefined;
            }
            
            const text = $assessment(contentEl).text().trim();
            if (text && text.length > 0) {
              hurdleTextParts.push(text);
            }
            
            return undefined;
          });
        } else {
          // No next h4 found, collect until next h3 or end
          hurdleRef.nextAll().each((_, contentEl) => {
            const contentTag = (contentEl as Element).tagName?.toLowerCase();
            
            // Stop at any heading
            if (contentTag === "h2" || contentTag === "h3" || contentTag === "h4" || contentTag === "h5") {
              return false;
            }
            
            const text = $assessment(contentEl).text().trim();
            if (text && text.length > 0) {
              hurdleTextParts.push(text);
            }
            
            return undefined;
          });
        }
        
        // If we still don't have text, try getting it from the parent (text node case)
        if (hurdleTextParts.length === 0) {
          // Get the HTML content between the h4 and next h4 to extract text nodes
          const parent = hurdleRef.parent();
          const parentHTML = parent.html() || "";
          const headingHTML = hurdleRef.html() || "";
          
          if (parentHTML.includes(headingHTML)) {
            const headingIndex = parentHTML.indexOf(headingHTML);
            if (headingIndex >= 0) {
              let afterHTML = parentHTML.substring(headingIndex + headingHTML.length);
              
              // Find where the next h4 starts
              const nextH4Match = afterHTML.match(/<h4[^>]*>/i);
              if (nextH4Match) {
                afterHTML = afterHTML.substring(0, nextH4Match.index || afterHTML.length);
              }
              
              // Extract text from HTML (remove tags)
              const tempDiv = cheerio.load(afterHTML);
              const text = tempDiv("body").text().trim();
              if (text.length > 0) {
                hurdleTextParts.push(text);
              }
            }
          }
        }
        
        if (hurdleTextParts.length > 0) {
          let hurdleText = hurdleTextParts.join(" ").trim().replace(/\s+/g, " ");
          
          // Clean up: remove any text that looks like it's from the next section
          const stopPhrases = [
            "Submission guidelines",
            "Deferral or extension", 
            "Late submission",
            "Task description",
            "Learning outcomes",
            "Exam details"
          ];
          
          for (const phrase of stopPhrases) {
            const index = hurdleText.indexOf(phrase);
            if (index > 0) {
              hurdleText = hurdleText.substring(0, index).trim();
              break;
            }
          }
          
          if (hurdleText.length > 1000) {
            hurdleText = hurdleText.substring(0, 1000) + "...";
          }
          
          item.hurdleRequirements = hurdleText;
          console.log(`[Scraper] ✓ Extracted hurdle requirements for item ${index} (${item.name}):`, hurdleText.substring(0, 150));
        } else {
          console.log(`[Scraper] ✗ Found hurdle heading but no text extracted for item ${index}`);
        }
      } else {
        console.log(`[Scraper] ✗ No "Hurdle requirements" h4 found for item ${index}`);
      }
    } else {
      console.log(`[Scraper] ✗ Could not find h3 heading for item ${index}: "${item.name}"`);
    }
  });
  if (!items.length) {
    console.error("[Scraper] ERROR: No items parsed from table");
    console.error("[Scraper] Table HTML sample:", tableToUse.html()?.substring(0, 1000));
    throw new Error("Assessment table found but no rows could be parsed.");
  }

  // Solution 2: Extract hurdle information from "Additional course grading information" section
  // Focus specifically on sections that mention thresholds, pass/fail conditions, or grade caps
  // EXCLUDE: submission guidelines, deferral/extension info, late submission penalties
  let hurdleInformation: string | null = null;
  console.log("[Scraper] Looking for actual hurdle requirements section...");
  
  // Look for headings that specifically mention hurdle requirements
  const hurdleHeadings = [
    "hurdle requirements",
    "hurdle requirement",
  ];
  
  // Keywords that indicate actual hurdle content (not submission info)
  const hurdleKeywords = [
    /pass\s+threshold/i,
    /threshold\s+is/i,
    /maximum\s+grade/i,
    /grade\s+cap/i,
    /competency\s+test/i,
    /section\s+[ab]\s+of/i,
    /section\s+[ab]\s+of\s+the/i,
    /at\s+least\s+\d+\s*%\s+of\s+the\s+available/i,
    /if\s+(?:you|student|they)\s+(?:do\s+not|fail|don't)\s+.*then\s+the\s+maximum/i,
    /must\s+be\s+satisfied/i,
    /hurdle\s+requirement/i,
  ];
  
  // Keywords that indicate submission/admin info (should be excluded)
  const exclusionKeywords = [
    /submission\s+guidelines/i,
    /deferral/i,
    /extension/i,
    /late\s+submission/i,
    /penalty/i,
    /gradescope/i,
    /blackboard/i,
    /submitted\s+online/i,
    /assignment\s+sheet/i,
    /announcements/i,
    /auto\s+marked/i,
    /marked\s+assessment/i,
    /released\s+within/i,
    /associate\s+dean/i,
  ];
  
  $assessment("h1, h2, h3, h4, h5").each((_, el) => {
    const headingText = $assessment(el).text().toLowerCase().trim();
    
    // Only look for explicit "Hurdle Requirements" headings
    const isHurdleHeading = hurdleHeadings.some(h => headingText.includes(h));
    
    if (isHurdleHeading) {
      console.log("[Scraper] Found 'Hurdle Requirements' heading:", $assessment(el).text().trim());
      
      // Get the content following this heading
      const sectionContent: string[] = [];
      let foundHurdleContent = false;
      
      $assessment(el).nextAll().each((_, nextEl) => {
        const tagName = (nextEl as Element).tagName?.toLowerCase();
        // Stop at next major heading (h1, h2, h3) or next section
        if (tagName === "h1" || tagName === "h2" || tagName === "h3") {
          return false;
        }
        
        const text = $assessment(nextEl).text().trim();
        if (text && text.length > 10) { // Ignore very short text
          const lowerText = text.toLowerCase();
          
          // Check if this contains exclusion keywords (submission info, etc.)
          const hasExclusion = exclusionKeywords.some(pattern => pattern.test(lowerText));
          if (hasExclusion) {
            console.log("[Scraper] Skipping excluded content:", text.substring(0, 100));
            return undefined; // Skip this content
          }
          
          // Check if this contains actual hurdle keywords
          const hasHurdleKeywords = hurdleKeywords.some(pattern => pattern.test(lowerText));
          
          // Also check for patterns like "X% of the available marks" or "Pass both X AND Y"
          const hasHurdlePattern = 
            /\d+\s*%\s*(?:of\s+the\s+available|pass|threshold|required)/i.test(lowerText) ||
            /pass\s+both/i.test(lowerText) ||
            /(?:and|or)\s+section/i.test(lowerText);
          
          if (hasHurdleKeywords || hasHurdlePattern) {
            sectionContent.push(text);
            foundHurdleContent = true;
            console.log("[Scraper] Included hurdle content:", text.substring(0, 150));
          }
        }
        return undefined;
      });
      
      if (foundHurdleContent && sectionContent.length > 0) {
        hurdleInformation = sectionContent.join("\n\n").substring(0, 2000); // Limit to 2000 chars
        console.log("[Scraper] Extracted hurdle information (first 500 chars):", hurdleInformation.substring(0, 500));
        return false; // Stop after first match
      } else {
        console.log("[Scraper] 'Hurdle Requirements' heading found but no valid hurdle content extracted");
      }
    }
    return undefined;
  });

  const result = {
    courseCode: courseCode.toUpperCase(),
    title,
    items,
    semester,
    courseProfileUrl: courseProfileLink || null,
    hurdleInformation: hurdleInformation || null,
  };
  console.log("[Scraper] Successfully completed! Returning", result.items.length, "items");
  console.log("[Scraper] Course profile URL:", result.courseProfileUrl);
  console.log("[Scraper] Hurdle information found:", !!result.hurdleInformation);
  return result;
}


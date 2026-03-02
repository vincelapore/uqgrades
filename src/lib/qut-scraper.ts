import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import type { SemesterSelection, SemesterType, DeliveryMode } from "./semester";

type CheerioElement = cheerio.Cheerio<Element>;

export type AssessmentItem = {
    name: string;
    weight: number | "pass/fail";
    dueDate?: string | null;
    isHurdle?: boolean;
    hurdleThreshold?: number | null;
    hurdleRequirements?: string | null;
};

export type CourseAssessment = {
    courseCode: string;
    title?: string | null;
    items: AssessmentItem[];
    semester?: SemesterSelection;
    courseProfileUrl?: string | null;
    hurdleInformation?: string | null;
};

export type QUTDeliveryModeOption = {
    delivery: DeliveryMode;
    location?: string;
    courseProfileUrl: string;
};

const QUT_UNIT_URL = "https://qutvirtual4.qut.edu.au/web/qut/unit";

function semesterToQUTCode(semester: SemesterType): string {
    switch (semester) {
        case "Semester 1":
            return "SEM-1";
        case "Semester 2":
            return "SEM-2";
        case "Summer":
            return "SUM";
        default:
            return "SEM-1";
    }
}

const DEFAULT_HEADERS = {
    "User-Agent":
        "Mozilla/5.0 (compatible; grademate-bot/1.0; +https://grademate.com)",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
};

const SCRAPER_API_BASE = "https://api.scraperapi.com";

async function fetchQUTHtml(url: string): Promise<string> {
    const apiKey = process.env.SCRAPER_API_KEY;

    const targetUrl = apiKey
        ? `${SCRAPER_API_BASE}?api_key=${apiKey}&url=${encodeURIComponent(url)}`
        : url;

    const res = await fetch(targetUrl, {
        headers: apiKey ? undefined : DEFAULT_HEADERS
    });

    if (!res.ok) {
        if (res.status === 429 || res.status === 403) {
            throw new Error(
                "Unfortunately GradeMate has reached its limit. Please try again tomorrow."
            );
        }
        throw new Error(`Failed to fetch ${url} (${res.status})`);
    }

    return res.text();
}

export async function fetchQUTCourseAssessment(
    unitCode: string,
    semester?: SemesterSelection
): Promise<CourseAssessment> {
    console.log(
        "[QUT Scraper] Starting fetchQUTCourseAssessment for:",
        unitCode
    );
    console.log("[QUT Scraper] Semester:", semester);

    if (!semester) {
        throw new Error(
            "Semester, year, and delivery mode are required for QUT units."
        );
    }

    const studyPeriodCode = semesterToQUTCode(semester.semester);
    const url = `${QUT_UNIT_URL}?unitCode=${encodeURIComponent(unitCode.toUpperCase())}&year=${semester.year}&studyPeriodCode=${studyPeriodCode}`;

    console.log("[QUT Scraper] Target URL:", url);

    const html = await fetchQUTHtml(url);
    const $ = cheerio.load(html);

    console.log("[QUT Scraper] HTML length:", html.length, "characters");

    // Check if the unit was found
    const errorMessage = $(".alert-danger, .error-message").text().trim();
    if (
        errorMessage.toLowerCase().includes("not found") ||
        errorMessage.toLowerCase().includes("no unit")
    ) {
        throw new Error(
            `Unit ${unitCode} not found for ${semester.semester} ${semester.year}.`
        );
    }

    // Extract title from page
    let title: string | null = null;

    // Look for the unit title in common locations
    const h1Text = $("h1").first().text().trim();
    if (h1Text && h1Text.length > 0) {
        title = h1Text;
        console.log("[QUT Scraper] Found title from h1:", title);
    }

    // Fallback: page title
    if (!title) {
        const pageTitle = $("title").text().trim();
        if (pageTitle) {
            title = pageTitle.split("|")[0].trim();
            console.log("[QUT Scraper] Found title from page title:", title);
        }
    }

    // Final fallback: just use unit code
    if (!title) {
        title = unitCode.toUpperCase();
    }

    // Parse assessment items
    const items: AssessmentItem[] = [];

    // QUT unit outlines have assessment tasks in h4 elements with id="assessment-task-..."
    // followed by description and div elements containing Weight, Due date, etc.
    // Example structure:
    // <h4 id="assessment-task-2025-sem-1-gp-internal-1">Assessment: Problem Solving Task</h4>
    // <p>Description...</p>
    // <div><strong>Weight:</strong> 10</div>
    // <div><strong>Due (indicative):</strong> Week 4</div>

    console.log("[QUT Scraper] Looking for assessment-task h4 elements...");

    const h4Elements = $('h4[id^="assessment-task-"]');
    console.log(
        "[QUT Scraper] Found",
        h4Elements.length,
        "h4 elements with assessment-task id"
    );

    h4Elements.each((_: number, el: Element) => {
        const heading = $(el);
        const elementId = heading.attr("id");
        const headingText = heading.text().trim();

        // Extract assessment name (remove "Assessment: " prefix if present)
        let name = headingText.replace(/^Assessment:\s*/i, "").trim();
        if (!name) return;

        console.log(
            "[QUT Scraper] Found assessment heading:",
            name,
            "| id:",
            elementId
        );

        // Look for Weight and Due date in following siblings
        let weight: number | "pass/fail" = 0;
        let dueDate: string | null = null;
        let isHurdle = false;

        // Collect all HTML content until next h4/h3/h2 to search for weight/due/hurdle
        let contentHtml = "";
        let sibling = heading.next();
        while (sibling.length > 0) {
            const tagName = sibling.prop("tagName")?.toLowerCase();

            // Stop at next heading
            if (tagName === "h4" || tagName === "h3" || tagName === "h2") {
                break;
            }

            // Get outer HTML of this sibling
            const outerHtml = $.html(sibling);
            contentHtml += outerHtml;

            sibling = sibling.next();
        }

        // Also get any text nodes between heading and first sibling
        // by looking at parent's HTML
        const parentHtml = heading.parent().html() || "";
        const headingOuterHtml = $.html(heading);
        const headingIdx = parentHtml.indexOf(headingOuterHtml);
        if (headingIdx >= 0) {
            const afterHeading = parentHtml.substring(
                headingIdx + headingOuterHtml.length
            );
            // Find next h4 or h3 or h2
            const nextHeadingMatch = afterHeading.match(/<h[234][^>]*>/i);
            if (nextHeadingMatch && nextHeadingMatch.index !== undefined) {
                contentHtml = afterHeading.substring(0, nextHeadingMatch.index);
            } else {
                contentHtml = afterHeading;
            }
        }

        // Extract weight from content
        const weightMatch =
            contentHtml.match(/<strong>Weight:<\/strong>\s*(\d+(?:\.\d+)?)/i) ||
            contentHtml.match(/Weight:\s*(\d+(?:\.\d+)?)/i);
        if (weightMatch) {
            weight = parseFloat(weightMatch[1]);
            console.log("[QUT Scraper] Found weight:", weight);
        }
        if (/pass\s*\/?\s*fail/i.test(contentHtml)) {
            weight = "pass/fail";
            console.log("[QUT Scraper] Found pass/fail weight");
        }

        // Extract due date from content - look for "Week X" pattern
        // QUT format: <strong>Due (indicative):</strong> Week 4
        const weekMatch = contentHtml.match(/Week\s+(\d+)/i);
        if (weekMatch) {
            dueDate = `Week ${weekMatch[1]}`;
            console.log("[QUT Scraper] Found due date:", dueDate);
        } else {
            // Check for exam period or other due patterns
            const examMatch = contentHtml.match(/examination\s+period/i);
            if (examMatch) {
                dueDate = "Exam Period";
                console.log("[QUT Scraper] Found due date:", dueDate);
            }
        }

        // Check for hurdle
        if (
            contentHtml.toLowerCase().includes("hurdle") ||
            contentHtml.toLowerCase().includes("must pass") ||
            contentHtml.toLowerCase().includes("must achieve")
        ) {
            isHurdle = true;
            console.log("[QUT Scraper] Found hurdle indicator");
        }

        // Add item if we found a valid weight
        if (
            name &&
            (weight === "pass/fail" ||
                (typeof weight === "number" && weight > 0))
        ) {
            // Check for duplicates (QUT pages sometimes have the same assessment listed twice)
            const isDuplicate = items.some(
                (existing) =>
                    existing.name === name && existing.weight === weight
            );
            if (!isDuplicate) {
                console.log("[QUT Scraper] Parsed item:", {
                    name,
                    weight,
                    dueDate,
                    isHurdle
                });
                items.push({
                    name,
                    weight,
                    dueDate,
                    isHurdle: isHurdle || undefined
                });
            } else {
                console.log("[QUT Scraper] Skipping duplicate:", name);
            }
        }
    });

    // Fallback: try to find assessment data in other formats
    if (items.length === 0) {
        console.log(
            "[QUT Scraper] No assessment-task h4 elements found, trying alternative parsing..."
        );

        // Look for assessment section and parse Weight/Due patterns
        const bodyText = $("body").html() || "";

        // Pattern: "Assessment: Name" followed by "Weight: X"
        const assessmentSections = bodyText.split(
            /<h4[^>]*id="assessment-task/i
        );

        assessmentSections.slice(1).forEach((section) => {
            // Extract name from heading
            const nameMatch =
                section.match(/>Assessment:\s*([^<]+)/i) ||
                section.match(/>([^<]+?)<\/h4>/i);
            if (!nameMatch) return;

            const name = nameMatch[1].trim();

            // Extract weight
            const weightMatch =
                section.match(/<strong>Weight:<\/strong>\s*(\d+(?:\.\d+)?)/i) ||
                section.match(/Weight:\s*(\d+(?:\.\d+)?)/i);
            let weight: number | "pass/fail" = 0;
            if (weightMatch) {
                weight = parseFloat(weightMatch[1]);
            }

            // Extract due date
            const dueMatch =
                section.match(/Due\s*\([^)]*\):\s*([^<]+)/i) ||
                section.match(/Due:\s*([^<]+)/i);
            const dueDate = dueMatch ? dueMatch[1].trim() : null;

            if (name && typeof weight === "number" && weight > 0) {
                console.log("[QUT Scraper] Parsed item (fallback):", {
                    name,
                    weight,
                    dueDate
                });
                items.push({ name, weight, dueDate });
            }
        });
    }

    if (items.length === 0) {
        console.error("[QUT Scraper] No assessment items found");
        console.error(
            "[QUT Scraper] Page HTML sample:",
            html.substring(0, 3000)
        );
        throw new Error(
            `Could not find assessment information for ${unitCode}. The unit outline may not be available for ${semester.semester} ${semester.year}.`
        );
    }

    // Validate weights sum to approximately 100
    const totalWeight = items.reduce((sum, item) => {
        if (typeof item.weight === "number") {
            return sum + item.weight;
        }
        return sum;
    }, 0);

    console.log("[QUT Scraper] Total weight:", totalWeight);

    const result: CourseAssessment = {
        courseCode: unitCode.toUpperCase(),
        title,
        items,
        semester,
        courseProfileUrl: url,
        hurdleInformation: null
    };

    console.log(
        "[QUT Scraper] Successfully parsed",
        items.length,
        "assessment items"
    );
    return result;
}

export async function fetchQUTDeliveryModes(
    unitCode: string,
    year: number,
    semester: SemesterType
): Promise<QUTDeliveryModeOption[]> {
    console.log(
        "[QUT Scraper] Fetching delivery modes for:",
        unitCode,
        year,
        semester
    );

    // QUT doesn't typically have Internal/External split like UQ
    // We'll check if the unit is available for the given semester and return a single "Internal" option
    const studyPeriodCode = semesterToQUTCode(semester);
    const url = `${QUT_UNIT_URL}?unitCode=${encodeURIComponent(unitCode.toUpperCase())}&year=${year}&studyPeriodCode=${studyPeriodCode}`;

    try {
        const html = await fetchQUTHtml(url);
        const $ = cheerio.load(html);

        // Check if unit exists for this semester
        const errorMessage = $(".alert-danger, .error-message, .no-results")
            .text()
            .trim();
        const bodyText = $("body").text().toLowerCase();

        if (
            errorMessage.toLowerCase().includes("not found") ||
            errorMessage.toLowerCase().includes("no unit") ||
            bodyText.includes("unit not available") ||
            bodyText.includes("no offering found")
        ) {
            console.log("[QUT Scraper] Unit not found for this semester");
            return [];
        }

        // Check for unit title or content to verify it's a valid page
        const hasContent =
            $("h1").length > 0 ||
            $('[class*="unit-title"]').length > 0 ||
            bodyText.includes(unitCode.toLowerCase());

        if (hasContent) {
            console.log(
                "[QUT Scraper] Found unit, returning default Internal mode"
            );
            return [
                {
                    delivery: "Internal",
                    location: "Brisbane",
                    courseProfileUrl: url
                }
            ];
        }

        return [];
    } catch (err) {
        console.error("[QUT Scraper] Error checking delivery modes:", err);
        throw err;
    }
}

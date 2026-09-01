import { NextResponse } from "next/server";
import { autocomplete } from "@/lib/search";
import { log } from "@/lib/log";

/**
 * GET /api/suggest?q=...
 *
 * A thin same-origin proxy so the type-ahead component can call commerce without the
 * browser learning the backend URL or carrying an API key. It returns display data only.
 *
 * A failure here returns an empty list rather than an error: type-ahead is a convenience,
 * and a search box that reports an error while someone is mid-word is worse than one that
 * simply offers no suggestions (REL-001).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  if (query.trim().length < 2) return NextResponse.json({ suggestions: [] });

  try {
    const suggestions = await autocomplete(query);
    return NextResponse.json({ suggestions });
  } catch (error) {
    log.warn("Autocomplete failed", { operation: "search.autocomplete" }, error);
    return NextResponse.json({ suggestions: [] });
  }
}

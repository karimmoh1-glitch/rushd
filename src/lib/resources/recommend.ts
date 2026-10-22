import "server-only";
import * as z from "zod";

// Learning resources for a concept. Two kinds, always labeled differently:
//  - "video": a specific YouTube video that the YouTube Data API returned
//    for the concept, from an allow-listed educational channel, and that a
//    second API call confirmed exists. Only with YOUTUBE_API_KEY set.
//  - "search": a link to a search on a reputable site for the concept. It is
//    not a claim that any particular result is good.
// Nothing here is model-generated: no titles, ids, or URLs come from an LLM.

export interface Resource {
  kind: "video" | "search";
  verified: boolean;
  title: string;
  source: string;
  url: string;
  concept: string;
  durationLabel?: string;
}

// Matched against the channel title the API returns (exact, case-insensitive).
const TRUSTED_CHANNELS = new Set(
  [
    "Khan Academy",
    "CrashCourse",
    "3Blue1Brown",
    "The Organic Chemistry Tutor",
    "MIT OpenCourseWare",
    "Professor Dave Explains",
    "Bozeman Science",
    "Tyler DeWitt",
    "Professor Leonard",
    "Amoeba Sisters",
    "Heimler's History",
    "Math Antics",
    "patrickJMT",
    "Eddie Woo",
    "Physics with Professor Matt Anderson",
    "Numberphile",
  ].map((c) => c.toLowerCase()),
);

const SearchResponse = z.object({
  items: z
    .array(z.object({ id: z.object({ videoId: z.string().optional() }), snippet: z.object({ channelTitle: z.string() }) }))
    .default([]),
});
const VideosResponse = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        snippet: z.object({ title: z.string(), channelTitle: z.string() }),
        contentDetails: z.object({ duration: z.string() }),
        status: z.object({ privacyStatus: z.string(), embeddable: z.boolean().optional() }),
      }),
    )
    .default([]),
});

/** "PT12M3S" -> "12 min". */
export function durationLabel(iso: string): string | undefined {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return undefined;
  const minutes = Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + (Number(m[3] ?? 0) >= 30 ? 1 : 0);
  return minutes >= 1 ? `${minutes} min` : "<1 min";
}

export function searchLinks(concept: string): Resource[] {
  const q = encodeURIComponent(concept);
  return [
    { kind: "search", verified: false, title: `Search Khan Academy for “${concept}”`, source: "Khan Academy", url: `https://www.khanacademy.org/search?page_search_query=${q}`, concept },
    { kind: "search", verified: false, title: `Search YouTube for “${concept}”`, source: "YouTube", url: `https://www.youtube.com/results?search_query=${q}`, concept },
  ];
}

async function verifiedVideos(concept: string, key: string, fetchImpl: typeof fetch): Promise<Resource[]> {
  const search = new URL("https://www.googleapis.com/youtube/v3/search");
  search.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    q: `${concept} explained`,
    maxResults: "15",
    safeSearch: "strict",
    relevanceLanguage: "en",
    videoEmbeddable: "true",
    key,
  }).toString();
  const sRes = await fetchImpl(search, { signal: AbortSignal.timeout(6000) });
  if (!sRes.ok) return [];
  const found = SearchResponse.parse(await sRes.json());
  const ids = found.items
    .filter((i) => i.id.videoId && TRUSTED_CHANNELS.has(i.snippet.channelTitle.toLowerCase()))
    .map((i) => i.id.videoId!)
    .slice(0, 3);
  if (ids.length === 0) return [];

  const videos = new URL("https://www.googleapis.com/youtube/v3/videos");
  videos.search = new URLSearchParams({ part: "snippet,contentDetails,status", id: ids.join(","), key }).toString();
  const vRes = await fetchImpl(videos, { signal: AbortSignal.timeout(6000) });
  if (!vRes.ok) return [];
  const confirmed = VideosResponse.parse(await vRes.json());
  return confirmed.items
    .filter((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id) && v.status.privacyStatus === "public" && TRUSTED_CHANNELS.has(v.snippet.channelTitle.toLowerCase()))
    .slice(0, 2)
    .map((v) => ({
      kind: "video" as const,
      verified: true,
      title: v.snippet.title.slice(0, 200),
      source: v.snippet.channelTitle.slice(0, 80),
      url: `https://www.youtube.com/watch?v=${v.id}`,
      concept,
      durationLabel: durationLabel(v.contentDetails.duration),
    }));
}

/** Resources for up to two concepts. Never throws: any provider failure
 * just means fewer verified videos. */
export async function recommendResources(concepts: string[], fetchImpl: typeof fetch = fetch): Promise<Resource[]> {
  const unique = [...new Set(concepts.map((c) => c.trim()).filter(Boolean))].slice(0, 2);
  const key = process.env.YOUTUBE_API_KEY;
  const out: Resource[] = [];
  for (const concept of unique) {
    if (key) {
      try {
        out.push(...(await verifiedVideos(concept, key, fetchImpl)));
      } catch (error) {
        console.error("[resources] youtube lookup failed", (error as Error)?.name ?? typeof error);
      }
    }
    out.push(...searchLinks(concept));
  }
  return out;
}

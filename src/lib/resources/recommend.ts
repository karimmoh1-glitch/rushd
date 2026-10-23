import "server-only";
import * as z from "zod";
import { log } from "@/lib/log";

// Learning resources for a concept, in two clearly labeled kinds:
//  - "video": a YouTube video from an allow-listed channel, confirmed to exist
//    by a second API call (only when YOUTUBE_API_KEY is set).
//  - "search": a search link on a reputable site, not a claim about any result.
// Nothing here comes from an LLM: no titles, ids or URLs.

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
  const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return undefined;
  const hours = Number(match[1] ?? 0);
  const minutesPart = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);

  let minutes = hours * 60 + minutesPart;
  if (seconds >= 30) minutes += 1;
  if (minutes < 1) return "<1 min";
  return `${minutes} min`;
}

function isTrustedChannel(channelTitle: string): boolean {
  return TRUSTED_CHANNELS.has(channelTitle.toLowerCase());
}

function searchLinks(concept: string): Resource[] {
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
  const searchResponse = await fetchImpl(search, { signal: AbortSignal.timeout(6000) });
  if (!searchResponse.ok) return [];
  const found = SearchResponse.parse(await searchResponse.json());

  const ids: string[] = [];
  for (const item of found.items) {
    if (item.id.videoId && isTrustedChannel(item.snippet.channelTitle)) ids.push(item.id.videoId);
  }
  const firstIds = ids.slice(0, 3);
  if (firstIds.length === 0) return [];

  // Second call: confirm each video exists, is public, and is still on a trusted channel.
  const videos = new URL("https://www.googleapis.com/youtube/v3/videos");
  videos.search = new URLSearchParams({ part: "snippet,contentDetails,status", id: firstIds.join(","), key }).toString();
  const videosResponse = await fetchImpl(videos, { signal: AbortSignal.timeout(6000) });
  if (!videosResponse.ok) return [];
  const confirmed = VideosResponse.parse(await videosResponse.json());

  const resources: Resource[] = [];
  for (const video of confirmed.items) {
    const validId = /^[A-Za-z0-9_-]{11}$/.test(video.id);
    const isPublic = video.status.privacyStatus === "public";
    if (!validId || !isPublic || !isTrustedChannel(video.snippet.channelTitle)) continue;
    resources.push({
      kind: "video",
      verified: true,
      title: video.snippet.title.slice(0, 200),
      source: video.snippet.channelTitle.slice(0, 80),
      url: `https://www.youtube.com/watch?v=${video.id}`,
      concept,
      durationLabel: durationLabel(video.contentDetails.duration),
    });
  }
  return resources.slice(0, 2);
}

/** Resources for up to two concepts. Never throws: any provider failure
 * just means fewer verified videos. */
export async function recommendResources(concepts: string[], fetchImpl: typeof fetch = fetch): Promise<Resource[]> {
  const unique: string[] = [];
  for (const concept of concepts) {
    const trimmed = concept.trim();
    if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
  }

  const key = process.env.YOUTUBE_API_KEY;
  const out: Resource[] = [];
  for (const concept of unique.slice(0, 2)) {
    if (key) {
      try {
        out.push(...(await verifiedVideos(concept, key, fetchImpl)));
      } catch (error) {
        log.error("resources.youtube_lookup_failed", { err: error });
      }
    }
    out.push(...searchLinks(concept));
  }
  return out;
}

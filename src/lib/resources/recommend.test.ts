import { describe, it, expect, afterEach } from "vitest";
import { durationLabel, recommendResources } from "./recommend";

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;

describe("recommendResources", () => {
  afterEach(() => {
    delete process.env.YOUTUBE_API_KEY;
  });

  it("without a YouTube key, offers only labeled search links", async () => {
    const r = await recommendResources(["Chain rule"], (() => {
      throw new Error("should not fetch");
    }) as unknown as typeof fetch);
    expect(r.every((x) => x.kind === "search" && !x.verified)).toBe(true);
    expect(r[0].url).toBe("https://www.khanacademy.org/search?page_search_query=Chain%20rule");
  });

  it("keeps only API-confirmed public videos from trusted channels", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    const calls: string[] = [];
    const fake = (async (url: URL) => {
      calls.push(url.pathname);
      if (url.pathname.endsWith("/search")) {
        return json({
          items: [
            { id: { videoId: "AAAAAAAAAAA" }, snippet: { channelTitle: "Khan Academy" } },
            { id: { videoId: "BBBBBBBBBBB" }, snippet: { channelTitle: "Random Clickbait" } },
            { id: { videoId: "CCCCCCCCCCC" }, snippet: { channelTitle: "3Blue1Brown" } },
          ],
        });
      }
      return json({
        items: [
          { id: "AAAAAAAAAAA", snippet: { title: "Chain rule", channelTitle: "Khan Academy" }, contentDetails: { duration: "PT9M40S" }, status: { privacyStatus: "public" } },
          // Gone private between search and confirmation: dropped.
          { id: "CCCCCCCCCCC", snippet: { title: "Chain rule intuition", channelTitle: "3Blue1Brown" }, contentDetails: { duration: "PT16M" }, status: { privacyStatus: "private" } },
        ],
      });
    }) as unknown as typeof fetch;
    const r = await recommendResources(["Chain rule"], fake);
    const videos = r.filter((x) => x.kind === "video");
    expect(videos).toEqual([
      expect.objectContaining({ verified: true, url: "https://www.youtube.com/watch?v=AAAAAAAAAAA", source: "Khan Academy", durationLabel: "10 min" }),
    ]);
    expect(calls).toEqual(["/youtube/v3/search", "/youtube/v3/videos"]);
  });

  it("degrades to search links when the API fails", async () => {
    process.env.YOUTUBE_API_KEY = "test-key";
    const r = await recommendResources(["Limits"], (async () => json({}, false)) as unknown as typeof fetch);
    expect(r.every((x) => x.kind === "search")).toBe(true);
  });

  it("formats durations", () => {
    expect(durationLabel("PT1H2M")).toBe("62 min");
    expect(durationLabel("PT20S")).toBe("<1 min");
    expect(durationLabel("bogus")).toBeUndefined();
  });
});

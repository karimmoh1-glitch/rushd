import "server-only";
import { db } from "@/lib/db";
import { ACCOUNT_FIELDS, USER_DATA, readSource, type UserDataSource } from "./user-data";

// "Download my data": a JSON document with every row the student owns,
// streamed section by section so a long history doesn't sit in memory.
// Secrets (password hash, session version, encrypted tokens, reset-token
// hashes) are never included; see user-data.ts.

export const EXPORT_FORMAT = "rushd-export/1";

function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, inner) => (typeof inner === "bigint" ? inner.toString() : inner));
}

/** Yields the export document in pieces; joined, they are one JSON object. */
export async function* exportChunks(
  userId: string,
  { now = new Date(), sources = USER_DATA }: { now?: Date; sources?: UserDataSource[] } = {},
): AsyncGenerator<string> {
  const account = await db.user.findUnique({ where: { id: userId }, select: ACCOUNT_FIELDS });
  yield `{"format":${toJson(EXPORT_FORMAT)},"exportedAt":${toJson(now.toISOString())},"account":${toJson(account)}`;
  for (const source of sources) {
    yield `,${toJson(source.key)}:[`;
    let first = true;
    for await (const row of readSource(source, userId)) {
      yield (first ? "" : ",") + toJson(row);
      first = false;
    }
    yield "]";
  }
  yield "}\n";
}

/** The whole export as a byte stream (for a route handler response). */
export function exportStream(userId: string, options?: { now?: Date }): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks = exportChunks(userId, options);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await chunks.next();
        if (next.done) controller.close();
        else controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

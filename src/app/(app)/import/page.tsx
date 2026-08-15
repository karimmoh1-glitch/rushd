import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/dal";
import { ImportFlow } from "./import-flow";

export const metadata: Metadata = {
  title: "Import assignments",
};

export default async function ImportPage() {
  const user = await requireUser();

  const classes = await db.class.findMany({
    where: { userId: user.id, archived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-2xl">
      <ImportFlow classes={classes} />
    </div>
  );
}

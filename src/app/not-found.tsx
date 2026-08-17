import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent">
        <Compass className="h-6 w-6 text-primary" aria-hidden="true" />
      </div>
      <h1 className="mt-4 font-heading text-2xl font-semibold">Page not found.</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        Whatever you were looking for isn&apos;t here — it may have moved, or the link was wrong.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go to Rushd
      </Link>
    </div>
  );
}

import Link from "next/link";
import { BrokenPath } from "@/components/brand/path-empty";

export default function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <BrokenPath />
      <h1 className="mt-6 text-[1.75rem] font-medium leading-tight tracking-tight">Page not found.</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        This page isn&apos;t here. It may have moved, or the link was wrong.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go to Rushd
      </Link>
    </div>
  );
}

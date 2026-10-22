import Link from "next/link";
import { RushdWordmark } from "@/components/brand/rushd-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-10" aria-label="Rushd home">
        <RushdWordmark className="scale-110" />
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

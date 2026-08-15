import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link
        href="/"
        className="mb-8 font-heading text-xl font-semibold tracking-tight text-foreground"
      >
        Rushd
      </Link>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

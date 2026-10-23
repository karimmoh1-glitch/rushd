/** A titled card on the Today page. */
export function Panel({
  id,
  title,
  aside,
  children,
}: {
  id: string;
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="rounded-xl bg-card px-4 py-3.5 shadow-(--shadow-card) ring-1 ring-foreground/[0.07] sm:px-5 sm:py-4">
      <div className="flex min-h-7 items-center justify-between gap-3 pb-1.5">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

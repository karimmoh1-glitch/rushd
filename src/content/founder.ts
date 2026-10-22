// Founder page content. Fields set to null are NOT rendered. Fill them in with
// real, verified facts only (see docs/FOUNDER_PAGE.md); never add anything
// that isn't true or that you wouldn't want public.

export const founder = {
  name: "Karim Mohamed",
  role: "Founder of Rushd",
  /** Path under /public to a real photo of Karim, e.g. "/founder.jpg". */
  photo: null as string | null,
  /** One or two first-person paragraphs: why Karim started Rushd, in his words. */
  story: null as string[] | null,
  /** Public professional profiles Karim chooses to share, e.g. LinkedIn. */
  links: [] as { label: string; href: string }[],
};

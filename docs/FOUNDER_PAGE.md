# Founder page (/founder)

The page only states verifiable facts: Karim Mohamed founded Rushd, what Rushd
is building, and the product's principles (which the code actually enforces).
Nothing biographical was invented.

## Placeholders to fill in (src/content/founder.ts)

Each is `null`/empty and is **not rendered** until set:

- `photo`: a real photo of Karim, placed in `public/` (e.g. `public/founder.jpg`,
  square, at least 400×400). Don't use a generated likeness.
- `story`: one or two first-person paragraphs on why Karim started Rushd.
- `links`: public professional profiles Karim wants associated with his name
  (e.g. LinkedIn). They're marked `rel="me"`, which helps search engines tie the
  profiles to this page.

Keep private details off this page: no home address, phone number, school name
or year, or age.

## Search visibility checklist

Done in code: unique title ("Karim Mohamed, Founder of Rushd"), description,
canonical URL, Open Graph profile metadata, server-rendered content, JSON-LD
`ProfilePage`/`Person` linked to the `Organization` on the homepage, sitemap
entry, homepage and footer links.

Still needed (requires the owner's accounts):

1. Google Search Console: add the `therushd.com` domain property, verify it with
   the DNS TXT record Google provides (add it at the domain registrar), then
   submit `https://therushd.com/sitemap.xml`.
2. Use URL Inspection on `https://therushd.com/founder` and request indexing.
3. Bing Webmaster Tools: import the property from Search Console.
4. Link to `https://therushd.com/founder` from profiles Karim controls (e.g.
   LinkedIn, GitHub) so search engines can connect the name to the page.

Indexing usually takes days to weeks; rankings for a name depend on links and
time, and can't be guaranteed.

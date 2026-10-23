// Structured data and shared identity for public pages. Every field here is
// a plain fact about the product or its founder; nothing is a rating, review,
// or claim that hasn't been verified.

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://therushd.com";
const FOUNDER_NAME = "Karim Mohamed";

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: "Rushd",
        url: SITE_URL,
        founder: { "@id": `${SITE_URL}/founder#person` },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: "Rushd",
        url: SITE_URL,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        name: "Rushd",
        applicationCategory: "EducationalApplication",
        operatingSystem: "Web, macOS, Windows",
        url: SITE_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free plan" },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

export function founderJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url: `${SITE_URL}/founder`,
    mainEntity: {
      "@type": "Person",
      "@id": `${SITE_URL}/founder#person`,
      name: FOUNDER_NAME,
      jobTitle: "Founder",
      worksFor: { "@type": "Organization", "@id": `${SITE_URL}/#organization`, name: "Rushd", url: SITE_URL },
      url: `${SITE_URL}/founder`,
    },
  };
}

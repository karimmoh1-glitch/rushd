import type { Metadata } from "next";
import { OnboardingWizard } from "./onboarding-wizard";
import { emailConfigured } from "@/lib/email/send";
import { popularCatalogCourses } from "@/lib/courses/usage";

export const metadata: Metadata = {
  title: "Set up your plan",
};

export default async function OnboardingPage() {
  // Only courses enough real students chose; empty until then.
  const popular = await popularCatalogCourses();
  return <OnboardingWizard email={emailConfigured()} popularIds={popular.map((course) => course.catalogId)} />;
}

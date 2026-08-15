import type { Metadata } from "next";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = {
  title: "Set up your plan",
};

export default function OnboardingPage() {
  return <OnboardingWizard />;
}

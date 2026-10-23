import { BrandLoader } from "@/components/brand/brand-loader";

// Fallback for app pages without their own skeleton. The loader stays
// invisible for the first 350ms, so quick navigations never show it.
export default function AppLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <BrandLoader />
    </div>
  );
}

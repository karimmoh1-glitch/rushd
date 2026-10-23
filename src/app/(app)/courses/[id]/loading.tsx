import { BrandLoader } from "@/components/brand/brand-loader";

/** Course pages read Canvas materials too, so they can take a moment. */
export default function CourseLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <BrandLoader label="Loading course" />
    </div>
  );
}

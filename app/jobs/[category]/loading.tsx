import MobileListLoadingScreen from "@/app/components/loading/MobileListLoadingScreen";

export default function JobsCategoryLoading() {
  return (
    <MobileListLoadingScreen
      eyebrow="Category Matches"
      title="Loading jobs for this category"
      subtitle="Pulling the latest openings before we render the live list."
      sectionCount={1}
      cardsPerSection={4}
    />
  );
}

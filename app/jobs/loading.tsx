import MobileListLoadingScreen from "@/app/components/loading/MobileListLoadingScreen";

export default function JobsLoading() {
  return (
    <MobileListLoadingScreen
      eyebrow="Job Categories"
      title="Loading fresh job sections"
      subtitle="Gathering live openings and category matches for this page."
      sectionCount={2}
      cardsPerSection={3}
    />
  );
}

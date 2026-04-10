import Spinner from "@/app/components/spinner/Spinner";

type MobileListLoadingScreenProps = {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  sectionCount?: number;
  cardsPerSection?: number;
  minHeightClass?: string;
  className?: string;
};

export default function MobileListLoadingScreen({
  minHeightClass = "min-h-screen",
  className = "",
}: MobileListLoadingScreenProps) {
  return (
    <div className={`flex items-center justify-center px-4 py-10 ${minHeightClass} ${className}`}>
      <div className="w-full max-w-6xl">
        <Spinner compact label="Loading jobs..." />
      </div>
    </div>
  );
}

export type BenefitCategory = {
  id: string;
  title: string;
  iconClass: string;
  iconColorClass: string;
  items: string[];
};

export const BENEFIT_CATEGORIES: BenefitCategory[] = [
  {
    id: "environment",
    title: "Work Environment",
    iconClass: "fa-solid fa-laptop-house",
    iconColorClass: "text-blue-500",
    items: [
      "Remote Work",
      "Hybrid Schedule",
      "Flexible Hours",
      "Dog Friendly Office",
      "Casual Dress",
    ],
  },
  {
    id: "health",
    title: "Health & Wellness",
    iconClass: "fa-solid fa-heart-pulse",
    iconColorClass: "text-red-500",
    items: [
      "Health Insurance",
      "Dental Insurance",
      "Vision Insurance",
      "Gym Membership",
      "Mental Health Support",
      "Life Insurance",
    ],
  },
  {
    id: "financial",
    title: "Financial & Retirement",
    iconClass: "fa-solid fa-sack-dollar",
    iconColorClass: "text-green-500",
    items: [
      "401(k)",
      "401(k) Matching",
      "Performance Bonus",
      "Stock Options / Equity",
      "Signing Bonus",
    ],
  },
  {
    id: "timeoff",
    title: "Vacation & Time Off",
    iconClass: "fa-solid fa-umbrella-beach",
    iconColorClass: "text-orange-400",
    items: [
      "Unlimited PTO",
      "Paid Sick Days",
      "Paid Holidays",
      "Parental Leave",
      "Sabbatical",
    ],
  },
  {
    id: "perks",
    title: "Additional Perks",
    iconClass: "fa-solid fa-gift",
    iconColorClass: "text-purple-500",
    items: [
      "Professional Development",
      "Tuition Reimbursement",
      "Free Lunch/Snacks",
      "Company Retreats",
      "Home Office Stipend",
    ],
  },
];

export const ALL_BENEFIT_OPTIONS = Array.from(
  new Set(BENEFIT_CATEGORIES.flatMap((category) => category.items))
);

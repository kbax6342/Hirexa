"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button, type ButtonProps } from "@/app/components/ui/button";
import { hasActivePlan } from "@/app/lib/billing/hasActivePlan";

type PlanStatusProfile = {
  trialPlanStatus?: string | null;
  monthlyPlanStatus?: string | null;
  yearlyPlanStatus?: string | null;
} | null;

type PremiumCareerCoachButtonProps = {
  children: ReactNode;
  activeHref: string;
  className?: string;
  planStatus: PlanStatusProfile;
  variant?: ButtonProps["variant"];
};

export default function PremiumCareerCoachButton({
  children,
  activeHref,
  className,
  planStatus,
  variant,
}: PremiumCareerCoachButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!hasActivePlan(planStatus)) {
      router.push("/checkout");
      return;
    }

    router.push(activeHref);
  };

  return (
    <Button type="button" variant={variant} className={className} onClick={handleClick}>
      {children}
    </Button>
  );
}

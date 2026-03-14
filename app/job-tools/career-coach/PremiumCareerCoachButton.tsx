"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Button, type ButtonProps } from "@/app/components/ui/button";

type PremiumCareerCoachButtonProps = {
  children: ReactNode;
  activeHref: string;
  className?: string;
  hasPaidAccess: boolean;
  variant?: ButtonProps["variant"];
};

export default function PremiumCareerCoachButton({
  children,
  activeHref,
  className,
  hasPaidAccess,
  variant,
}: PremiumCareerCoachButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!hasPaidAccess) {
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

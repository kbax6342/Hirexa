import * as React from "react";

import { cn } from "@/app/lib/utils";

const RecruiterCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("rounded-lg border bg-white text-slate-900 shadow-sm", className)}
    {...props}
  />
));

RecruiterCard.displayName = "RecruiterCard";

export default RecruiterCard;

import * as React from "react";
import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("min-h-0 overflow-auto", className)}>{children}</div>;
}

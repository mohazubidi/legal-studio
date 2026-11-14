"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        dir="rtl"
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 w-80 rounded-md border border-border bg-surface p-4 text-sm shadow-md", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

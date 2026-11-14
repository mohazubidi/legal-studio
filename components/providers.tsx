"use client";

import type { ReactNode } from "react";
import { DirectionProvider } from "@radix-ui/react-direction";

/** Tells Radix primitives (menus, popovers, dialogs) that the app is right-to-left. */
export function Providers({ children }: { children: ReactNode }) {
  return <DirectionProvider dir="rtl">{children}</DirectionProvider>;
}

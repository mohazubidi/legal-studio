"use client";

import Link from "next/link";
import { LogOut, Palette } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { WorkspaceProfile } from "@/lib/supabase/server";

function initials(profile: WorkspaceProfile): string {
  const source = profile.fullName ?? profile.email ?? "?";
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function UserMenu({ profile }: { profile: WorkspaceProfile }) {
  const displayName = profile.fullName ?? profile.email ?? "المستخدم";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 rounded-md p-1 hover:bg-surface-muted"
        aria-label={`قائمة الحساب: ${displayName}`}
      >
        <span className="flex size-8 items-center justify-center rounded-full border border-border bg-surface-muted text-xs font-semibold text-primary">
          {initials(profile)}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium lg:inline">{displayName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <p className="truncate text-sm font-semibold">{displayName}</p>
          {profile.organization ? <p className="truncate text-xs text-muted-foreground">{profile.organization}</p> : null}
          {profile.email && profile.fullName ? (
            <p dir="ltr" className="truncate text-end text-xs text-muted-foreground">
              {profile.email}
            </p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/design-system">
            <Palette aria-hidden />
            نظام التصميم
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOut}>
          {/* Keep the menu open on select: closing it unmounts this form before the submit happens. */}
          <DropdownMenuItem asChild onSelect={(event) => event.preventDefault()}>
            <button type="submit" className="w-full">
              <LogOut aria-hidden />
              تسجيل الخروج
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

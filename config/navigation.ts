import { Briefcase, FileStack, FolderOutput, LayoutDashboard, Wrench, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  labelAr: string;
  labelEn: string;
  icon: LucideIcon;
}

export const MAIN_NAV: readonly NavItem[] = [
  { href: "/", labelAr: "لوحة التحكم", labelEn: "Dashboard", icon: LayoutDashboard },
  { href: "/matters", labelAr: "القضايا والملفات", labelEn: "Matters", icon: Briefcase },
  { href: "/documents", labelAr: "المستندات", labelEn: "Documents", icon: FileStack },
  { href: "/tools", labelAr: "الأدوات", labelEn: "Tools", icon: Wrench },
  { href: "/outputs", labelAr: "المخرجات", labelEn: "Outputs", icon: FolderOutput },
];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="فتح القائمة">
          <Menu aria-hidden />
        </Button>
      </DialogTrigger>
      <SheetContent side="start" aria-describedby={undefined}>
        <DialogTitle className="sr-only">القائمة الرئيسية</DialogTitle>
        <div className="border-b border-border px-5 py-4">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavLinks onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Dialog>
  );
}

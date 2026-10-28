"use client";

import { useRef, useState, type ReactNode } from "react";
import { Network, type LucideIcon } from "lucide-react";
import { messages, type Locale } from "@peek/core/i18n";
import { Button } from "../ui/button";
import { DropdownMenuItem } from "../ui/dropdown-menu";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "../ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type RelatedItemsVariant = "button" | "menu" | "counts";
export type RelatedItemsCount = { label: string; hint: string; value: ReactNode; Icon?: LucideIcon };

export function RelatedItems({ locale, description, variant = "button", counts = [], children }: {
  locale: Locale;
  description: string;
  variant?: RelatedItemsVariant;
  counts?: RelatedItemsCount[];
  children: ReactNode | ((open: boolean) => ReactNode);
}) {
  const t = messages(locale);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  return <Sheet open={open} onOpenChange={setOpen}>
    {variant === "counts" ? <div className="relative z-10 mt-auto flex justify-center gap-4 text-sm tabular-nums text-muted-foreground">
      {counts.map(({ label, hint, value, Icon }) => <Tooltip key={hint}>
        <TooltipTrigger asChild><SheetTrigger asChild>
          <Button type="button" variant="ghost" size="content" onClick={(event) => { opener.current = event.currentTarget; }} aria-label={label}>
            {Icon ? <Icon aria-hidden="true" /> : null}{value}
          </Button>
        </SheetTrigger></TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>)}
    </div> : variant === "menu" ? <SheetTrigger asChild>
      <DropdownMenuItem onSelect={(event) => event.preventDefault()}><Network aria-hidden="true" />{t.profileRelatedItems}</DropdownMenuItem>
    </SheetTrigger> : <SheetTrigger asChild>
      <Button type="button" variant="outline" size="sm"><Network aria-hidden="true" />{t.profileRelatedItems}</Button>
    </SheetTrigger>}
    <SheetContent locale={locale} variant="editor" onOpenAutoFocus={(event) => {
      event.preventDefault();
      title.current?.focus();
    }} onCloseAutoFocus={(event) => {
      if (opener.current) { event.preventDefault(); opener.current.focus(); }
    }}>
      <SheetHeader>
        <SheetTitle ref={title} tabIndex={-1} className="outline-none">{t.profileRelatedItems}</SheetTitle>
        <SheetDescription>{description}</SheetDescription>
      </SheetHeader>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto p-4 pt-0">
        {typeof children === "function" ? children(open) : children}
      </div>
    </SheetContent>
  </Sheet>;
}

export function RelatedItemsSection({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  return <section aria-label={label} className="flex min-w-0 flex-col gap-2">
    <h2 className="text-sm font-medium">{label} · {count}</h2>
    {children}
  </section>;
}

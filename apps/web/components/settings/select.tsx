"use client";

import type { ComponentProps } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { cn } from "@/lib/utils";

/** Forward field accessibility attributes to the focusable trigger. */
export function SettingsSelect({
  children,
  id,
  className,
  placeholder,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  ...props
}: ComponentProps<typeof Select> & { placeholder?: string } &
  Pick<
    ComponentProps<typeof SelectTrigger>,
    "id" | "className" | "aria-label" | "aria-describedby" | "aria-invalid"
  >) {
  return (
    <Select {...props}>
      <SelectTrigger
        id={id}
        className={cn("w-full min-w-0", className)}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup>{children}</SelectGroup>
      </SelectContent>
    </Select>
  );
}

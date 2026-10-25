"use client";

import Link from "next/link";
import { Ellipsis, Pencil, Trash2, Pause, Play } from "lucide-react";
import { messages, type Locale } from "@peek/core/i18n";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "../ui/dropdown-menu";
import { ConfirmAction } from "./delete-button";

export function SettingsRowMenu({
  href,
  locale,
  disabled,
  onDelete,
  enabled,
  onToggle,
}: {
  href: string;
  locale: Locale;
  disabled: boolean;
  onDelete: () => Promise<void>;
  enabled: boolean;
  onToggle: () => Promise<void>;
}) {
  const t = messages(locale);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t.actions}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={href}>
              <Pencil aria-hidden="true" />
              {t.edit}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => void onToggle()}
          >
            {enabled ? (
              <Pause aria-hidden="true" />
            ) : (
              <Play aria-hidden="true" />
            )}
            {enabled ? t.disable : t.enable}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            locale={locale}
            disabled={disabled}
            description={t.confirmInstanceDelete}
            onConfirm={onDelete}
            trigger={
              <DropdownMenuItem
                variant="destructive"
                disabled={disabled}
                onSelect={(event) => event.preventDefault()}
              >
                <Trash2 aria-hidden="true" />
                {t.remove}
              </DropdownMenuItem>
            }
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

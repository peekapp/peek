"use client";

import Link from "next/link";
import { Ellipsis, Pencil, Trash2, Pause, Play } from "lucide-react";
import type { Locale } from "@peek/core/i18n";
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
  const remove = locale === "ru" ? "Удалить" : "Delete";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={locale === "ru" ? "Действия" : "Actions"}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={href}>
              <Pencil aria-hidden="true" />
              {locale === "ru" ? "Изменить" : "Edit"}
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
            {enabled
              ? locale === "ru"
                ? "Выключить"
                : "Disable"
              : locale === "ru"
                ? "Включить"
                : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmAction
            locale={locale}
            disabled={disabled}
            description={
              locale === "ru"
                ? "Удалить этот экземпляр и его локальные данные?"
                : "Delete this instance and its local data?"
            }
            onConfirm={onDelete}
            trigger={
              <DropdownMenuItem
                variant="destructive"
                disabled={disabled}
                onSelect={(event) => event.preventDefault()}
              >
                <Trash2 aria-hidden="true" />
                {remove}
              </DropdownMenuItem>
            }
          />
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

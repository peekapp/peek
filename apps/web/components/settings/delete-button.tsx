"use client";

import { useState } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import { Button } from "../ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";

export function ConfirmAction({
  locale,
  label,
  description,
  disabled,
  onConfirm,
}: {
  locale: Locale;
  label?: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const t = messages(locale);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="destructive-ghost"
          className="ml-auto"
          disabled={disabled || pending}
        >
          {label ?? t.remove}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label ?? t.remove}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              try {
                await onConfirm();
                setOpen(false);
              } finally {
                setPending(false);
              }
            }}
          >
            {label ?? t.remove}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export const DeleteButton = ConfirmAction;

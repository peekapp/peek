"use client";

import { useState, type ReactElement } from "react";
import { messages, type Locale } from "@peek/core/i18n";
import { Alert, AlertDescription } from "../ui/alert";
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
  trigger,
}: {
  locale: Locale;
  label?: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
  trigger?: ReactElement;
}) {
  const t = messages(locale);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) { setOpen(next); setError(""); }
      }}
    >
      <AlertDialogTrigger asChild>
        {trigger ?? (
          <Button
            type="button"
            variant="destructive-ghost"
            className="ml-auto"
            disabled={disabled || pending}
          >
            {label ?? t.remove}
          </Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label ?? t.remove}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault();
              setPending(true);
              setError("");
              try {
                await onConfirm();
                setOpen(false);
              } catch (error) {
                setError(error instanceof Error ? error.message : t.actionFailed);
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

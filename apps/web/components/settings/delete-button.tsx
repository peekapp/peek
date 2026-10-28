"use client";

import { useState, type ReactElement, type ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { messages, type Locale } from "@peek/core/i18n";
import { Alert, AlertTitle, AlertDescription } from "../ui/alert";
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
  warning,
  children,
  confirmDisabled,
}: {
  locale: Locale;
  label?: string;
  description: string;
  disabled?: boolean;
  onConfirm: () => Promise<void>;
  trigger?: ReactElement;
  warning?: { title: string; description: string };
  children?: ReactNode;
  confirmDisabled?: boolean;
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
        {warning ? <Alert variant="warning" className="mb-0">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle className="line-clamp-none">{warning.title}</AlertTitle>
          <AlertDescription>{warning.description}</AlertDescription>
        </Alert> : null}
        {children ? <div className="flex max-h-[50dvh] min-h-0 flex-col gap-4 overflow-y-auto">{children}</div> : null}
        {error ? <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t.cancel}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || confirmDisabled}
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

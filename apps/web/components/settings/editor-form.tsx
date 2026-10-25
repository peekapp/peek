"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { Locale } from "@peek/core/i18n";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "../ui/alert-dialog";

const editorFormVariants = cva("min-w-0", {
  variants: { layout: { default: "max-w-2xl", preview: "w-full" } },
  defaultVariants: { layout: "default" },
});

/** A successful submit commits the draft; failed submits keep navigation guarded. */
export function EditorForm({
  className,
  layout,
  draft,
  locale,
  onSubmit,
  children,
  ...props
}: Omit<ComponentProps<"form">, "onSubmit"> & {
  layout?: "default" | "preview";
  draft: unknown;
  locale: Locale;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<boolean>;
}) {
  const router = useRouter();
  const serialized = JSON.stringify(draft);
  const [saved, setSaved] = useState(serialized);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const leaving = useRef(false);
  const [destination, setDestination] = useState<(() => void) | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dirty = serialized !== saved;
  const ru = locale === "ru";

  useEffect(() => {
    if (!dirty && !pending) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const ask = (go: () => void) => {
      previousFocus.current = document.activeElement as HTMLElement | null;
      setDestination(() => go);
    };
    const click = (event: MouseEvent) => {
      if (
        leaving.current ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.download ||
        (link.target && link.target !== "_self")
      )
        return;
      const url = new URL(link.href);
      if (
        url.origin === location.origin &&
        url.pathname === location.pathname &&
        url.search === location.search
      )
        return;
      if (link.hasAttribute("data-discard-changes") && !submitting.current) {
        leaving.current = true;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      ask(() => {
        if (url.origin === location.origin)
          router.push(url.pathname + url.search + url.hash);
        else location.assign(url.href);
      });
    };
    const traverse = (event: NavigateEvent) => {
      if (
        leaving.current ||
        event.navigationType !== "traverse" ||
        !event.cancelable ||
        event.hashChange
      )
        return;
      event.preventDefault();
      const key = event.destination.key;
      ask(() => {
        void window.navigation.traverseTo(key);
      });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", click, true);
    // shortcut: old browsers guard links/reloads only; require Navigation API for Back/Forward guards.
    window.navigation?.addEventListener("navigate", traverse);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", click, true);
      window.navigation?.removeEventListener("navigate", traverse);
    };
  }, [dirty, pending, router]);

  return (
    <>
      <form
        {...props}
        className={cn(editorFormVariants({ layout }), className)}
        aria-busy={pending}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting.current) return;
          submitting.current = true;
          setPending(true);
          try {
            if (await onSubmit(event)) {
              setSaved(serialized);
              setDestination(null);
            }
          } finally {
            submitting.current = false;
            setPending(false);
          }
        }}
      >
        <fieldset className="min-w-0" disabled={pending} inert={pending}>
          {children}
        </fieldset>
      </form>
      <AlertDialog
        open={!!destination}
        onOpenChange={(open) => {
          if (!open) setDestination(null);
        }}
      >
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (!leaving.current) previousFocus.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ru ? "Выйти из редактора?" : "Leave editor?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? ru
                  ? "Дождитесь завершения сохранения."
                  : "Wait for the save to finish."
                : ru
                  ? "Несохранённые изменения будут потеряны."
                  : "Unsaved changes will be lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {ru ? "Остаться" : "Keep editing"}
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                leaving.current = true;
                destination?.();
              }}
            >
              {ru ? "Выйти" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

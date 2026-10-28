"use client";

import {
  useEffect,
  useImperativeHandle,
  type Ref,
  useRef,
  useState,
  type HTMLAttributes,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { messages, type Locale } from "@peek/core/i18n";
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
  variants: { layout: { default: "max-w-2xl", preview: "w-full", settings: "max-w-5xl" } },
  defaultVariants: { layout: "default" },
});

export type EditorGuard = { requestClose: (close: () => void) => void };

/** A successful submit commits the draft; failed submits keep navigation guarded. */
export function EditorForm({
  className,
  guardRef,
  navigationGuard = true,
  navigationDirty = false,
  layout,
  draft,
  savedDraft,
  as: Comp = "form",
  locale,
  onSubmit,
  children,
  ...props
}: Omit<HTMLAttributes<HTMLElement>, "onSubmit"> & {
  guardRef?: Ref<EditorGuard>;
  navigationGuard?: boolean;
  navigationDirty?: boolean;
  layout?: "default" | "preview" | "settings";
  draft: unknown;
  savedDraft?: unknown;
  as?: "form" | "div";
  locale: Locale;
  onSubmit: (event: FormEvent<HTMLElement>) => Promise<boolean>;
}) {
  const t = messages(locale);
  const router = useRouter();
  const serialized = JSON.stringify(draft);
  const [saved, setSaved] = useState(serialized);
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const leaving = useRef(false);
  const [destination, setDestination] = useState<{ run: () => void; navigation: boolean } | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const dirty = serialized !== (savedDraft === undefined ? saved : JSON.stringify(savedDraft));

  useImperativeHandle(guardRef, () => ({
    requestClose(close) {
      if (submitting.current) return;
      if (!dirty) { close(); return; }
      previousFocus.current = document.activeElement as HTMLElement | null;
      setDestination({ run: close, navigation: false });
    },
  }), [dirty]);

  useEffect(() => {
    if (!navigationGuard || (!dirty && !navigationDirty && !pending)) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const ask = (go: () => void) => {
      previousFocus.current = document.activeElement as HTMLElement | null;
      setDestination({ run: go, navigation: true });
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
  }, [dirty, navigationDirty, navigationGuard, pending, router]);

  return (
    <>
      <Comp
        {...props}
        className={cn(editorFormVariants({ layout }), className)}
        aria-busy={pending}
        onSubmit={async (event) => {
          event.preventDefault();
          event.stopPropagation();
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
      </Comp>
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
            <AlertDialogTitle>{t.leaveEditor}</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? t.waitForSave : t.unsavedChangesWarning}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.keepEditing}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                leaving.current = destination?.navigation ?? false;
                const run = destination?.run;
                setDestination(null);
                run?.();
              }}
            >
              {t.leave}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { Toaster as Sonner } from "sonner";
import { messages, type Locale } from "@peek/core/i18n";
import { isLightTheme } from "@peek/core/themes";
import { buttonVariants } from "./button";
import { useAppTheme } from "../theme";

export function Toaster({ initialLocale }: { initialLocale: Locale }) {
  const { theme } = useAppTheme();
  const [locale, setLocale] = useState(initialLocale);
  // Settings updates the document language without remounting the root layout.
  useEffect(() => {
    const update = () => setLocale(document.documentElement.lang === "ru" ? "ru" : "en");
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);
  const t = messages(locale);
  return (
    <Sonner
      theme={isLightTheme(theme) ? "light" : "dark"}
      className="pointer-events-auto"
      position="bottom-right"
      duration={5000}
      closeButton
      containerAriaLabel={t.notifications}
      icons={{
        success: <CircleCheckIcon className="size-4" aria-hidden="true" />,
        info: <InfoIcon className="size-4" aria-hidden="true" />,
        warning: <TriangleAlertIcon className="size-4" aria-hidden="true" />,
        error: <OctagonXIcon className="size-4" aria-hidden="true" />,
        loading: <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        closeButtonAriaLabel: t.dismissNotification,
        classNames: {
          toast: "flex w-full items-center gap-3 rounded-md border border-border bg-popover p-4 pr-10 text-sm text-popover-foreground shadow-lg",
          content: "min-w-0 flex-1 break-words",
          actionButton: buttonVariants({ variant: "secondary", size: "sm" }),
          title: "font-medium",
          description: "text-muted-foreground",
          closeButton: "absolute right-2 top-2 flex size-6 items-center justify-center rounded-sm border-border! bg-popover! text-muted-foreground! hover:bg-accent! hover:text-accent-foreground! focus-visible:outline-2 focus-visible:outline-ring",
        },
      }}
    />
  );
}

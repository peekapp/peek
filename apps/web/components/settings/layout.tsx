import { Skeleton } from "../ui/skeleton";
import { Input } from "../ui/input";
import { SearchIcon } from "lucide-react";
import type { Locale } from "@peek/core/i18n";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import { FieldGroup } from "../ui/field";
import { NavigationMenu, NavigationMenuList } from "../ui/navigation-menu";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  CardAction,
} from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "../ui/empty";

/** Shared page anatomy. Descriptions always belong below the heading. */
export function SettingsHeading({
  title,
  description,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-base font-medium wrap-anywhere">{title}</h2>
        {description ? (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
/** Owns toolbar-to-content spacing for every resource collection. */
export function SettingsCollection({ children }: { children: ReactNode }) {
  return <section className="flex flex-col gap-4">{children}</section>;
}
/** Shared collection controls; search filters the collection in its owner. */
export function SettingsToolbar({
  query,
  onQueryChange,
  placeholder,
  action,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  placeholder: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="pl-9"
        />
      </div>
      {action}
    </div>
  );
}
export function matchesSearch(
  query: string,
  ...values: (string | undefined)[]
) {
  const term = query.trim().toLocaleLowerCase();
  return values.some((value) => value?.toLocaleLowerCase().includes(term));
}
export function SearchEmpty({ locale }: { locale: Locale }) {
  return (
    <div role="status">
      <SettingsEmpty
        title={locale === "ru" ? "Ничего не найдено" : "No results found"}
        description={
          locale === "ru"
            ? "Попробуйте другой запрос."
            : "Try a different search."
        }
      />
    </div>
  );
}
export function SettingsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid items-stretch gap-6 empty:hidden md:grid-cols-2">
      {children}
    </div>
  );
}
export function SettingsCard({
  title,
  description,
  children,
  actions,
  preview,
  status,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  preview?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <Card variant="resource">
      {preview ? <div className="-mt-6">{preview}</div> : null}
      <CardHeader>
        <CardTitle asChild>
          <h3>{title}</h3>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {status ? <CardAction>{status}</CardAction> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {actions ? <CardFooter>{actions}</CardFooter> : null}
    </Card>
  );
}
export function SettingsCardDetails({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <details>
      <summary className="w-fit cursor-pointer rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {label}
      </summary>
      <div className="grid justify-items-start gap-4 pt-4">{children}</div>
    </details>
  );
}
export function SettingsEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {action}
    </Empty>
  );
}
export function EditorHeader({
  title,
  description,
  backHref,
  backLabel,
  action,
}: {
  title: ReactNode;
  description?: ReactNode;
  backHref: string;
  backLabel: string;
  action?: ReactNode;
}) {
  return (
    <>
      <Link
        className="mb-6 inline-block text-xs text-muted-foreground hover:text-foreground"
        href={backHref}
      >
        ← {backLabel}
      </Link>
      <SettingsHeading
        title={title}
        description={description}
        action={action}
      />
    </>
  );
}
export function EditorSection({
  title,
  children,
}: {
  title?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="pb-8 [&+section]:border-t [&+section]:border-border [&+section]:pt-8">
      {title ? <h3 className="mb-6 text-base font-medium">{title}</h3> : null}
      {children}
    </section>
  );
}
export function EditorActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-border pt-6 text-sm md:gap-5">
      {children}
    </div>
  );
}

export function PreferenceRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start justify-between gap-5 border-t border-border py-7 md:flex-row md:items-center md:gap-8">
      <div>
        <h3 className="mb-6 text-base font-medium">{title}</h3>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

export function SettingsPage({
  className,
  ...props
}: React.ComponentProps<"main">) {
  return <main className={cn("w-full p-4 md:p-6", className)} {...props} />;
}
export function SettingsTopbar(props: React.ComponentProps<"header">) {
  return (
    <header
      className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
      {...props}
    />
  );
}
const settingsTitleVariants = cva("", {
  variants: {
    visibility: {
      visible: "truncate text-sm",
      hidden: "sr-only",
    },
  },
  defaultVariants: { visibility: "visible" },
});
export function SettingsTitle({
  children,
  visibility,
}: {
  children: ReactNode;
  visibility?: "visible" | "hidden";
}) {
  return <h1 className={settingsTitleVariants({ visibility })}>{children}</h1>;
}
export function SettingsNavigation({
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenu>) {
  return (
    <NavigationMenu
      {...props}
      viewport={false}
      className="block max-w-none overflow-x-auto border-b border-border"
    >
      <NavigationMenuList className="justify-start gap-6 md:gap-8">
        {children}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
export { EditorForm } from "./editor-form";
export function EditorGrid(props: React.ComponentProps<typeof FieldGroup>) {
  return (
    <FieldGroup className="grid items-start gap-6 sm:grid-cols-2" {...props} />
  );
}
const feedbackVariants = cva(
  "text-sm leading-relaxed wrap-anywhere empty:hidden",
  {
    variants: {
      tone: { default: "text-primary", error: "text-status-error-foreground" },
    },
    defaultVariants: { tone: "default" },
  },
);
export function FormFeedback({
  className,
  tone,
  ...props
}: React.ComponentProps<"p"> & { tone?: "default" | "error" }) {
  return (
    <p
      role="status"
      className={cn(feedbackVariants({ tone }), className)}
      {...props}
    />
  );
}
export function LoadingState({
  children,
  layout = "collection",
}: {
  children: ReactNode;
  layout?: "collection" | "editor" | "fields";
}) {
  const placeholder = (
    <div aria-hidden="true" className="flex flex-col gap-4">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
  return (
    <div role="status">
      <span className="sr-only">{children}</span>
      {layout === "collection" ? (
        <SettingsGrid>
          <Card>
            <CardContent>{placeholder}</CardContent>
          </Card>
          <Card>
            <CardContent>{placeholder}</CardContent>
          </Card>
        </SettingsGrid>
      ) : layout === "fields" ? (
        <div aria-hidden="true" className="grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-full" />
        </div>
      ) : (
        placeholder
      )}
    </div>
  );
}

export function ErrorState({ children }: { children: ReactNode }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

import { Skeleton } from "../ui/skeleton";
import { Input } from "../ui/input";
import { SearchIcon } from "lucide-react";
import { messages, type Locale } from "@peek/core/i18n";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import { FieldGroup } from "../ui/field";
import { NavigationMenu, NavigationMenuList } from "../ui/navigation-menu";
import { Children, Fragment, type ReactNode } from "react";
import {
  Item,
  ItemMedia,
  ItemGroup,
  ItemSeparator,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
} from "../ui/item";
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
  media,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  media?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {media}
        <div className="min-w-0">
          <h2 className="text-base font-medium wrap-anywhere">{title}</h2>
          {description ? (
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
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
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-2">
      {action ? (
        <div className="flex gap-2 md:order-last [&>*]:flex-1 md:[&>*]:flex-none">
          {action}
        </div>
      ) : null}
      <div className="relative w-full min-w-0 md:flex-1">
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
        title={messages(locale).noResultsFound}
        description={messages(locale).tryADifferentSearch}
      />
    </div>
  );
}
/** Shared text-resource lists; screen previews keep their card grid. */
export function SettingsList({ children }: { children: ReactNode }) {
  return (
    <ItemGroup className="overflow-hidden rounded-md border border-border empty:hidden">
      {Children.toArray(children).map((child, index) => (
        <Fragment key={(child as React.ReactElement).key ?? index}>
          {index > 0 ? <ItemSeparator /> : null}
          {child}
        </Fragment>
      ))}
    </ItemGroup>
  );
}
export function SettingsRow({
  title,
  description,
  children,
  actions,
  status,
  media,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  status?: ReactNode;
  media?: ReactNode;
}) {
  return (
    <Item role="listitem" variant="resource" className="flex-col sm:flex-row">
      <div className="flex w-full min-w-0 flex-1 items-start gap-3 sm:w-auto">
        {media ? <ItemMedia>{media}</ItemMedia> : null}
        <ItemContent className="w-full gap-2 sm:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <ItemTitle>
              <h3>{title}</h3>
            </ItemTitle>
            {status}
          </div>
          {description ? (
            <ItemDescription className="line-clamp-none wrap-anywhere">
              {description}
            </ItemDescription>
          ) : null}
          {children ? (
            <div className="flex min-w-0 flex-col items-start gap-2 text-sm text-muted-foreground wrap-anywhere [&>*]:max-w-full">
              {children}
            </div>
          ) : null}
        </ItemContent>
      </div>
      {actions ? (
        <ItemActions className="max-w-full flex-wrap sm:shrink-0">
          {actions}
        </ItemActions>
      ) : null}
    </Item>
  );
}
const gridVariants = cva("grid items-stretch empty:hidden", {
  variants: { variant: { screens: "gap-6 md:grid-cols-2", profiles: "grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5" } },
  defaultVariants: { variant: "screens" },
});
export function SettingsGrid({ children, variant = "screens" }: { children: ReactNode; variant?: "screens" | "profiles" }) {
  return <div className={cn(gridVariants({ variant }))}>{children}</div>;
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
export function SettingsRowDetails({
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
  media,
}: {
  title: ReactNode;
  description?: ReactNode;
  backHref: string;
  backLabel: string;
  action?: ReactNode;
  media?: ReactNode;
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
        media={media}
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
export function EditorPanel({
  title,
  description,
  children,
  hint,
  actions,
  media,
  headerAction,
  sections,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  media?: ReactNode;
  headerAction?: ReactNode;
  sections?: ReactNode;
}) {
  return (
    <Card variant="settings">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
            {media}
            <div className="flex min-w-0 flex-col gap-2">
              <CardTitle asChild><h3>{title}</h3></CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </div>
          </div>
          {headerAction ? <div className="flex min-h-8 shrink-0 items-center">{headerAction}</div> : null}
        </div>
      </CardHeader>
      {sections ?? <EditorPanelSection hint={hint} actions={actions}>{children}</EditorPanelSection>}
    </Card>
  );
}
export function EditorPanelSection({ children, hint, actions }: {
  children?: ReactNode; hint?: ReactNode; actions?: ReactNode;
}) {
  return <>
    {children ? <CardContent><FieldGroup>{children}</FieldGroup></CardContent> : null}
    {hint || actions ? <CardFooter>
      {hint ? <div className="min-w-0 flex-1 basis-48">{hint}</div> : null}
      {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
    </CardFooter> : null}
  </>;
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
  layout?: "collection" | "list" | "editor" | "fields";
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
      {layout === "list" ? (
        <SettingsList>
          {[0, 1, 2].map((key) => (
            <Item
              key={key}
              role="listitem"
              variant="resource"
              aria-hidden="true"
            >
              <ItemContent className="gap-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
              </ItemContent>
              <ItemActions>
                <Skeleton className="h-9 w-16" />
              </ItemActions>
            </Item>
          ))}
        </SettingsList>
      ) : layout === "collection" ? (
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

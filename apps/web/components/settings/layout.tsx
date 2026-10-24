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
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
      <div>
        <h2 className="mb-2 text-2xl font-medium tracking-tight wrap-anywhere">
          {title}
        </h2>
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
export function SettingsGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid items-stretch gap-6 md:grid-cols-2">{children}</div>
  );
}
export function SettingsCard({
  title,
  description,
  children,
  actions,
  preview,
}: {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  preview?: ReactNode;
}) {
  return (
    <Card variant="resource">
      {preview ? <div className="-mt-6">{preview}</div> : null}
      <CardHeader>
        <CardTitle asChild>
          <h3>{title}</h3>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
      {actions ? <CardFooter>{actions}</CardFooter> : null}
    </Card>
  );
}
export function SettingsEmpty({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
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
    <section className="pb-8 [&+section]:border-t [&+section]:border-line [&+section]:pt-8">
      {title ? <h3 className="mb-6 text-base font-medium">{title}</h3> : null}
      {children}
    </section>
  );
}
export function EditorActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-6 text-sm md:gap-5">
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
    <div className="flex flex-col items-start justify-between gap-5 border-t border-line py-7 md:flex-row md:items-center md:gap-8">
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
  return (
    <main
      className={cn(
        "mx-auto max-w-6xl px-4 py-6 md:px-10 md:pt-8 md:pb-18",
        className,
      )}
      {...props}
    />
  );
}
export function SettingsTopbar(props: React.ComponentProps<"header">) {
  return (
    <header
      className="flex items-center justify-between gap-4 text-sm text-muted-foreground"
      {...props}
    />
  );
}
export function SettingsTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="mt-8 mb-8 text-3xl font-medium tracking-tight md:mt-10 md:text-4xl">
      {children}
    </h1>
  );
}
export function SettingsNavigation({
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenu>) {
  return (
    <NavigationMenu
      {...props}
      viewport={false}
      className="block max-w-none overflow-x-auto border-b border-line"
    >
      <NavigationMenuList className="justify-start gap-6 md:gap-8">
        {children}
      </NavigationMenuList>
    </NavigationMenu>
  );
}
const editorFormVariants = cva("min-w-0", {
  variants: { layout: { default: "max-w-2xl", preview: "w-full" } },
  defaultVariants: { layout: "default" },
});
export function EditorForm({
  className,
  layout,
  ...props
}: React.ComponentProps<"form"> & { layout?: "default" | "preview" }) {
  return (
    <form
      className={cn(editorFormVariants({ layout }), className)}
      {...props}
    />
  );
}
export function EditorGrid(props: React.ComponentProps<typeof FieldGroup>) {
  return (
    <FieldGroup className="grid items-start gap-6 sm:grid-cols-2" {...props} />
  );
}
const feedbackVariants = cva(
  "text-sm leading-relaxed wrap-anywhere empty:hidden",
  {
    variants: { tone: { default: "text-primary", error: "text-destructive" } },
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
export function LoadingState({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="py-8 text-sm text-muted-foreground">
      {children}
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

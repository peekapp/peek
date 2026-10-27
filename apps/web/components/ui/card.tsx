import * as React from "react";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

const cardVariants = cva(
  "group/card min-w-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
  {
    variants: {
      variant: {
        default:
          "flex flex-col gap-6 rounded-md border bg-card py-6 text-card-foreground shadow-sm",
        resource:
          "flex flex-col gap-5 overflow-hidden rounded-md border border-border bg-card py-6 text-card-foreground",
        profile: "relative flex min-h-44 flex-col rounded-md border border-border bg-card p-4 text-card-foreground transition-colors hover:bg-row-highlight has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
        preview: "flex flex-col gap-5 rounded-md border border-border p-6",
        choice:
          "relative grid gap-2 rounded-md border border-border p-5 pr-10 text-foreground no-underline hover:bg-accent hover:text-accent-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Card({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card"
      data-variant={variant}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6 group-data-[variant=preview]/card:px-0 group-data-[variant=choice]/card:px-0",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card-title"
      className={cn(
        "leading-none font-semibold wrap-anywhere group-data-[variant=resource]/card:text-lg group-data-[variant=resource]/card:font-medium group-data-[variant=resource]/card:leading-snug group-data-[variant=preview]/card:text-sm group-data-[variant=preview]/card:font-medium group-data-[variant=preview]/card:text-muted-foreground group-data-[variant=choice]/card:text-lg group-data-[variant=choice]/card:leading-normal",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card-description"
      className={cn(
        "text-sm text-muted-foreground group-data-[variant=resource]/card:wrap-anywhere",
        className,
      )}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-6 group-data-[variant=resource]/card:wrap-anywhere group-data-[variant=preview]/card:px-0 group-data-[variant=choice]/card:px-0 group-data-[variant=resource]/card:flex group-data-[variant=resource]/card:flex-col group-data-[variant=resource]/card:gap-3 group-data-[variant=resource]/card:text-sm group-data-[variant=resource]/card:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-6 [.border-t]:pt-6 group-data-[variant=preview]/card:px-0 group-data-[variant=choice]/card:px-0 group-data-[variant=resource]/card:mt-auto group-data-[variant=resource]/card:flex-wrap group-data-[variant=resource]/card:gap-2",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};

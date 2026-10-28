"use client";

import type { Manifest } from "@peekapp/sdk";
import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { PlugIcon, WorkflowIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const iconVariants = cva("inline-flex shrink-0 items-center justify-center", {
  variants: { size: { standard: "size-8", compact: "size-5", header: "size-12" } },
  defaultVariants: { size: "standard" },
});

const artworkVariants = cva("size-full", {
  variants: {
    color: {
      original: "",
      theme:
        "bg-foreground [mask-mode:alpha] [mask-size:contain] [mask-repeat:no-repeat] [mask-position:center] [&>img]:opacity-0",
    },
  },
});

type Props = VariantProps<typeof iconVariants> & {
  kind: "scenario" | "connection";
  src?: string | null;
  color?: Manifest["iconColor"];
};

export function ExtensionIcon(props: Props) {
  // Remount on source changes so a failed image never poisons its replacement.
  return <IconImage key={props.src} {...props} />;
}

function IconImage({ kind, src, size, color = "original" }: Props) {
  const [failed, setFailed] = useState(false);
  const Fallback = kind === "scenario" ? WorkflowIcon : PlugIcon;
  return (
    <span
      data-slot="extension-icon"
      aria-hidden="true"
      className={cn(iconVariants({ size }))}
    >
      {src?.startsWith("data:image/svg+xml;base64,") && !failed ? (
        // The probe image keeps mask load failures on the same fallback path.
        <span
          data-icon-color={color}
          className={cn(artworkVariants({ color }))}
          style={
            color === "theme"
              ? { maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }
              : undefined
          }
        >
          <img
            src={src}
            alt=""
            className="size-full object-contain"
            onError={() => setFailed(true)}
          />
        </span>
      ) : (
        <Fallback className="size-full text-muted-foreground" />
      )}
    </span>
  );
}

export function ExtensionLabel({
  children,
  ...props
}: Props & { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 wrap-anywhere">
      <ExtensionIcon {...props} size="compact" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

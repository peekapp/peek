"use client";

import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ComponentProps, ReactNode } from "react";
import {
  createColumnHelper,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { messages, type Locale } from "@peek/core/i18n";
import type { SettingsRow } from "./layout";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "../ui/table";

type ResourceRow = ComponentProps<typeof SettingsRow> & {
  id: string;
  profile: ReactNode;
  error: ReactNode;
  health: ReactNode;
  cardCount: ReactNode;
};
const columnVariants = cva("px-4", {
  variants: {
    column: {
      name: "col-span-1 min-w-0 py-4 pr-2 lg:py-2 lg:pr-4",
      health: "col-span-2 self-start py-4 pl-2 lg:w-40 lg:py-2 lg:pl-4",
      cardCount: "content-center self-stretch border-t bg-background lg:w-32 lg:border-t-0 lg:bg-transparent",
      profile: "flex h-full items-center border-t bg-background lg:table-cell lg:w-16 lg:border-t-0 lg:bg-transparent lg:px-4",
      actions: "content-center self-stretch border-t bg-background pl-2 lg:w-16 lg:border-t-0 lg:bg-transparent lg:pl-4",
    },
  },
});
const features = tableFeatures({});
const column = createColumnHelper<typeof features, ResourceRow>();

// Stable cell renderers keep open menus mounted during status polling.
const columns = column.columns([
  column.display({
    id: "name",
    cell: ({ row: { original: row } }) => (
      <div className="flex items-start gap-3">
        {row.media}
        <div className="min-w-0 flex-1">
          <div>{row.title}</div>
          {row.error}
        </div>
      </div>
    ),
  }),
  column.display({ id: "health", cell: ({ row }) => row.original.health }),
  column.display({ id: "cardCount", cell: ({ row }) => row.original.cardCount }),
  column.display({
    id: "profile",
    cell: ({ row }) => (
      <div className="flex min-w-0 flex-col items-start gap-2 text-muted-foreground [&>*]:max-w-full">
        {row.original.profile}
      </div>
    ),
  }),
  column.display({
    id: "actions",
    cell: ({ row }) => (
      <div className="relative z-10 flex justify-end">
        {row.original.actions}
      </div>
    ),
  }),
]);
export function SettingsDataTable({
  rows,
  locale,
}: {
  rows: ResourceRow[];
  locale: Locale;
}) {
  const t = messages(locale);
  const table = useTable({
    features,
    data: rows,
    columns,
    getRowId: (row) => row.id,
  });

  if (!rows.length) return null;
  return (
    <div className="lg:overflow-hidden lg:rounded-md lg:border">
      <Table className="block lg:table lg:table-fixed" aria-label={t.scenarios}>
        <colgroup className="hidden lg:table-column-group">
          <col />
          <col className="w-32" />
          <col className="w-32" />
          <col className="w-16" />
          <col className="w-16" />
        </colgroup>
        <TableBody className="grid gap-4 lg:table-row-group [&_tr:last-child]:border lg:[&_tr:last-child]:border-0">
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="relative grid grid-cols-[minmax(0,1fr)_auto_auto] cursor-pointer items-center overflow-hidden rounded-md border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring lg:table-row lg:overflow-visible lg:rounded-none lg:border-x-0 lg:border-t-0"
            >
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    columnVariants({
                      column: cell.column.id as
                        "name" | "health" | "cardCount" | "profile" | "actions",
                    }),
                    "align-middle whitespace-normal wrap-anywhere",
                  )}
                >
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

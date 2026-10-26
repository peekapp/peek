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
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";

type ResourceRow = ComponentProps<typeof SettingsRow> & {
  id: string;
  profile: ReactNode;
  error: ReactNode;
};
const columnVariants = cva("px-4", {
  variants: {
    column: {
      name: "min-w-0 py-4 pr-2 md:py-2 md:pr-4",
      status: "py-4 pl-2 md:w-36 md:py-2 md:pl-4",
      profile: "flex h-full items-center border-t bg-background md:table-cell md:w-24 md:border-t-0 md:bg-transparent",
      actions: "content-center self-stretch border-t bg-background md:w-24 md:border-t-0 md:bg-transparent",
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
  column.display({
    id: "status",
    cell: ({ row }) => (
      <div className="relative z-10 w-fit">{row.original.status}</div>
    ),
  }),
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
    <div className="md:overflow-hidden md:rounded-md md:border">
      <Table className="block md:table md:table-fixed" aria-label={t.scenarios}>
        <colgroup className="hidden md:table-column-group">
          <col />
          <col className="w-36" />
          <col className="w-24" />
          <col className="w-24" />
        </colgroup>
        <TableHeader className="sr-only">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id}>
              {group.headers.map((header) => (
                <TableHead
                  key={header.id}
                  scope="col"
                  className={cn(
                    columnVariants({
                      column: header.column.id as
                        "name" | "status" | "profile" | "actions",
                    }),
                  )}
                >
                  {
                    t[
                    header.column.id as
                    "name" | "status" | "profile" | "actions"
                    ]
                  }
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className="grid gap-4 md:table-row-group [&_tr:last-child]:border md:[&_tr:last-child]:border-0">
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="relative grid grid-cols-[minmax(0,1fr)_auto] cursor-pointer items-center overflow-hidden rounded-md border has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-ring md:table-row md:overflow-visible md:rounded-none md:border-x-0 md:border-t-0"
            >
              {row.getAllCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(
                    columnVariants({
                      column: cell.column.id as
                        "name" | "status" | "profile" | "actions",
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

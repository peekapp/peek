"use client";
import { Alert, AlertDescription } from "../ui/alert";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "../ui/button";
import { useEffect, useRef, useState } from "react";
import type { CalendarConnection } from "@peek/core/calendars";
import { messages, type Locale } from "@peek/core/i18n";
import { mutate, errorText } from "./api";
import { syncError } from "./sync-error";

export function ConnectionCheck({
  connection,
  locale,
  refresh,
  children,
}: {
  connection: CalendarConnection;
  locale: Locale;
  refresh: () => Promise<void>;
  children?: ReactNode;
}) {
  const t = messages(locale);
  const [status, setStatus] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function check() {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setStatus("checking");
    try {
      const started = Date.now();
      const queued = await mutate({
        action: "connection-check",
        id: connection.id,
      });
      while (!request.signal.aborted && Date.now() - started < 35000) {
        await new Promise<void>((resolve) => {
          const done = () => {
            clearTimeout(timer);
            request.signal.removeEventListener("abort", done);
            resolve();
          };
          const timer = setTimeout(done, 1000);
          request.signal.addEventListener("abort", done, { once: true });
        });
        if (request.signal.aborted) return;
        const response = await fetch("/api/settings", {
          cache: "no-store",
          signal: request.signal,
        });
        if (!response.ok) throw new Error("error");
        const data = await response.json();
        const current = (data.connections as CalendarConnection[]).find(
          (c) => c.id === connection.id,
        );
        if (!current || current.version !== connection.version)
          throw new Error("error");
        if (
          current.checkedAt !== null &&
          current.checkedAt > (queued.checkedAt ?? 0)
        ) {
          setStatus(current.error ? `sync:${current.error}` : "success");
          await refresh();
          return;
        }
      }
      if (!request.signal.aborted) setStatus("timeout");
    } catch (error) {
      if (!request.signal.aborted)
        setStatus(error instanceof Error ? error.message : "error");
    } finally {
      controller.current = null;
    }
  }
  const message =
    status === "checking"
      ? ""
      : status === "success"
        ? t.checkSuccess
        : status === "timeout"
          ? t.checkTimeout
          : status.startsWith("sync:")
            ? syncError(status.slice(5), locale)
            : status
              ? errorText(status, locale)
              : connection.error
                ? syncError(connection.error, locale)
                : "";
  const succeeded = status === "success";
  const StatusIcon = succeeded ? CircleCheckIcon : CircleAlertIcon;
  return (
    <div className="connection-check">
      <div className="connection-check-heading">
        {children}
        <Button
          type="button"
          variant="outline"
          disabled={status === "checking"}
          onClick={check}
        >
          {status === "checking" ? t.checkingConnection : t.checkConnection}
        </Button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {message ? (
          <Alert variant={succeeded ? "success" : "error"} role="status">
            <StatusIcon aria-hidden="true" />
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}

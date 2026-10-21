"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";
import { Input } from "../ui/input";
import { SettingsSelect } from "./select";
import { Field, FieldLabel, FieldDescription } from "../ui/field";

/** Shared label, control and hint spacing for the settings editors. */
export function SettingsField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const items = Children.toArray(children);
  const control = items.find(
    (child) =>
      isValidElement(child) &&
      (child.type === Input || child.type === SettingsSelect),
  );
  const hints = items.filter((child) => child !== control);
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {isValidElement(control)
        ? cloneElement(
            control as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": hints.length ? `${id}-hint` : undefined },
          )
        : control}
      {hints.length ? (
        <FieldDescription id={`${id}-hint`}>{hints}</FieldDescription>
      ) : null}
    </Field>
  );
}

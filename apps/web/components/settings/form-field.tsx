"use client";
import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactNode,
  type ReactElement,
} from "react";
import { cva } from "class-variance-authority";
import { Switch } from "../ui/switch";
import { Checkbox } from "../ui/checkbox";
import { Textarea } from "../ui/textarea";
import { Input } from "../ui/input";
import { SettingsSelect } from "./select";
import { Field, FieldLabel, FieldDescription } from "../ui/field";

const labelVariants = cva("", { variants: { hidden: { true: "sr-only", false: "" } } });

/** Shared label, control and hint spacing for the settings editors. */
export function SettingsField({
  label,
  labelHidden = false,
  children,
  className,
}: {
  label: ReactNode;
  labelHidden?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const generatedId = useId();
  const items = Children.toArray(children);
  const control = items.find(
    (child) =>
      isValidElement(child) &&
      (child.type === Input ||
        child.type === Textarea ||
        child.type === Checkbox ||
        child.type === Switch ||
        child.type === SettingsSelect ||
        ["input", "select", "textarea"].includes(child.type as string)),
  );
  const hints = items.filter((child) => child !== control);
  const controlProps = isValidElement(control)
    ? (control.props as { id?: string; "aria-describedby"?: string })
    : undefined;
  const id = controlProps?.id ?? generatedId;
  const describedBy =
    [
      controlProps?.["aria-describedby"],
      hints.length ? `${id}-hint` : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  const hideLabel = labelHidden && !(isValidElement(control) && control.type === Switch);
  const isCheckbox = isValidElement(control) && (control.type === Checkbox || control.type === Switch);
  return (
    <Field
      className={className}
      orientation={isCheckbox ? "horizontal" : "vertical"}
    >
      {!isCheckbox ? <FieldLabel htmlFor={id} className={labelVariants({ hidden: hideLabel })}>{label}</FieldLabel> : null}
      {isValidElement(control)
        ? cloneElement(
            control as ReactElement<{
              id?: string;
              "aria-describedby"?: string;
            }>,
            { id, "aria-describedby": describedBy },
          )
        : control}
      {isCheckbox ? <FieldLabel htmlFor={id} className={labelVariants({ hidden: hideLabel })}>{label}</FieldLabel> : null}
      {hints.length ? (
        <FieldDescription id={`${id}-hint`}>{hints}</FieldDescription>
      ) : null}
    </Field>
  );
}

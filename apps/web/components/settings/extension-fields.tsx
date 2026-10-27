"use client";

import { useId, useState } from "react";
import { cva } from "class-variance-authority";
import { messages, type Locale } from "@peek/core/i18n";
import {
  settingsText,
  settingsPath,
  type SettingsText,
  type SettingsContent,
  type SettingsControl,
  type SettingsBlock,
  type SettingsIssue,
  type Json,
  type Schema,
} from "@peekapp/sdk";
import { cn } from "@/lib/utils";
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend,
} from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupText,
  InputGroupButton,
} from "../ui/input-group";
import { RadioGroup, RadioGroupItem } from "../ui/radio-group";
import { Switch } from "../ui/switch";
import { SelectItem } from "../ui/select";
import { SettingsSelect } from "./select";
import { SettingsField } from "./form-field";
import { numericSetting } from "./numeric-setting";

const labelVariants = cva("", {
  variants: { hidden: { true: "sr-only", false: "" } },
});
const optionVariants = cva(
  "flex w-full cursor-pointer items-center gap-4 rounded-lg border p-4",
  {
    variants: {
      selected: { true: "border-primary bg-accent", false: "border-border" },
      disabled: { true: "cursor-not-allowed opacity-50", false: "" },
    },
  },
);

export function ExtensionContent({
  content,
  locale,
}: {
  content: SettingsContent;
  locale: Locale;
}) {
  const t = messages(locale);
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1">
      {content.text ? (
        <span>{settingsText(content.text, locale, t)}</span>
      ) : null}
      {content.links?.map((link, i) => (
        <a
          key={i}
          className="text-primary underline underline-offset-4"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {settingsText(link.label, locale, t)}
        </a>
      ))}
    </span>
  );
}

function validationMessage(code: string, locale: Locale) {
  const t = messages(locale);
  if (code === "required") return t.settingsRequired;
  if (code === "enum") return t.settingsChoose;
  if (code === "pattern") return t.settingsPattern;
  if (
    ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"].includes(
      code,
    )
  )
    return t.settingsRange;
  if (["minLength", "maxLength"].includes(code)) return t.settingsLength;
  return t.settingsInvalid;
}

function ExtensionField({
  control: c,
  block,
  schema,
  values,
  onChange,
  locale,
  issue,
}: {
  control: Exclude<SettingsControl, { type: "text" }>;
  block: SettingsBlock;
  schema: Schema;
  values: Record<string, Json>;
  onChange: (values: Record<string, Json>) => void;
  locale: Locale;
  issue?: SettingsIssue;
}) {
  const id = useId(),
    t = messages(locale);
  const [copyStatus, setCopyStatus] = useState<"copied" | "failed" | null>(
    null,
  );
  const text = (value: SettingsText) => settingsText(value, locale, t);
  const s = schema.properties![c.field],
    value = values[c.field];
  const required = schema.required?.includes(c.field) ?? false;
  const label = text(c.label ?? block.name);
  const hidden = c.hideLabel ?? !c.label;
  const hint = [
    c.hint && text(c.hint),
    c.disabledReason && text(c.disabledReason),
  ]
    .filter(Boolean)
    .join(" ");
  const describedBy =
    [hint && `${id}-hint`, issue && `${id}-error`].filter(Boolean).join(" ") ||
    undefined;
  const common = {
    id,
    disabled: c.disabled,
    "aria-label": label,
    "aria-describedby": describedBy,
    "aria-invalid": !!issue,
    "aria-required": required,
  };
  const update = (next: Json | undefined) => {
    const updated = { ...values };
    if (next === undefined) delete updated[c.field];
    else updated[c.field] = next;
    onChange(updated);
  };
  const input = {
    ...common,
    value: String(value ?? ""),
    placeholder: c.placeholder ? text(c.placeholder) : undefined,
    type:
      c.type === "secret"
        ? "password"
        : ["number", "integer"].includes(s.type ?? "")
          ? "number"
          : "text",
    autoComplete: c.type === "secret" ? "new-password" : "off",
    step: s.type === "integer" ? 1 : "any",
    min: typeof s.minimum === "number" ? s.minimum : undefined,
    max: typeof s.maximum === "number" ? s.maximum : undefined,
    minLength: typeof s.minLength === "number" ? s.minLength : undefined,
    maxLength: typeof s.maxLength === "number" ? s.maxLength : undefined,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
      setCopyStatus(null);
      if (s.type === "string")
        update(
          event.target.value === "" && !required
            ? undefined
            : event.target.value,
        );
      else onChange(numericSetting(values, c.field, event.target.value));
    },
  };
  let element;
  if (c.type === "switch")
    element = (
      <Switch {...common} checked={value === true} onCheckedChange={update} />
    );
  else if (c.type === "select")
    element = (
      <SettingsSelect
        {...common}
        placeholder={c.placeholder ? text(c.placeholder) : t.settingsChoose}
        value={value === undefined ? "" : JSON.stringify(value)}
        onValueChange={(v) => update(v === "unset" ? undefined : JSON.parse(v))}
      >
        {!required ? (
          <SelectItem value="unset">{t.settingsOptional}</SelectItem>
        ) : null}
        {c.options!.map((option) => (
          <SelectItem
            key={JSON.stringify(option.value)}
            value={JSON.stringify(option.value)}
          >
            {text(option.label)}
          </SelectItem>
        ))}
      </SettingsSelect>
    );
  else if (c.type === "radio")
    element = (
      <RadioGroup
        {...common}
        value={value === undefined ? "" : JSON.stringify(value)}
        onValueChange={(v) => update(JSON.parse(v))}
      >
        {c.options!.map((option, index) => (
          <FieldLabel
            key={JSON.stringify(option.value)}
            htmlFor={`${id}-${index}`}
            className={cn(
              optionVariants({
                selected: value === option.value,
                disabled: c.disabled,
              }),
            )}
          >
            <RadioGroupItem
              id={`${id}-${index}`}
              aria-label={text(option.label)}
              value={JSON.stringify(option.value)}
              disabled={c.disabled}
              aria-describedby={
                option.description ? `${id}-${index}-description` : undefined
              }
            />
            <span className="flex min-w-0 flex-col gap-1">
              <span>{text(option.label)}</span>
              {option.description ? (
                <span
                  id={`${id}-${index}-description`}
                  className="text-sm text-muted-foreground"
                >
                  {text(option.description)}
                </span>
              ) : null}
            </span>
          </FieldLabel>
        ))}
      </RadioGroup>
    );
  else if (c.type === "textarea") element = <Textarea {...input} rows={4} />;
  else if (c.type === "readonly")
    element = (
      <InputGroup>
        <InputGroupInput
          {...common}
          value={
            typeof value === "boolean"
              ? value
                ? t.statusEnabled
                : t.statusDisabled
              : String(value ?? "")
          }
          readOnly
        />
        {c.copy ? (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              type="button"
              aria-label={t.settingsCopy}
              disabled={c.disabled || value === undefined}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(String(value ?? ""));
                  setCopyStatus("copied");
                } catch {
                  setCopyStatus("failed");
                }
              }}
            >
              {t.settingsCopy}
            </InputGroupButton>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    );
  else if (c.prefix || c.suffix)
    element = (
      <InputGroup>
        {c.prefix ? (
          <InputGroupAddon>
            <InputGroupText>{text(c.prefix)}</InputGroupText>
          </InputGroupAddon>
        ) : null}
        <InputGroupInput {...input} />
        {c.suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText>{text(c.suffix)}</InputGroupText>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
    );
  else element = <Input {...input} />;
  return (
    <Field data-invalid={!!issue} data-disabled={!!c.disabled}>
      {c.type === "switch" ? (
        <SettingsField label={label}>{element}</SettingsField>
      ) : c.type === "radio" ? (
        <FieldSet>
          <FieldLegend variant="label" className={labelVariants({ hidden })}>
            {label}
          </FieldLegend>
          {element}
        </FieldSet>
      ) : (
        <>
          <FieldLabel htmlFor={id} className={labelVariants({ hidden })}>
            {label}
          </FieldLabel>
          {element}
        </>
      )}
      {hint ? (
        <FieldDescription id={`${id}-hint`}>{hint}</FieldDescription>
      ) : null}
      {issue ? (
        <FieldError id={`${id}-error`}>
          {validationMessage(issue.code, locale)}
        </FieldError>
      ) : null}
      {copyStatus ? (
        <FieldDescription role="status">
          {copyStatus === "copied" ? t.settingsCopied : t.settingsCopyFailed}
        </FieldDescription>
      ) : null}
    </Field>
  );
}

export function ExtensionFields({
  block,
  schema,
  values,
  onChange,
  locale,
  issues,
}: {
  block: SettingsBlock;
  schema: Schema;
  values: Record<string, Json>;
  onChange: (values: Record<string, Json>) => void;
  locale: Locale;
  issues: SettingsIssue[];
}) {
  return (
    <>
      {block.controls?.map((c, index) =>
        c.type === "text" ? (
          <FieldDescription key={index}>
            <ExtensionContent content={c} locale={locale} />
          </FieldDescription>
        ) : (
          <ExtensionField
            key={c.field}
            control={c}
            block={block}
            schema={schema}
            values={values}
            onChange={onChange}
            locale={locale}
            issue={issues.find(
              (issue) =>
                issue.path ===
                settingsPath(block.source ?? "settings", c.field),
            )}
          />
        ),
      )}
    </>
  );
}

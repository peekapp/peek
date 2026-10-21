"use client";

import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { ColorPair } from "./design-system/color-pair";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldSet,
  FieldLegend,
} from "./ui/field";
import { Checkbox } from "./ui/checkbox";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";
import { Separator } from "./ui/separator";
import { SettingsSelect } from "./settings/select";
import { SelectItem } from "./ui/select";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./ui/card";
import { Alert, AlertDescription } from "./ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "./ui/empty";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuLink,
} from "./ui/navigation-menu";
import { DefinitionPicker } from "./settings/definition-picker";
import { DeleteButton } from "./settings/delete-button";

const variants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;
const states = ["default", "hover", "focus", "disabled"] as const;
const roles = [
  "background",
  "card",
  "popover",
  "primary",
  "secondary",
  "muted",
  "accent",
  "warning",
  "success",
  "status-error",
] as const;

/** A read-only catalogue: example actions never mutate application data. */
export function DesignSystem() {
  return (
    <main className="settings-page design-system" lang="ru">
      <header className="settings-header">
        <Brand />
        <Link href="/settings">← Настройки</Link>
      </header>
      <div className="settings-heading">
        <h1>Дизайн-система Peek</h1>
      </div>
      <p>
        Текущий дизайн «Ночь». Компоненты shadcn, состояния и композиции из
        приложения.
      </p>
      <section aria-labelledby="colors-title">
        <h2 id="colors-title">Цветовые роли</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role) => (
            <ColorPair
              key={role}
              name={role}
              background={`color-${role}`}
              foreground={`color-${role === "background" ? "foreground" : `${role}-foreground`}`}
            />
          ))}
          <ColorPair
            name="Ошибка"
            background="color-background"
            foreground="color-destructive"
          />
          <ColorPair
            name="Опасное действие"
            background="color-destructive"
            foreground="color-white"
          />
        </div>
        <p>
          Контраст измеряется в браузере. Для обычного текста требуется не менее
          4.5:1.
        </p>
      </section>
      <Separator />
      <section aria-labelledby="type-title">
        <h2 id="type-title">Типографика и размеры</h2>
        <div className="editor-title">
          <h1>Основной экран</h1>
        </div>
        <p>
          Системный sans-serif. Крупные лёгкие цифры, спокойный текст и подписи.
        </p>
        <p className="text-muted-foreground">
          Ритм экранов: 8 / 16 / 24 / 32 px. Кнопки и поля: 36 px, радиус 7 px.
          Карточки: 16 px.
        </p>
      </section>
      <Separator />
      <section aria-labelledby="actions-title">
        <h2 id="actions-title">Кнопки</h2>
        <p>
          Один основной призыв в группе. Цвет задаётся вариантом, а не стилем на
          странице.
        </p>
        <div className="overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-5 items-center gap-4">
            <span>Вариант</span>
            {states.map((state) => (
              <span key={state}>{state}</span>
            ))}
            {variants.map((variant) => (
              <div key={variant} className="contents">
                <code>{variant}</code>
                {states.map((state) => (
                  <Button
                    key={state}
                    variant={variant}
                    disabled={state === "disabled"}
                    data-preview={state}
                    type="button"
                  >
                    Сохранить
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Button asChild>
            <Link href="/settings/screens/new">+ Создать экран</Link>
          </Button>
          <Button type="button">
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            Создать экран
          </Button>
          <Button size="icon" type="button" aria-label="Создать экран">
            <PlusIcon aria-hidden="true" />
          </Button>
          <Button disabled>Сохранение…</Button>
          <Button size="sm">Маленькая</Button>
          <Button size="lg">Большая</Button>
        </div>
        <div className="flex flex-wrap gap-4">
          <Badge>Основной</Badge>
          <Badge variant="success">Включён</Badge>
          <Badge variant="inactive">Выключен</Badge>
          <Badge variant="error">Ошибка</Badge>
          <Badge variant="warning">Данные устарели</Badge>
        </div>
      </section>
      <Separator />
      <section aria-labelledby="fields-title">
        <h2 id="fields-title">Поля и выбор</h2>
        <FieldGroup className="form-grid">
          <Field>
            <FieldLabel htmlFor="ds-name">Название экрана</FieldLabel>
            <Input id="ds-name" defaultValue="Основной" autoComplete="off" />
          </Field>
          <Field data-invalid>
            <FieldLabel htmlFor="ds-invalid">Адрес</FieldLabel>
            <Input
              id="ds-invalid"
              defaultValue="Неверный адрес"
              aria-invalid
              aria-describedby="ds-error"
            />
            <FieldError id="ds-error">
              Используйте латинские буквы, цифры и дефисы.
            </FieldError>
          </Field>
          <Field data-disabled>
            <FieldLabel htmlFor="ds-disabled">Недоступное поле</FieldLabel>
            <Input id="ds-disabled" disabled defaultValue="Общее" />
          </Field>
          <Field>
            <FieldLabel htmlFor="ds-select">Язык</FieldLabel>
            <SettingsSelect id="ds-select" defaultValue="ru">
              <SelectItem value="ru">Русский</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SettingsSelect>
            <FieldDescription>Меняет язык интерфейса.</FieldDescription>
          </Field>
          <FieldSet>
            <FieldLegend>Профили</FieldLegend>
            <Field orientation="horizontal">
              <Checkbox id="ds-all" defaultChecked />
              <FieldLabel htmlFor="ds-all">Все профили</FieldLabel>
            </Field>
            <Field orientation="horizontal" data-disabled>
              <Checkbox id="ds-off" disabled />
              <FieldLabel htmlFor="ds-off">Недоступный профиль</FieldLabel>
            </Field>
          </FieldSet>
          <FieldSet>
            <FieldLegend>Тема</FieldLegend>
            <RadioGroup defaultValue="night" aria-label="Тема">
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ds-night" value="night" />
                <Label htmlFor="ds-night">Ночь</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id="ds-day" value="day" />
                <Label htmlFor="ds-day">День</Label>
              </div>
            </RadioGroup>
          </FieldSet>
          <Field>
            <FieldLabel>Масштаб</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              defaultValue="100"
              aria-label="Масштаб"
            >
              {[80, 100, 120, 140].map((scale) => (
                <ToggleGroupItem
                  key={scale}
                  value={String(scale)}
                  aria-label={`${scale}%`}
                >
                  {scale}%
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
        </FieldGroup>
      </section>
      <Separator />
      <section aria-labelledby="compositions-title">
        <h2 id="compositions-title">Навигация и карточки</h2>
        <NavigationMenu
          className="settings-tabs"
          viewport={false}
          aria-label="Примеры разделов"
        >
          <NavigationMenuList>
            {["Экраны", "Сценарии", "Профили"].map((name, i) => (
              <NavigationMenuItem key={name}>
                <NavigationMenuLink variant="tab" active={i === 0} asChild>
                  <a
                    href="#compositions-title"
                    aria-current={i === 0 ? "page" : undefined}
                  >
                    {name}
                  </a>
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
        <div className="settings-card-grid">
          <Card variant="settings">
            <CardHeader>
              <div className="card-top">
                <span className="type-icon" aria-hidden="true">
                  ◷
                </span>
                <Badge variant="success">Включён</Badge>
              </div>
              <CardTitle asChild>
                <h3>Встречи команды</h3>
              </CardTitle>
              <CardDescription asChild>
                <p>Встречи · Общее</p>
              </CardDescription>
            </CardHeader>
            <CardContent className="card-source">Рабочий календарь</CardContent>
            <CardFooter className="card-bottom">
              <span>Следующий запуск: через минуту</span>
              <span aria-hidden="true">›</span>
            </CardFooter>
          </Card>
          <Card variant="settings">
            <CardHeader>
              <CardTitle asChild>
                <h3>
                  Очень длинное название экрана для проверки переноса текста без
                  переполнения
                </h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="card-source">
              Название владельца всегда видно текстом, не только цветом.
            </CardContent>
          </Card>
        </div>
      </section>
      <Separator />
      <section aria-labelledby="feedback-title">
        <h2 id="feedback-title">Состояния и диалоги</h2>
        <Alert variant="warning" role="status">
          <AlertDescription>
            Нет связи с сервером. Показываются последние данные.
          </AlertDescription>
        </Alert>
        <Alert variant="error">
          <AlertDescription>
            Не удалось загрузить данные. Попробуйте ещё раз.
          </AlertDescription>
        </Alert>
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Пока нет экранов</EmptyTitle>
            <EmptyDescription>
              Создайте экран и выберите профили.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <div className="flex flex-wrap gap-4">
          <DefinitionPicker kind="scenario" locale="ru" />
          <DeleteButton
            locale="ru"
            description="Пример подтверждения. Данные приложения не будут удалены."
            onConfirm={async () => {}}
          />
        </div>
      </section>
    </main>
  );
}

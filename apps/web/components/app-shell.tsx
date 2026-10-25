"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  MonitorIcon,
  WorkflowIcon,
  PlugIcon,
  UsersIcon,
  SettingsIcon,
} from "lucide-react";
import { messages, type Locale } from "@peek/core/i18n";
import { SettingsTitle } from "./settings/layout";
import { Brand } from "./brand";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "./ui/sidebar";

const destinations = [
  { key: "screens", href: "/screens", icon: MonitorIcon },
  { key: "scenarios", href: "/scenarios", icon: WorkflowIcon },
  { key: "connections", href: "/connections", icon: PlugIcon },
  { key: "profiles", href: "/profiles", icon: UsersIcon },
  { key: "settings", href: "/settings", icon: SettingsIcon },
] as const;

type Section = (typeof destinations)[number]["key"];

function AppSidebar({ locale, section }: { locale: Locale; section: Section }) {
  const t = messages(locale);
  const { setOpenMobile } = useSidebar();
  function menu(items: readonly (typeof destinations)[number][]) {
    return (
      <SidebarMenu>
        {items.map(({ key, href, icon: Icon }) => (
          <SidebarMenuItem key={key}>
            <SidebarMenuButton asChild isActive={section === key}>
              <Link
                href={href}
                aria-current={section === key ? "page" : undefined}
                onClick={() => setOpenMobile(false)}
              >
                <Icon aria-hidden="true" />
                <span>{t[key]}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    );
  }
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link
          href="/screens"
          aria-label="Peek"
          onClick={() => setOpenMobile(false)}
        >
          <Brand />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav
              aria-label={
                locale === "ru" ? "Основная навигация" : "Main navigation"
              }
            >
              {menu(destinations.slice(0, 4))}
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>{menu(destinations.slice(4))}</SidebarFooter>
    </Sidebar>
  );
}

export function AppShell({
  locale,
  section,
  children,
}: {
  locale: Locale;
  section: Section;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar locale={locale} section={section} />
      <div className="min-w-0 flex-1">
        <header className="grid h-14 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-4 border-b px-4 text-center">
          <SidebarTrigger
            aria-label={locale === "ru" ? "Переключить меню" : "Toggle sidebar"}
          />
          <SettingsTitle>{messages(locale)[section]}</SettingsTitle>
        </header>
        {children}
      </div>
    </SidebarProvider>
  );
}

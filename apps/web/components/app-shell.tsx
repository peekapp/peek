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
import { Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator } from "./ui/breadcrumb";
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
    <Sidebar locale={locale}>
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
            <nav aria-label={messages(locale).mainNavigation}>
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
  detail,
  children,
}: {
  locale: Locale;
  section: Section;
  detail?: { label: string; href: string };
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <AppSidebar locale={locale} section={section} />
      <div className="min-w-0 flex-1">
        <header className="grid h-14 grid-cols-[2rem_minmax(0,1fr)_2rem] items-center gap-4 border-b px-4 text-center">
          <SidebarTrigger
            locale={locale}
            aria-label={messages(locale).toggleSidebar}
          />
          {detail ? (
            <>
              <SettingsTitle visibility="hidden">{detail.label}</SettingsTitle>
              <Breadcrumb className="min-w-0" aria-label={messages(locale).breadcrumbs}>
                <BreadcrumbList className="flex-nowrap justify-center">
                  <BreadcrumbItem className="shrink-0"><BreadcrumbLink asChild><Link href={`/${section}`}>{messages(locale)[section]}</Link></BreadcrumbLink></BreadcrumbItem>
                  <BreadcrumbSeparator>/</BreadcrumbSeparator>
                  <BreadcrumbItem className="min-w-0"><BreadcrumbLink asChild className="truncate"><Link href={detail.href} aria-current="page" title={detail.label}>{detail.label}</Link></BreadcrumbLink></BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </>
          ) : <SettingsTitle>{messages(locale)[section]}</SettingsTitle>}
        </header>
        {children}
      </div>
    </SidebarProvider>
  );
}

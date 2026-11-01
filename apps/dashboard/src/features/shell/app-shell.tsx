"use client";

/**
 * The console shell (design `shell.html`; spec 008 US9-2, US9-5, US9-6): skip link, a
 * sticky sidebar (208 px; 56 px icons-only on tablet, expandable), a top bar with the
 * screen title as the page's only `h1`, the gateway status, the theme toggle and the
 * operator menu. Phone hides the sidebar behind a menu button that opens a Sheet. One
 * native page scrollbar.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ClipboardCheck,
  Coins,
  FileCode,
  FlaskConical,
  LogOut,
  type LucideIcon,
  Menu,
  Moon,
  PanelLeft,
  ScrollText,
  Server,
  Sun,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { GatewayStatus } from "./gateway-status";
import { LogoMark } from "./logo";

interface Screen {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/** The seven console screens, in the design's order. */
export const SCREENS: ReadonlyArray<Screen> = [
  { href: "/live", label: "Live traffic", icon: Activity },
  { href: "/simulator", label: "Simulator", icon: FlaskConical },
  { href: "/audit", label: "Audit log", icon: ScrollText },
  { href: "/cost", label: "Cost", icon: Coins },
  { href: "/providers", label: "Providers", icon: Server },
  { href: "/evals", label: "Evals", icon: ClipboardCheck },
  { href: "/policy", label: "Policy", icon: FileCode },
];

function currentScreen(pathname: string): Screen | undefined {
  return SCREENS.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
}

/** `undefined` until mounted: the theme is only known in the browser (no flash, US9-5). */
function useResolvedTheme(): { readonly dark: boolean | undefined; readonly toggle: () => void } {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme === "dark" : undefined;
  return { dark, toggle: () => setTheme(dark ? "light" : "dark") };
}

function ThemeToggle() {
  const { dark, toggle } = useResolvedTheme();
  const Icon = dark ? Sun : Moon;
  return (
    <Button
      variant="ghost"
      size="icon"
      className="hidden text-muted-foreground md:inline-flex"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}

function OperatorMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { dark, toggle } = useResolvedTheme();
  async function signOut() {
    await api.signOut().catch(() => undefined);
    queryClient.clear();
    router.replace("/sign-in");
  }
  return (
    // Not modal: a modal menu hides the rest of the page from assistive tech while open
    // (axe `aria-hidden-focus`); Escape and outside clicks still close it.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Operator menu"
          className="inline-flex size-11 items-center justify-center rounded-full hover:bg-accent md:size-9"
        >
          <span className="grid size-7 place-items-center rounded-full border bg-muted text-muted-foreground">
            <UserRound aria-hidden="true" className="size-4" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="font-medium">Operator</p>
          <p className="text-xs text-muted-foreground">Signed in with passphrase</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="h-9 md:hidden" onSelect={toggle}>
          {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
          {dark ? "Light theme" : "Dark theme"}
        </DropdownMenuItem>
        <DropdownMenuItem className="h-9" onSelect={() => void signOut()}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NavLink({
  screen,
  current,
  collapsed,
  onNavigate,
  touch = false,
}: {
  readonly screen: Screen;
  readonly current: boolean;
  readonly collapsed: boolean;
  readonly onNavigate?: () => void;
  readonly touch?: boolean;
}) {
  const Icon = screen.icon;
  const link = (
    <Link
      href={screen.href}
      data-slot="sidebar-menu-button"
      {...(current && { "aria-current": "page" as const })}
      {...(onNavigate !== undefined && { onClick: onNavigate })}
      className={cn(
        "flex w-full items-center rounded-md text-sm",
        touch ? "h-11 gap-3 px-3" : "h-9 gap-2.5 px-2.5",
        current
          ? "bg-sidebar-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className={cn("truncate", collapsed && "hidden xl:inline")}>{screen.label}</span>
    </Link>
  );
  if (!collapsed) return <li>{link}</li>;
  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right" className="xl:hidden">
          {screen.label}
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname();
  const screen = currentScreen(pathname);
  const [expanded, setExpanded] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const collapsed = !expanded;

  return (
    <>
      <a
        href="#content"
        className="sr-only rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[90]"
      >
        Skip to content
      </a>
      <div data-slot="sidebar-wrapper" className="flex min-h-svh bg-app text-foreground">
        <aside
          data-slot="sidebar"
          aria-label="Main"
          className={cn(
            "hidden shrink-0 border-r border-sidebar-border bg-sidebar md:block",
            expanded ? "w-52" : "w-14 xl:w-52",
          )}
        >
          <div className="sticky top-0 flex h-svh flex-col">
            <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-4">
              <LogoMark />
              <span
                className={cn(
                  "truncate text-base font-semibold tracking-tight",
                  collapsed && "hidden xl:inline",
                )}
              >
                Tamiz
              </span>
            </div>
            <nav className="flex-1 p-2" aria-label="Screens">
              <ul className="flex flex-col gap-0.5">
                {SCREENS.map((s) => (
                  <NavLink key={s.href} screen={s} current={s === screen} collapsed={collapsed} />
                ))}
              </ul>
            </nav>
            <div className="flex flex-col gap-2 border-t border-sidebar-border p-2 xl:hidden">
              <Button
                variant="ghost"
                size="icon"
                className="self-start"
                aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
                aria-expanded={expanded}
                onClick={() => setExpanded((open) => !open)}
              >
                <PanelLeft aria-hidden="true" />
              </Button>
            </div>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-2 backdrop-blur md:gap-3 md:px-6">
            <Sheet open={navOpen} onOpenChange={setNavOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 md:hidden"
                  aria-label="Open navigation"
                  aria-expanded={navOpen}
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="bg-sidebar md:hidden"
                closeLabel="Close navigation"
                aria-describedby={undefined}
              >
                <div className="flex h-14 items-center border-b border-sidebar-border pr-14 pl-4">
                  <SheetTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
                    <LogoMark />
                    Tamiz
                  </SheetTitle>
                </div>
                <nav className="p-2" aria-label="Screens">
                  <ul className="flex flex-col gap-0.5">
                    {SCREENS.map((s) => (
                      <NavLink
                        key={s.href}
                        screen={s}
                        current={s === screen}
                        collapsed={false}
                        touch
                        onNavigate={() => setNavOpen(false)}
                      />
                    ))}
                  </ul>
                </nav>
              </SheetContent>
            </Sheet>
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight md:text-lg">
              {screen?.label ?? "Tamiz"}
            </h1>
            <GatewayStatus />
            <ThemeToggle />
            <OperatorMenu />
          </header>
          <main id="content" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

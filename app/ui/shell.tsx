"use client";

import { Icon, type IconName } from "./icons";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { DashboardProvider, useDashboard } from "./data";
import { globalSignal } from "./model";
import { Overlay } from "./primitives";

import { MobileBottomNav } from "./mobile/nav";

const navigation: [string, string, IconName][] = [
  ["/", "Overview", "grid"],
  ["/projects", "Projects", "project"],
  ["/infrastructure", "Infrastructure", "project"],
  ["/activity", "Activity", "arrow"],
  ["/incidents", "Incidents", "attention"],
  ["/agents", "Agents", "agents"],
  ["/intelligence", "Intelligence", "intelligence"],
  ["/settings", "Settings", "settings"],
];

function ConsoleShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const sidebar = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menu || desktop) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const items = () => Array.from(sidebar.current?.querySelectorAll<HTMLElement>('a[href], button') || []);
    items()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = items();
      const target = event.shiftKey ? controls.at(-1) : controls[0];
      if ((event.shiftKey && document.activeElement === controls[0]) || (!event.shiftKey && document.activeElement === controls.at(-1))) {
        event.preventDefault(); target?.focus();
      }
    };
    window.addEventListener("keydown", trap);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", trap); menuButton.current?.focus(); };
  }, [menu, desktop]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1001px)");
    const update = () => {
      setDesktop(media.matches);
      setMenu(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const { projects, incidents, health, online, stale, refresh, checkedAt } = useDashboard();
  const signal = globalSignal(
    projects.data?.projects,
    incidents.data?.incidents,
    stale,
    projects.data?.hostSnapshot ? { latestSnapshot: projects.data.hostSnapshot } : null
  );
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((value) => !value);
      }
      if (event.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    setMenu(false);
    setSearch(false);
  }, [pathname]);
  const match = (value: string) =>
    value.toLowerCase().includes(query.toLowerCase());
  return (
    <div className={`console ${menu ? "menu-open" : ""}`}>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside ref={sidebar} className="sidebar" id="navigation" inert={desktop ? menu : !menu} aria-label="Navigation">
        <button className="mobile-nav-close" aria-label="Close navigation" onClick={() => setMenu(false)}><Icon name="close" /></button>
        <Link className="brand" href="/" aria-label="Neo AVO overview">
          <strong>AVO.</strong>
          <span>
            AUTONOMOUS
            <br />
            VIRTUAL OFFICE
          </span>
          <i aria-hidden="true"><Icon name="arrow" /></i>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([href, label, icon]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenu(false)}
              aria-current={
                (href === "/" ? pathname === href : pathname.startsWith(href))
                  ? "page"
                  : undefined
              }
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon name={icon} />
              </span>
              {label}
              <span className="nav-arrow" aria-hidden="true">
                <Icon name="arrow" />
              </span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-pulse">
          <p className="eyebrow">System pulse / Neo AVO</p>
          <strong>
            <i
              className={`pulse-dot ${!stale && health.data?.status === "ok" ? "ok" : ""}`}
            />
            {stale
              ? "STATUS UNAVAILABLE"
              : health.data?.status === "ok"
                ? "WEB / DB AVAILABLE"
                : "CHECKING"}
          </strong>
          <p>
            Observe first.
            <br />
            Independent by design.
          </p>
        </div>
      </aside>
      {menu && (
        <button
          className="nav-scrim"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="console-body" inert={menu && !desktop}>
        <header className="topbar">
          <button
            ref={menuButton}
            className="menu-control"
            aria-label="Toggle navigation"
            aria-expanded={desktop ? !menu : menu}
            aria-controls="navigation"
            onClick={() => setMenu(!menu)}
          >
            <Icon name="menu" />
          </button>
          <button className="search-control" onClick={() => setSearch(true)}>
            <span>SEARCH ANYTHING_</span>
            <kbd><Icon name="agents" /> K</kbd>
          </button>
          <div className={`global-status tone-${signal.tone}`}>
            <span className="eyebrow">Project system status</span>
            <strong>{signal.label}</strong>
          </div>
          <div className="owner-block">
            <span className="owner-avatar">A</span>
            <span>
              <strong>NEO AVO</strong>
              <small>Operations console</small>
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {stale && (
            <div className="freshness-notice" role="status">
              <strong>{online ? "Updates delayed." : "CONNECTION LOST"}</strong>{" "}
              {online
                ? "Last received data may be out of date. System health is not reassessed while disconnected."
                : `Showing last known state from ${checkedAt ? new Date(checkedAt).toLocaleTimeString() : "earlier"}.`}
              {online && <button onClick={refresh}>Retry update</button>}
            </div>
          )}
          {children}
          <footer className="page-footer">
            <span>NEO AVO / AUTONOMOUS VIRTUAL OFFICE</span>
            <span>OBSERVE. INVESTIGATE. UNDERSTAND.</span>
          </footer>
        </main>
      </div>

      <MobileBottomNav onOpenMenu={() => setMenu(true)} />
      {search && (
        <Overlay
          title="Search anything_"
          palette
          onClose={() => setSearch(false)}
        >
          <label className="sr-only" htmlFor="global-search">
            Search navigation, projects and incidents
          </label>
          <input
            id="global-search"
            autoFocus
            placeholder="Project, incident, or page…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <p className="muted">
            Navigation and loaded project / incident records. Search event and
            run IDs in Activity.
          </p>
          <div className="search-results">
            {navigation
              .filter(([, label]) => match(label))
              .map(([href, label]) => (
                <Link onClick={() => setSearch(false)} key={href} href={href}>
                  <span>PAGE</span>
                  {label} <Icon name="arrow" />
                </Link>
              ))}
            {projects.data?.projects
              .filter((p) => match(`${p.name} ${p.slug} ${p.id}`))
              .map((p) => (
                <Link
                  onClick={() => setSearch(false)}
                  key={p.id}
                  href={`/projects/${p.id}`}
                >
                  <span>PROJECT</span>
                  {p.name} <Icon name="arrow" />
                </Link>
              ))}
            {incidents.data?.incidents
              .filter((i) => match(`${i.id} ${i.type} ${i.reason}`))
              .slice(0, 15)
              .map((i) => (
                <Link
                  onClick={() => setSearch(false)}
                  key={i.id}
                  href={`/incidents/${i.id}`}
                >
                  <span>INCIDENT</span>
                  {i.type.replaceAll("_", " ")} <Icon name="arrow" />
                </Link>
              ))}
          </div>
          <Link
            className="button"
            onClick={() => setSearch(false)}
            href={`/activity?q=${encodeURIComponent(query)}`}
          >
            Search recent activity <Icon name="arrow" />
          </Link>
        </Overlay>
      )}
    </div>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </DashboardProvider>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "../icons";
import { useDashboard } from "../data";

export function MobileBottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const { incidents } = useDashboard();

  const activeIncidentsCount = incidents.data?.incidents?.filter(
    (i) => i.state !== "RESOLVED"
  ).length || 0;

  const navItems: Array<{
    href: string;
    label: string;
    icon: IconName;
    badge?: number;
    isMenu?: boolean;
  }> = [
    { href: "/", label: "Overview", icon: "grid" },
    { href: "/projects", label: "Projects", icon: "project" },
    { href: "/incidents", label: "Incidents", icon: "attention", badge: activeIncidentsCount },
    { href: "/infrastructure", label: "Infra", icon: "infrastructure" },
    { href: "#menu", label: "More", icon: "menu", isMenu: true },
  ];

  return (
    <nav className="mobile-bottom-nav mobile-only" aria-label="Mobile Navigation">
      <div className="mobile-bottom-nav-inner">
        {navItems.map((item) => {
          if (item.isMenu) {
            return (
              <button
                key="more"
                type="button"
                className="mobile-nav-item"
                onClick={onOpenMenu}
                aria-label="Open secondary menu"
              >
                <span className="mobile-nav-icon">
                  <Icon name={item.icon} />
                </span>
                <span className="mobile-nav-label">{item.label}</span>
              </button>
            );
          }

          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-nav-item ${isActive ? "active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="mobile-nav-icon">
                <Icon name={item.icon} />
                {!!item.badge && item.badge > 0 && (
                  <span className="mobile-nav-badge">{item.badge}</span>
                )}
              </span>
              <span className="mobile-nav-label">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

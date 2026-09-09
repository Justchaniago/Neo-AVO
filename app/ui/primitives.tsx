"use client";

import { Icon } from "./icons";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { tone, timestamp } from "./model";
import { useDashboard } from "./data";

export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge tone-${tone(value)}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Availability({ value }: { value: string }) {
  return (
    <span className={`availability state-${value.toLowerCase()}`}>
      <i aria-hidden="true" />
      {value}
    </span>
  );
}
export function Panel({
  title,
  label,
  children,
  color = "white",
  className = "",
  action,
}: {
  title?: string;
  label?: string;
  children: ReactNode;
  color?: string;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section className={`panel surface-${color} ${className}`}>
      <div className="panel-heading">
        <div>
          {label && <p className="eyebrow">{label}</p>}
          {title && <h2>{title}</h2>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title}
          <span className="title-period">.</span>
        </h1>
        <p className="lede">{description}</p>
      </div>
      {action}
    </header>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-mark" aria-hidden="true">
        [ — ]
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ErrorState({
  retry,
  children,
}: {
  retry: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="error-state" role="alert">
      <strong>Visibility interrupted.</strong>
      <p>
        {children ||
          "This data source is unavailable. Other systems may still be operating normally."}
      </p>
      <button onClick={retry}>Retry connection <Icon name="arrow" /></button>
    </div>
  );
}
export function Loading() {
  return (
    <div
      className="skeleton"
      role="status"
      aria-label="Loading operational data"
    >
      <span />
      <span />
      <span />
      <span className="sr-only">Loading operational data…</span>
    </div>
  );
}
export function Time({ value }: { value?: string | null }) {
  const { now } = useDashboard();
  const seconds = value && now ? Math.floor((now - Date.parse(value)) / 1000) : -1;
  const relative = seconds >= 0 && seconds < 86400 ? (seconds < 60 ? "Just now" : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)}h ago`) : null;
  return value ? (
    <time dateTime={value} title={timestamp(value)} aria-label={timestamp(value)}>
      {relative || timestamp(value)}
    </time>
  ) : (
    <span>No evidence</span>
  );
}
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {rows.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value ?? "Not available"}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Copy({ value, label }: { value: string; label: string }) {
  const [feedback, setFeedback] = useState("");
  return (
    <div className="copy-field">
      <code>{value}</code>
      <button
        aria-label={`Copy ${label}`}
        className="button-small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setFeedback("Copied");
          } catch {
            setFeedback("Copy unavailable; select text manually");
          }
        }}
      >
        Copy
      </button>
      <span role="status">{feedback}</span>
    </div>
  );
}
/** Native modal supplies focus containment, Escape dismissal and inert background. */
export function Overlay({
  title,
  children,
  onClose,
  palette = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  palette?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => {
    if (closing) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onClose(); return; }
    setClosing(true);
    closeTimer.current = setTimeout(onClose, 160);
  };
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`${palette ? "palette" : "inspector"} ${closing ? "is-closing" : ""}`}
      aria-labelledby={id}
      onCancel={event => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-content">
        <header className="dialog-heading">
          <h2 id={id}>{title}</h2>
          <button onClick={close} aria-label="Close dialog">
            <Icon name="close" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

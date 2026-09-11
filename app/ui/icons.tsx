import type { CSSProperties } from "react";

export type IconName = "arrow" | "grid" | "project" | "infrastructure" | "activity" | "attention" | "agents" | "intelligence" | "settings" | "menu" | "close" | "refresh" | "back" | "state";
const paths: Record<IconName, string> = {
  arrow: "M5 19 19 5M5 5h14v14",
  grid: "M3 3h18v18H3ZM9 3v18M15 3v18M3 9h18M3 15h18",
  project: "M3 6h18v14H3ZM3 6l4-3h6l2 3",
  infrastructure: "M3 4h18v5H3ZM3 10h18v5H3ZM3 16h18v4H3ZM6.5 6.5h.01M6.5 12.5h.01M6.5 18h.01",
  activity: "M3 12h4.5l2.5-6 4 12 3-6H21",
  attention: "M12 3L2 21h20L12 3zM12 9v5M12 17v2",
  agents: "M8 8V5a3 3 0 1 0-3 3h14a3 3 0 1 0-3-3v14a3 3 0 1 0 3-3H5a3 3 0 1 0 3 3V8Z",
  intelligence: "M12 2v20M2 12h20M5 5l14 14M5 19 19 5",
  settings: "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  menu: "M3 5h18M3 12h18M3 19h18",
  close: "m5 5 14 14M5 19 19 5",
  refresh: "M20 9a8 8 0 1 0 0 6M20 3v6h-6",
  back: "M20 12H4m7-7-7 7 7 7",
  state: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};
export function Icon({ name, style }: { name: IconName; style?: CSSProperties }) {
  return <svg className="ui-icon" style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}

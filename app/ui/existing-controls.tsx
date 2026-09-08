"use client";

import { useState } from "react";
import { useDashboard } from "./data";
import type { ProjectDetail } from "./model";
import { Badge, Time } from "./primitives";

// Preserve existing, explicitly scoped controls; authorization remains server-side.
export function AcknowledgeIncident({ id }: { id: string }) {
  const { refresh } = useDashboard();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  async function acknowledge() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/v1/dashboard/incidents/${encodeURIComponent(id)}/ack`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error();
      setMessage("Acknowledgement recorded. Refreshing incident state.");
      refresh();
    } catch {
      setMessage(
        "Acknowledgement could not be confirmed. Refresh the incident before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="existing-control">
      <button disabled={pending || !!message} onClick={acknowledge}>
        {pending ? "Recording…" : "Acknowledge incident"}
      </button>
      <p role="status" className="muted">
        {message ||
          "Records operator awareness. Does not resolve or remediate the incident."}
      </p>
    </div>
  );
}
export function ProjectControls({ detail }: { detail: ProjectDetail }) {
  const { refresh } = useDashboard();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const capabilities = detail.project.capabilities.filter((c) =>
    ["task.retry", "task.cancel"].includes(c),
  );
  async function request(capability: string, taskId: string) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/v1/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: detail.project.id,
          environment: detail.project.environment,
          capability,
          arguments: { taskId },
          validUntil: new Date(Date.now() + 15 * 60_000).toISOString(),
        }),
      });
      if (!response.ok) throw new Error();
      setMessage(
        "Request recorded. The connected project owns execution; inspect command history for its result.",
      );
      refresh();
    } catch {
      setMessage(
        "Request could not be confirmed. Inspect command history before retrying.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <details className="bounded-controls">
      <summary>Existing bounded controls & command history</summary>
      <p className="muted">
        Only declared retry/cancel capabilities are available. A request does
        not confirm execution.
      </p>
      {capabilities.length && detail.tasks.length ? (
        detail.tasks.map((task) => (
          <div className="setting-row" key={task.id}>
            <div>
              <code>{task.externalTaskId}</code>
              <div className="status-pair">
                <Badge value={task.status} />
              </div>
            </div>
            <div className="stack">
              {capabilities.map((capability) => (
                <button
                  key={capability}
                  disabled={pending || !!message}
                  onClick={() => request(capability, task.externalTaskId)}
                >
                  Request {capability === "task.retry" ? "retry" : "cancel"}
                </button>
              ))}
            </div>
          </div>
        ))
      ) : (
        <p>No supported task controls are available for the current records.</p>
      )}
      <p role="status">{message}</p>
      {message && (
        <button
          onClick={() => {
            refresh();
            setMessage("");
          }}
        >
          Refresh command history
        </button>
      )}
      <h3>Recent commands</h3>
      {detail.commands.length ? (
        detail.commands.map((command) => (
          <div className="setting-row" key={command.id}>
            <div>
              <strong>{command.capability}</strong>
              <p>
                <Time value={command.requestedAt} />
              </p>
            </div>
            <Badge value={command.status} />
          </div>
        ))
      ) : (
        <p className="muted">No command requests recorded.</p>
      )}
    </details>
  );
}

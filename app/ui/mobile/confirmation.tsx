"use client";

import { useState } from "react";
import { Icon } from "../icons";
import { Overlay } from "../primitives";

export type BoundedActionParams = {
  actionName: string;
  target: string;
  scope: string;
  date?: string;
  expectedSideEffect: string;
  onConfirm: () => Promise<void> | void;
};

export function CommandConfirmationSheet({
  params,
  onClose,
}: {
  params: BoundedActionParams;
  onClose: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await params.onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Execution failed.");
      setSubmitting(false);
    }
  };

  return (
    <Overlay title="Confirm Action_" onClose={onClose}>
      <div className="confirmation-sheet-content">
        <div className="confirmation-meta">
          <dl className="facts">
            <div>
              <dt>ACTION</dt>
              <dd><strong>{params.actionName}</strong></dd>
            </div>
            <div>
              <dt>TARGET</dt>
              <dd>{params.target}</dd>
            </div>
            <div>
              <dt>SCOPE</dt>
              <dd>{params.scope}</dd>
            </div>
            {params.date && (
              <div>
                <dt>DATE / TIMESTAMP</dt>
                <dd>{params.date}</dd>
              </div>
            )}
            <div>
              <dt>EXPECTED SIDE EFFECT</dt>
              <dd className="warning-text">{params.expectedSideEffect}</dd>
            </div>
          </dl>
        </div>

        {error && (
          <div className="error-notice" role="alert">
            {error}
          </div>
        )}

        <div className="confirmation-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "Executing..." : "Confirm & Execute"}{" "}
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </Overlay>
  );
}

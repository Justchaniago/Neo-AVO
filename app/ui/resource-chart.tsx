"use client";

import { useId, useState } from "react";

export type DataPoint = {
  observedAt: string;
  value: number | null;
};

export type ResourceLineChartProps = {
  data: DataPoint[];
  title: string;
  unit?: string;
  yMax?: number;
  color?: string;
  height?: number;
  expectedIntervalMs?: number;
  vcpuCount?: number;
  summaryMetrics?: {
    current: number | null;
    mean?: number | null;
    peak: number | null;
  };
};

export function ResourceLineChart({
  data,
  title,
  unit = "%",
  yMax = 100,
  color = "var(--ink)",
  height = 140,
  expectedIntervalMs = 3 * 60 * 1000,
  vcpuCount,
  summaryMetrics,
}: ResourceLineChartProps) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const chartId = useId();

  if (!data || data.length === 0) {
    return (
      <div className="resource-chart-card empty-chart">
        <div className="resource-chart-header">
          <span className="resource-chart-title">{title}</span>
        </div>
        <p className="muted" style={{ padding: "20px", textAlign: "center" }}>
          No telemetry available for this range
        </p>
      </div>
    );
  }

  const width = 600;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 15;
  const paddingBottom = 25;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;

  // Build points & detect GAPS
  const validPoints = data.map((d, index) => {
    if (d.value === null) return null;
    const timeMs = Date.parse(d.observedAt);
    const x =
      data.length === 1
        ? paddingLeft + plotWidth / 2
        : paddingLeft + (index / (data.length - 1)) * plotWidth;
    const clampedVal = Math.min(Math.max(d.value, 0), yMax);
    const y = paddingTop + plotHeight - (clampedVal / yMax) * plotHeight;
    return { x, y, timeMs, original: d, index };
  });

  const segments: Array<Array<{ x: number; y: number; timeMs: number; original: DataPoint; index: number }>> = [];
  let currentSegment: Array<{ x: number; y: number; timeMs: number; original: DataPoint; index: number }> = [];

  for (let i = 0; i < validPoints.length; i++) {
    const pt = validPoints[i];
    if (!pt) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    if (currentSegment.length > 0) {
      const prevPt = currentSegment[currentSegment.length - 1];
      if (pt.timeMs - prevPt.timeMs > expectedIntervalMs) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
    currentSegment.push(pt);
  }
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  const pathDs = segments.map((seg) => {
    if (seg.length === 0) return "";
    if (seg.length === 1) return `M ${seg[0].x} ${seg[0].y} L ${seg[0].x + 0.1} ${seg[0].y}`;
    return seg.reduce(
      (acc, pt, idx) => (idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`),
      ""
    );
  });

  const activePt = hoveredIdx !== null && validPoints[hoveredIdx] ? validPoints[hoveredIdx] : null;

  const formatTimeLabel = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return isoStr;
    }
  };

  const peakVal = summaryMetrics?.peak ?? Math.max(...data.map((d) => d.value ?? 0));
  const peakAvg = vcpuCount && peakVal !== undefined && peakVal !== null ? ((peakVal / 100) * vcpuCount).toFixed(2) : null;

  return (
    <div className="resource-chart-card">
      <div className="resource-chart-header">
        <div className="resource-chart-title-block">
          <span className="resource-chart-title">{title}</span>
          {summaryMetrics && (
            <div className="resource-chart-summary">
              {summaryMetrics.current !== undefined && summaryMetrics.current !== null && (
                <span>Current: <strong>{Math.round(summaryMetrics.current)}{unit}</strong></span>
              )}
              {summaryMetrics.mean !== undefined && summaryMetrics.mean !== null && (
                <span> | Mean: <strong>{Math.round(summaryMetrics.mean)}{unit}</strong></span>
              )}
              {summaryMetrics.peak !== undefined && summaryMetrics.peak !== null && (
                <span> | Peak: <strong>{Math.round(summaryMetrics.peak)}{unit}</strong></span>
              )}
              {peakAvg && (
                <span className="peak-load-avg"> (Peak Load Avg: <strong>{peakAvg} / {vcpuCount} vCPU</strong>)</span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="resource-chart-svg-container">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="resource-chart-svg"
          onMouseLeave={() => setHoveredIdx(null)}
          onTouchEnd={() => setHoveredIdx(null)}
        >
          <defs>
            <linearGradient id={`grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y = paddingTop + plotHeight - (val / yMax) * plotHeight;
            return (
              <g key={val} className="chart-gridline">
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke="#dcd6cd"
                  strokeDasharray="3 3"
                />
                <text
                  x={paddingLeft - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="10"
                  fill="#666"
                  fontFamily="var(--mono)"
                >
                  {val}{unit}
                </text>
              </g>
            );
          })}

          {/* Continuous Line Segments */}
          {pathDs.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          ))}

          {/* X-Axis Labels */}
          {data.length > 0 && (
            <>
              <text
                x={paddingLeft}
                y={height - 6}
                textAnchor="start"
                fontSize="10"
                fill="#666"
                fontFamily="var(--mono)"
              >
                {formatTimeLabel(data[0].observedAt)}
              </text>
              <text
                x={width - paddingRight}
                y={height - 6}
                textAnchor="end"
                fontSize="10"
                fill="#666"
                fontFamily="var(--mono)"
              >
                {formatTimeLabel(data[data.length - 1].observedAt)}
              </text>
            </>
          )}

          {/* Hover interactive zones */}
          {validPoints.map((pt) => {
            if (!pt) return null;
            return (
              <rect
                key={pt.index}
                x={pt.x - plotWidth / (2 * data.length)}
                y={paddingTop}
                width={plotWidth / data.length}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setHoveredIdx(pt.index)}
                onTouchStart={() => setHoveredIdx(pt.index)}
              />
            );
          })}

          {/* Active Hover Cursor */}
          {activePt && (
            <g className="chart-hover-indicator">
              <line
                x1={activePt.x}
                y1={paddingTop}
                x2={activePt.x}
                y2={paddingTop + plotHeight}
                stroke="var(--ink)"
                strokeDasharray="2 2"
                strokeWidth="1.5"
              />
              <circle
                cx={activePt.x}
                cy={activePt.y}
                r="5"
                fill={color}
                stroke="var(--ink)"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>

        {/* Hover Tooltip Overlay */}
        {activePt && (
          <div
            className="chart-tooltip"
            style={{
              left: `${Math.min(Math.max((activePt.x / width) * 100, 15), 85)}%`,
            }}
          >
            <div className="tooltip-time">{new Date(activePt.original.observedAt).toLocaleString()}</div>
            <div className="tooltip-value">
              {title}: <strong>{activePt.original.value}{unit}</strong>
              {vcpuCount && activePt.original.value !== null && (
                <span className="tooltip-load-avg">
                  {" "}(Load Avg: <strong>{((activePt.original.value / 100) * vcpuCount).toFixed(2)} / {vcpuCount} vCPU</strong>)
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

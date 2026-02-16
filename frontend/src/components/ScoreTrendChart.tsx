import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../lib/api';
import type { ScoreSnapshot, ScoreBreakdown } from '../types';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScoreTrendChartProps {
  companyId: string;
  days?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING = { top: 20, right: 16, bottom: 32, left: 40 };
const DOT_RADIUS = 4;
const DOT_HOVER_RADIUS = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function scoreColor(score: number): string {
  if (score >= 70) return '#ef4444'; // red-500 (HOT)
  if (score >= 40) return '#f59e0b'; // amber-500 (WARM)
  if (score >= 20) return '#3b82f6'; // blue-500 (COLD)
  return '#9ca3af'; // gray-400 (INACTIVE)
}

function breakdownLabel(key: string): string {
  const labels: Record<string, string> = {
    userCount: 'Users',
    velocity: 'Velocity',
    featureBreadth: 'Feature Breadth',
    engagement: 'Engagement',
    seniority: 'Seniority',
    firmographic: 'Firmographic',
  };
  return labels[key] || key;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoreTrendChart({
  companyId,
  days = 30,
  height = 200,
}: ScoreTrendChartProps) {
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tooltip state
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // Responsive width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    api
      .get(`/score-snapshots/${companyId}`, { params: { days } })
      .then((res) => {
        if (!cancelled) {
          setSnapshots(res.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load score history');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, days]);

  // Handle mouse move over SVG to find closest point
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (snapshots.length === 0 || width === 0) return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      const chartW = width - PADDING.left - PADDING.right;
      const stepX =
        snapshots.length > 1
          ? chartW / (snapshots.length - 1)
          : chartW;

      // Find closest data point
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < snapshots.length; i++) {
        const px = PADDING.left + (snapshots.length > 1 ? i * stepX : chartW / 2);
        const dist = Math.abs(mouseX - px);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      // Only show tooltip if mouse is within reasonable range of a point
      if (closestDist < stepX / 2 + 20 || snapshots.length === 1) {
        setHoveredIdx(closestIdx);
        const px =
          PADDING.left +
          (snapshots.length > 1 ? closestIdx * stepX : chartW / 2);
        const chartH = height - PADDING.top - PADDING.bottom;
        const py =
          PADDING.top +
          chartH -
          (snapshots[closestIdx].score / 100) * chartH;
        setTooltipPos({ x: px, y: py });
      } else {
        setHoveredIdx(null);
      }
    },
    [snapshots, width, height],
  );

  const handleMouseLeave = useCallback(() => {
    setHoveredIdx(null);
  }, []);

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          PQA Score Trend
        </h3>
        <div className="flex items-center justify-center" style={{ height }}>
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          PQA Score Trend
        </h3>
        <p className="text-sm text-red-500 text-center py-4">{error}</p>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          PQA Score Trend
        </h3>
        <div
          className="flex flex-col items-center justify-center"
          style={{ height }}
        >
          <svg
            className="w-10 h-10 text-gray-300 mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="text-sm text-gray-400">No score history yet</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Chart geometry
  // -------------------------------------------------------------------------

  const chartW = Math.max(0, width - PADDING.left - PADDING.right);
  const chartH = height - PADDING.top - PADDING.bottom;
  const stepX =
    snapshots.length > 1 ? chartW / (snapshots.length - 1) : chartW;

  // Build points
  const points = snapshots.map((s, i) => {
    const x =
      PADDING.left + (snapshots.length > 1 ? i * stepX : chartW / 2);
    const y = PADDING.top + chartH - (s.score / 100) * chartH;
    return { x, y, snapshot: s };
  });

  // SVG path for line
  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`)
    .join(' ');

  // Area fill path (line + close to bottom)
  const areaPath =
    linePath +
    ` L${points[points.length - 1].x},${PADDING.top + chartH}` +
    ` L${points[0].x},${PADDING.top + chartH} Z`;

  // Y-axis tick values
  const yTicks = [0, 25, 50, 75, 100];

  // X-axis labels (show up to 6 evenly spaced)
  const maxXLabels = Math.min(6, snapshots.length);
  const xLabelIndices: number[] = [];
  if (snapshots.length <= maxXLabels) {
    for (let i = 0; i < snapshots.length; i++) xLabelIndices.push(i);
  } else {
    for (let i = 0; i < maxXLabels; i++) {
      xLabelIndices.push(
        Math.round((i / (maxXLabels - 1)) * (snapshots.length - 1)),
      );
    }
  }

  // Current score color for the line
  const currentScore = snapshots[snapshots.length - 1].score;
  const lineColor = scoreColor(currentScore);

  // Hovered snapshot data for tooltip
  const hovered =
    hoveredIdx !== null ? snapshots[hoveredIdx] : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        PQA Score Trend
      </h3>
      <div ref={containerRef} className="relative">
        {width > 0 && (
          <svg
            ref={svgRef}
            width={width}
            height={height}
            className="overflow-visible"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {/* Grid lines */}
            {yTicks.map((tick) => {
              const y = PADDING.top + chartH - (tick / 100) * chartH;
              return (
                <g key={tick}>
                  <line
                    x1={PADDING.left}
                    y1={y}
                    x2={PADDING.left + chartW}
                    y2={y}
                    stroke="#f3f4f6"
                    strokeWidth={1}
                  />
                  <text
                    x={PADDING.left - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-[10px] fill-gray-400"
                  >
                    {tick}
                  </text>
                </g>
              );
            })}

            {/* X-axis labels */}
            {xLabelIndices.map((idx) => {
              const p = points[idx];
              if (!p) return null;
              return (
                <text
                  key={idx}
                  x={p.x}
                  y={PADDING.top + chartH + 20}
                  textAnchor="middle"
                  className="text-[10px] fill-gray-400"
                >
                  {formatDate(snapshots[idx].capturedAt)}
                </text>
              );
            })}

            {/* Area fill */}
            <path d={areaPath} fill={lineColor} opacity={0.08} />

            {/* Line */}
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Data point dots */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hoveredIdx === i ? DOT_HOVER_RADIUS : DOT_RADIUS}
                fill={hoveredIdx === i ? lineColor : '#fff'}
                stroke={lineColor}
                strokeWidth={2}
                className="transition-all duration-150"
              />
            ))}

            {/* Hover crosshair line */}
            {hoveredIdx !== null && (
              <line
                x1={tooltipPos.x}
                y1={PADDING.top}
                x2={tooltipPos.x}
                y2={PADDING.top + chartH}
                stroke={lineColor}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.4}
              />
            )}
          </svg>
        )}

        {/* Tooltip (rendered outside SVG for richer HTML) */}
        {hovered && hoveredIdx !== null && width > 0 && (
          <div
            className="absolute z-20 pointer-events-none bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2.5 text-xs"
            style={{
              left: Math.min(
                tooltipPos.x - 80,
                width - 180,
              ),
              top: Math.max(tooltipPos.y - 120, 0),
              minWidth: 160,
            }}
          >
            <p className="font-semibold text-gray-900 mb-1">
              {formatFullDate(hovered.capturedAt)}
            </p>
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: scoreColor(hovered.score) }}
              />
              <span className="font-bold text-gray-900">
                Score: {hovered.score}
              </span>
            </div>
            {hovered.breakdown && (
              <div className="space-y-0.5 border-t border-gray-100 pt-1.5 mt-1">
                {(
                  Object.entries(hovered.breakdown) as [
                    keyof ScoreBreakdown,
                    number,
                  ][]
                ).map(([key, val]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between text-gray-500"
                  >
                    <span>{breakdownLabel(key)}</span>
                    <span className="font-medium text-gray-700">
                      {val}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

import { useEffect, useState, useRef, useCallback } from 'react';
import api from '../lib/api';
import Spinner from './Spinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OverviewDataPoint {
  capturedAt: string;
  avg: number;
  min: number;
  max: number;
  count: number;
}

interface OrgScoreTrendChartProps {
  days?: number;
  height?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PADDING = { top: 20, right: 16, bottom: 32, left: 40 };
const DOT_RADIUS = 3.5;
const DOT_HOVER_RADIUS = 5.5;
const AVG_COLOR = '#6366f1'; // indigo-500
const RANGE_COLOR = '#9ca3af'; // gray-400

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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrgScoreTrendChart({
  days = 30,
  height = 200,
}: OrgScoreTrendChartProps) {
  const [data, setData] = useState<OverviewDataPoint[]>([]);
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
      .get('/score-snapshots/overview', { params: { days } })
      .then((res) => {
        if (!cancelled) {
          setData(res.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load score overview');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  // Handle mouse move over SVG to find closest point
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (data.length === 0 || width === 0) return;

      const svg = svgRef.current;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      const chartW = width - PADDING.left - PADDING.right;
      const stepX =
        data.length > 1 ? chartW / (data.length - 1) : chartW;

      // Find closest data point
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < data.length; i++) {
        const px = PADDING.left + (data.length > 1 ? i * stepX : chartW / 2);
        const dist = Math.abs(mouseX - px);
        if (dist < closestDist) {
          closestDist = dist;
          closestIdx = i;
        }
      }

      // Only show tooltip if mouse is within reasonable range of a point
      if (closestDist < stepX / 2 + 20 || data.length === 1) {
        setHoveredIdx(closestIdx);
        const px =
          PADDING.left +
          (data.length > 1 ? closestIdx * stepX : chartW / 2);
        const chartH = height - PADDING.top - PADDING.bottom;
        const py =
          PADDING.top +
          chartH -
          (data[closestIdx].avg / 100) * chartH;
        setTooltipPos({ x: px, y: py });
      } else {
        setHoveredIdx(null);
      }
    },
    [data, width, height],
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
          Score Overview
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
          Score Overview
        </h3>
        <p className="text-sm text-red-500 text-center py-4">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
          Score Overview
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
          <p className="text-sm text-gray-400">
            Score history will appear once snapshots are captured
          </p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Chart geometry
  // -------------------------------------------------------------------------

  const chartW = Math.max(0, width - PADDING.left - PADDING.right);
  const chartH = height - PADDING.top - PADDING.bottom;
  const stepX = data.length > 1 ? chartW / (data.length - 1) : chartW;

  // Build points for avg, min, max
  const points = data.map((d, i) => {
    const x = PADDING.left + (data.length > 1 ? i * stepX : chartW / 2);
    const avgY = PADDING.top + chartH - (d.avg / 100) * chartH;
    const minY = PADDING.top + chartH - (d.min / 100) * chartH;
    const maxY = PADDING.top + chartH - (d.max / 100) * chartH;
    return { x, avgY, minY, maxY, data: d };
  });

  // SVG path builders
  const buildLinePath = (accessor: (p: (typeof points)[0]) => number) =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${accessor(p)}`)
      .join(' ');

  const avgLinePath = buildLinePath((p) => p.avgY);
  const minLinePath = buildLinePath((p) => p.minY);
  const maxLinePath = buildLinePath((p) => p.maxY);

  // Area fill between max and min (max line forward, then min line backward to close)
  const areaPath =
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.maxY}`).join(' ') +
    ' ' +
    points
      .slice()
      .reverse()
      .map((p, i) => `${i === 0 ? 'L' : 'L'}${p.x},${p.minY}`)
      .join(' ') +
    ' Z';

  // Y-axis tick values
  const yTicks = [0, 25, 50, 75, 100];

  // X-axis labels (show up to 6 evenly spaced)
  const maxXLabels = Math.min(6, data.length);
  const xLabelIndices: number[] = [];
  if (data.length <= maxXLabels) {
    for (let i = 0; i < data.length; i++) xLabelIndices.push(i);
  } else {
    for (let i = 0; i < maxXLabels; i++) {
      xLabelIndices.push(
        Math.round((i / (maxXLabels - 1)) * (data.length - 1)),
      );
    }
  }

  // Hovered data point for tooltip
  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">
        Score Overview
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
                  {formatDate(data[idx].capturedAt)}
                </text>
              );
            })}

            {/* Area fill between min and max */}
            <path d={areaPath} fill={RANGE_COLOR} opacity={0.08} />

            {/* Min line (dashed) */}
            <path
              d={minLinePath}
              fill="none"
              stroke={RANGE_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Max line (dashed) */}
            <path
              d={maxLinePath}
              fill="none"
              stroke={RANGE_COLOR}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Avg line (solid, primary) */}
            <path
              d={avgLinePath}
              fill="none"
              stroke={AVG_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Avg data point dots */}
            {points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.avgY}
                r={hoveredIdx === i ? DOT_HOVER_RADIUS : DOT_RADIUS}
                fill={hoveredIdx === i ? AVG_COLOR : '#fff'}
                stroke={AVG_COLOR}
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
                stroke={AVG_COLOR}
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
              left: Math.min(tooltipPos.x - 80, width - 180),
              top: Math.max(tooltipPos.y - 130, 0),
              minWidth: 160,
            }}
          >
            <p className="font-semibold text-gray-900 mb-1.5">
              {formatFullDate(hovered.capturedAt)}
            </p>
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-0.5 rounded"
                    style={{ backgroundColor: AVG_COLOR }}
                  />
                  <span className="text-gray-500">Avg</span>
                </span>
                <span className="font-bold text-gray-900">{hovered.avg}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-0.5 rounded"
                    style={{
                      backgroundColor: RANGE_COLOR,
                      borderTop: '1px dashed',
                    }}
                  />
                  <span className="text-gray-500">Max</span>
                </span>
                <span className="font-medium text-gray-700">{hovered.max}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-0.5 rounded"
                    style={{
                      backgroundColor: RANGE_COLOR,
                      borderTop: '1px dashed',
                    }}
                  />
                  <span className="text-gray-500">Min</span>
                </span>
                <span className="font-medium text-gray-700">{hovered.min}</span>
              </div>
            </div>
            <div className="border-t border-gray-100 pt-1.5 mt-1.5">
              <div className="flex items-center justify-between text-gray-500">
                <span>Accounts</span>
                <span className="font-medium text-gray-700">
                  {hovered.count}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

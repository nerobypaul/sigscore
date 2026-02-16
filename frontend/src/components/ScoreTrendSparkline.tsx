import { useEffect, useState } from 'react';
import api from '../lib/api';
import type { ScoreSnapshot } from '../types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ScoreTrendSparklineProps {
  companyId: string;
  width?: number;
  height?: number;
  days?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return '#ef4444'; // red-500 (HOT)
  if (score >= 40) return '#f59e0b'; // amber-500 (WARM)
  if (score >= 20) return '#3b82f6'; // blue-500 (COLD)
  return '#9ca3af'; // gray-400 (INACTIVE)
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ScoreTrendSparkline({
  companyId,
  width = 80,
  height = 24,
  days = 7,
}: ScoreTrendSparklineProps) {
  const [snapshots, setSnapshots] = useState<ScoreSnapshot[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get(`/score-snapshots/${companyId}`, { params: { days } })
      .then((res) => {
        if (!cancelled) {
          setSnapshots(res.data.data || []);
        }
      })
      .catch(() => {
        if (!cancelled) setSnapshots([]);
      });

    return () => {
      cancelled = true;
    };
  }, [companyId, days]);

  // While loading, show a gray placeholder line
  if (snapshots === null) {
    return (
      <svg
        width={width}
        height={height}
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#e5e7eb"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  // No data
  if (snapshots.length === 0) {
    return (
      <svg
        width={width}
        height={height}
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="#e5e7eb"
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  // Compute geometry - pad 2px on top/bottom
  const padY = 2;
  const chartH = height - padY * 2;
  const scores = snapshots.map((s) => s.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const range = maxScore - minScore || 1; // avoid division by zero

  const stepX =
    snapshots.length > 1 ? width / (snapshots.length - 1) : width / 2;

  const points = snapshots.map((s, i) => {
    const x = snapshots.length > 1 ? i * stepX : width / 2;
    const y = padY + chartH - ((s.score - minScore) / range) * chartH;
    return { x, y };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ');

  // Color based on latest score
  const latestScore = scores[scores.length - 1];
  const color = scoreColor(latestScore);

  // Area fill path
  const areaD =
    pathD +
    ` L${points[points.length - 1].x.toFixed(1)},${height}` +
    ` L${points[0].x.toFixed(1)},${height} Z`;

  return (
    <svg
      width={width}
      height={height}
      className="flex-shrink-0"
      aria-label={`Score trend: ${scores.join(', ')}`}
    >
      <path d={areaD} fill={color} opacity={0.12} />
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot on latest point */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={2}
          fill={color}
        />
      )}
    </svg>
  );
}

import type { AccountScore, ScoreTier, ScoreTrend } from '../types';

// ---------------------------------------------------------------------------
// Tier color mappings
// ---------------------------------------------------------------------------

const TIER_BG: Record<ScoreTier, string> = {
  HOT: 'bg-red-500',
  WARM: 'bg-amber-500',
  COLD: 'bg-blue-500',
  INACTIVE: 'bg-gray-400',
};

const TIER_BG_LIGHT: Record<ScoreTier, string> = {
  HOT: 'bg-red-50 border-red-200',
  WARM: 'bg-amber-50 border-amber-200',
  COLD: 'bg-blue-50 border-blue-200',
  INACTIVE: 'bg-gray-50 border-gray-200',
};

const TIER_TEXT: Record<ScoreTier, string> = {
  HOT: 'text-red-700',
  WARM: 'text-amber-700',
  COLD: 'text-blue-700',
  INACTIVE: 'text-gray-500',
};

// ---------------------------------------------------------------------------
// Trend arrow SVGs
// ---------------------------------------------------------------------------

function TrendArrow({ trend }: { trend: ScoreTrend }) {
  if (trend === 'RISING') {
    return (
      <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    );
  }
  if (trend === 'FALLING') {
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181" />
      </svg>
    );
  }
  return (
    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Compact variant (for headers)
// ---------------------------------------------------------------------------

export function AccountScoreBadge({ score }: { score: AccountScore }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 border ${TIER_BG_LIGHT[score.tier]}`}>
      <span className={`text-lg font-bold ${TIER_TEXT[score.tier]}`}>{score.score}</span>
      <span className={`text-xs font-semibold uppercase ${TIER_TEXT[score.tier]}`}>{score.tier}</span>
      <TrendArrow trend={score.trend} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full score card with factor breakdown
// ---------------------------------------------------------------------------

interface AccountScoreCardProps {
  score: AccountScore;
}

export default function AccountScoreCard({ score }: AccountScoreCardProps) {
  const factors = score.factors || [];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">PQA Score</h3>

      {/* Score display */}
      <div className="flex items-center gap-4 mb-6">
        <div className={`w-20 h-20 rounded-2xl ${TIER_BG[score.tier]} flex items-center justify-center`}>
          <span className="text-3xl font-bold text-white">{score.score}</span>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold uppercase ${TIER_TEXT[score.tier]}`}>{score.tier}</span>
            <TrendArrow trend={score.trend} />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {score.signalCount} signals / {score.userCount} users
          </p>
          {score.lastSignalAt && (
            <p className="text-xs text-gray-400 mt-0.5">
              Last signal {new Date(score.lastSignalAt).toLocaleDateString()}
            </p>
          )}
        </div>
      </div>

      {/* Factor breakdown */}
      {factors.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Score Factors</h4>
          {factors.map((factor) => {
            const percentage = Math.min(100, Math.max(0, factor.value));
            return (
              <div key={factor.name}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-700 font-medium">{factor.name}</span>
                  <span className="text-gray-400">
                    {factor.value} (weight: {factor.weight})
                  </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${TIER_BG[score.tier]} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                {factor.description && (
                  <p className="text-xs text-gray-400 mt-0.5">{factor.description}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

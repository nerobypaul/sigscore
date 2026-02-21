interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-[3px]',
};

export default function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <div
      className={`animate-spin rounded-full border-indigo-600 border-t-transparent ${sizeClasses[size]} ${className}`}
      role="status"
      aria-label="Loading"
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

/** Full-page centered spinner for loading states */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <Spinner size="lg" />
    </div>
  );
}

/** Inline spinner for use inside tables or small containers */
export function InlineSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Spinner size="md" />
    </div>
  );
}

/** Skeleton shimmer block */
function SkeletonBlock({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  );
}

/** Skeleton loading for table rows — matches Contacts/Companies table layout */
export function TableSkeleton({ rows = 8, columns = 6 }: { rows?: number; columns?: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 px-4 w-10"><SkeletonBlock className="h-4 w-4" /></th>
              {Array.from({ length: columns - 1 }).map((_, i) => (
                <th key={i} className="py-3 px-4"><SkeletonBlock className="h-4 w-20" /></th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {Array.from({ length: rows }).map((_, row) => (
              <tr key={row}>
                <td className="py-3 px-4"><SkeletonBlock className="h-4 w-4" /></td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <SkeletonBlock className="h-8 w-8 rounded-full" />
                    <SkeletonBlock className="h-4 w-32" />
                  </div>
                </td>
                <td className="py-3 px-4"><SkeletonBlock className="h-4 w-40" /></td>
                <td className="py-3 px-4"><SkeletonBlock className="h-4 w-24" /></td>
                {columns > 4 && <td className="py-3 px-4"><SkeletonBlock className="h-4 w-28" /></td>}
                {columns > 5 && <td className="py-3 px-4"><SkeletonBlock className="h-4 w-20" /></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Skeleton loading for dashboard stat cards + content areas */
export function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Hero card placeholder */}
      <div className="bg-gradient-to-r from-indigo-600/30 to-purple-600/30 rounded-xl p-6 mb-8">
        <SkeletonBlock className="h-5 w-48 mb-2 !bg-indigo-300/30" />
        <SkeletonBlock className="h-3 w-64 mb-4 !bg-indigo-300/20" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white/10 rounded-lg p-4">
              <SkeletonBlock className="h-4 w-24 mb-2 !bg-indigo-300/20" />
              <SkeletonBlock className="h-3 w-16 !bg-indigo-300/15" />
            </div>
          ))}
        </div>
      </div>
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <SkeletonBlock className="h-3 w-20 mb-3" />
            <SkeletonBlock className="h-7 w-16 mb-2" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        ))}
      </div>
      {/* Chart + table area */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <SkeletonBlock className="h-5 w-32 mb-4" />
          <div className="flex items-end gap-1 h-40">
            {[60, 80, 45, 70, 55, 90, 40, 75, 65, 85, 50, 95, 60, 70].map((h, i) => (
              <div key={i} className={`flex-1 animate-pulse bg-gray-200 rounded-t`} style={{ height: `${h}%` }} />
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <SkeletonBlock className="h-5 w-28 mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <SkeletonBlock className="h-8 w-8 rounded-full" />
                <div className="flex-1">
                  <SkeletonBlock className="h-4 w-32 mb-1" />
                  <SkeletonBlock className="h-3 w-48" />
                </div>
                <SkeletonBlock className="h-4 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton loading for deals pipeline view */
export function DealsPipelineSkeleton() {
  return (
    <div className="flex gap-3 overflow-hidden pb-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex-shrink-0 w-72 bg-gray-100 rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-5 w-8 rounded-full" />
          </div>
          <div className="space-y-2">
            {Array.from({ length: 2 + i % 2 }).map((_, j) => (
              <div key={j} className="bg-white rounded-lg p-3 shadow-sm">
                <SkeletonBlock className="h-4 w-28 mb-2" />
                <SkeletonBlock className="h-3 w-20 mb-2" />
                <SkeletonBlock className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for PQA dashboard — score cards + chart + table */
export function PQASkeleton() {
  return (
    <div className="animate-pulse">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <SkeletonBlock className="h-3 w-16 mb-3" />
            <SkeletonBlock className="h-7 w-12 mb-2" />
            <SkeletonBlock className="h-3 w-20" />
          </div>
        ))}
      </div>
      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <SkeletonBlock className="h-5 w-32" />
        </div>
        <div className="divide-y divide-gray-100">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4">
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="h-5 w-12 rounded-full ml-auto" />
              <SkeletonBlock className="h-4 w-16" />
              <SkeletonBlock className="h-4 w-12" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton for detail pages (company/contact) — header + tabs + content */
export function DetailSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <SkeletonBlock className="h-4 w-20" />
        <SkeletonBlock className="h-4 w-4" />
        <SkeletonBlock className="h-4 w-32" />
      </div>
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <SkeletonBlock className="h-14 w-14 rounded-xl" />
          <div className="flex-1">
            <SkeletonBlock className="h-6 w-48 mb-2" />
            <SkeletonBlock className="h-4 w-32 mb-2" />
            <div className="flex gap-2">
              <SkeletonBlock className="h-5 w-16 rounded-full" />
              <SkeletonBlock className="h-5 w-20 rounded-full" />
            </div>
          </div>
        </div>
      </div>
      {/* Tab bar */}
      <div className="flex gap-4 border-b border-gray-200 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-4 w-20 mb-3" />
        ))}
      </div>
      {/* Content */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <SkeletonBlock className="h-8 w-8 rounded-full" />
              <div className="flex-1">
                <SkeletonBlock className="h-4 w-40 mb-1" />
                <SkeletonBlock className="h-3 w-56" />
              </div>
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton loading for card grid — matches Companies card layout */
export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 animate-pulse">
          <div className="flex items-start justify-between mb-3">
            <SkeletonBlock className="w-10 h-10 rounded-lg" />
            <SkeletonBlock className="h-5 w-16 rounded-full" />
          </div>
          <SkeletonBlock className="h-5 w-36 mb-2" />
          <SkeletonBlock className="h-4 w-24 mb-2" />
          <SkeletonBlock className="h-4 w-full mb-1" />
          <SkeletonBlock className="h-4 w-3/4" />
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
            <SkeletonBlock className="h-3 w-20" />
            <div className="ml-auto flex items-center gap-2">
              <SkeletonBlock className="h-5 w-16" />
              <SkeletonBlock className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

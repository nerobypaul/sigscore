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

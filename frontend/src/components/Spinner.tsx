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

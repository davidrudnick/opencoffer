export function PageLoading({
  title = "Loading",
  rows = 3,
}: {
  title?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-6 p-4 pb-24 md:p-8 md:pb-8">
      <div>
        <div className="h-7 w-44 animate-pulse rounded bg-surface-container" />
        <div className="mt-2 h-4 w-64 max-w-full animate-pulse rounded bg-surface-container" />
        <span className="sr-only">{title}</span>
      </div>
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className={`${index === 0 ? "col-span-12" : "col-span-12 lg:col-span-6"} rounded-2xl bg-surface-container-low p-5 shadow-sm`}
          >
            <div className="h-6 w-36 animate-pulse rounded bg-surface-container" />
            <div className="mt-2 h-4 w-52 max-w-full animate-pulse rounded bg-surface-container" />
            <div className="mt-6 h-52 animate-pulse rounded-xl bg-surface-container" />
          </div>
        ))}
      </div>
    </div>
  );
}

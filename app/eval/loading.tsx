export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-10 space-y-8 animate-pulse">
      <div>
        <div className="h-9 w-40 bg-muted rounded mb-2" />
        <div className="h-4 w-96 max-w-full bg-muted rounded" />
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded" />
        ))}
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-muted rounded" />
        ))}
      </div>
    </div>
  );
}

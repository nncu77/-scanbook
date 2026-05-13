export default function Loading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-2 gap-6 animate-pulse">
      <div className="aspect-[3/4] bg-muted rounded" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-16 bg-muted rounded" />
        ))}
      </div>
    </div>
  );
}

interface Props {
  rows?: number;
  height?: number;
}

export function Skeleton({ rows = 3, height = 56 }: Props) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton rounded-2xl" style={{ height }} />
      ))}
    </div>
  );
}

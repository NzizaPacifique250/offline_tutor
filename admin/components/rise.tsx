// Fades a page block in, staggered by position (capped at five steps).
export function Rise({ i = 0, className = "", children }: { i?: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={`rise ${className}`} style={{ animationDelay: `${Math.min(i, 5) * 40}ms` }}>
      {children}
    </div>
  );
}

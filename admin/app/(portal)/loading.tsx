export default function Loading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading
      </p>
      <div className="skeleton h-7 w-48" />
      <div className="skeleton mt-3 h-4 w-80 max-w-full" />
      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
      <div className="skeleton mt-6 h-70 rounded-lg" />
    </div>
  );
}

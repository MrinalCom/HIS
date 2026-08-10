"use client";

export function SkeletonLine({ width = "100%" }: { width?: string }) {
  return <div className="skeleton skeleton-line" style={{ width }} />;
}

export function SkeletonCard() {
  return <div className="skeleton skeleton-card" />;
}

export function DashboardSkeleton() {
  return (
    <div className="dashboard">
      <SkeletonLine width="220px" />
      <div style={{ height: "0.5rem" }} />
      <SkeletonLine width="160px" />
      <div className="dashboard-card">
        <SkeletonCard />
      </div>
      <div className="dashboard-card">
        <SkeletonCard />
      </div>
    </div>
  );
}

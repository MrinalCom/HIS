import { pool } from "../../config/db.js";

export interface AnalyticsOverview {
  appointmentsByStatus: { status: string; count: number }[];
  appointmentVolumeByDay: { day: string; count: number }[];
  totalRevenue: number;
  outstandingRevenue: number;
  noShowRate: number;
}

export async function getOverview(): Promise<AnalyticsOverview> {
  const [byStatus, byDay, revenue, noShow] = await Promise.all([
    pool.query<{ status: string; count: string }>(
      "SELECT status, count(*) FROM appointments GROUP BY status ORDER BY status"
    ),
    pool.query<{ day: string; count: string }>(
      `SELECT to_char(scheduled_start, 'YYYY-MM-DD') AS day, count(*)
       FROM appointments
       WHERE scheduled_start >= now() - interval '14 days'
       GROUP BY day ORDER BY day`
    ),
    pool.query<{ paid: string; outstanding: string }>(
      `SELECT
         COALESCE(SUM(total_amount) FILTER (WHERE status = 'paid'), 0) AS paid,
         COALESCE(SUM(total_amount) FILTER (WHERE status != 'paid' AND status != 'cancelled'), 0) AS outstanding
       FROM invoices`
    ),
    pool.query<{ total: string; noshows: string }>(
      `SELECT count(*) FILTER (WHERE status != 'cancelled' AND scheduled_start < now()) AS total,
              count(*) FILTER (WHERE status = 'noshow') AS noshows
       FROM appointments`
    ),
  ]);

  const total = Number(noShow.rows[0]?.total ?? 0);
  const noshows = Number(noShow.rows[0]?.noshows ?? 0);

  return {
    appointmentsByStatus: byStatus.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
    appointmentVolumeByDay: byDay.rows.map((r) => ({ day: r.day, count: Number(r.count) })),
    totalRevenue: Number(revenue.rows[0]?.paid ?? 0),
    outstandingRevenue: Number(revenue.rows[0]?.outstanding ?? 0),
    noShowRate: total > 0 ? noshows / total : 0,
  };
}

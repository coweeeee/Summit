import { supabase } from "@/lib/supabase";

export type TrailRatingStats = { avg_rating: number | null; rating_count: number };

export async function fetchRatingStats(
  trailIds: string[]
): Promise<{ map: Map<string, TrailRatingStats>; failed: boolean }> {
  const map = new Map<string, TrailRatingStats>();
  if (trailIds.length === 0) return { map, failed: false };
  const { data, error } = await supabase
    .from("trail_rating_stats")
    .select("trail_id, avg_rating, rating_count")
    .in("trail_id", trailIds);
  if (error) return { map, failed: true };
  (data || []).forEach((row: any) => {
    map.set(row.trail_id, { avg_rating: row.avg_rating, rating_count: row.rating_count ?? 0 });
  });
  return { map, failed: false };
}

export function formatRatingDisplay(
  stats: TrailRatingStats | undefined,
  fallbackRating?: number | null,
  statsFetchFailed?: boolean
): string {
  if (statsFetchFailed) {
    return fallbackRating != null && fallbackRating > 0 ? fallbackRating.toFixed(1) : "No ratings yet";
  }
  if (stats && stats.rating_count > 0 && stats.avg_rating != null) {
    return `${stats.avg_rating.toFixed(1)} (${stats.rating_count} rating${stats.rating_count === 1 ? "" : "s"})`;
  }
  return "No ratings yet";
}

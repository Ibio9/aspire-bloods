/** Passed via React Router `state` when navigating from a report into one of its markers, so
 * MarkerDetailPage can offer next/previous arrows within that same report's marker list without
 * a second API round-trip. Absent on a direct/deep link — the page falls back to no arrows. */
export interface MarkerNavState {
  reportId: string;
  title: string;
  markerIds: string[];
}

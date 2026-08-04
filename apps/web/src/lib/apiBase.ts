/**
 * Empty by default — same-origin, works with the Vite dev proxy locally
 * and any single-service deploy. Set VITE_API_BASE_URL (e.g.
 * https://api.bloods.aspireshield.com) when the frontend and API are on
 * different origins, as in the Vercel + Railway split deploy.
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

// The client. Its address, the /api/v1 rewrite, the CSRF header and the
// idempotency key all live in lib/api-core.ts, which the admin panel uses too,
// so the two clients cannot drift apart again.
import { createApiClient } from "@/lib/api-core";

export const api = createApiClient();

// Re-exported so "@/lib/api" stays the one import a page needs, whether it
// wants the client or just the URL.
export { API_URL, API_VERSION, apiUrl, versionedPath } from "@/lib/api-core";

// v3.31.21: alias kept so generated React Query hooks that import
// { apiClient } from "@/lib/api" resolve symmetrically with apps/admin
// (which exports the same name from its own api-client.ts).
export const apiClient = api;

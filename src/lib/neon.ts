import { createClient } from '@neon/neon-js';

const authUrl = process.env.EXPO_PUBLIC_NEON_AUTH_URL;
const dataApiUrl = process.env.EXPO_PUBLIC_NEON_DATA_API_URL;

export const isConfigured = Boolean(authUrl && dataApiUrl);

// Only public endpoints live in the client. Authorization is enforced by RLS in Postgres.
export const neon = createClient({
  auth: { url: authUrl ?? 'http://invalid.local/auth' },
  dataApi: { url: dataApiUrl ?? 'http://invalid.local/rest/v1' },
});

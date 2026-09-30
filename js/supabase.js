/* ============================================================
   Supabase client initialiser
   ------------------------------------------------------------
   Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your
   project credentials from:
   https://app.supabase.com/project/_/settings/api
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* 🔻 REPLACE THESE WITH YOUR PROJECT VALUES 🔻 */
export const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
export const SUPABASE_ANON_KEY = 'YOUR-ANON-KEY-HERE';
/* 🔺 END REPLACE 🔺 */

if (SUPABASE_URL.includes('YOUR-PROJECT') || SUPABASE_ANON_KEY.includes('YOUR-ANON')) {
  // Friendly console hint if not configured
  console.warn(
    '[Supabase] Please set SUPABASE_URL and SUPABASE_ANON_KEY in js/supabase.js'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ims-auth-token',
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
});
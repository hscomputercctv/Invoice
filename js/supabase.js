/* ============================================================
   Supabase client initialiser
   ------------------------------------------------------------
   Replace SUPABASE_URL and SUPABASE_ANON_KEY below with your
   project credentials from:
   https://app.supabase.com/project/_/settings/api
   ============================================================ */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/* 🔻 REPLACE THESE WITH YOUR PROJECT VALUES 🔻 */
export const SUPABASE_URL = 'https://pjipxxengfoumuloflwr.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqaXB4eGVuZ2ZvdW11bG9mbHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NjMzMjEsImV4cCI6MjEwNjMzOTMyMX0.DP1-gYhMZfT2wm9rw0Wv4vD_tyIW55PqrP1eZ4Rt1T4';
/* 🔺 END REPLACE 🔺 */

if (SUPABASE_URL.includes('https://pjipxxengfoumuloflwr.supabase.co') || SUPABASE_ANON_KEY.includes('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqaXB4eGVuZ2ZvdW11bG9mbHdyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NjMzMjEsImV4cCI6MjEwNjMzOTMyMX0.DP1-gYhMZfT2wm9rw0Wv4vD_tyIW55PqrP1eZ4Rt1T4')) {
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

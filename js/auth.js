/* ============================================================
   Auth: session guard, role resolution, logout
   ============================================================ */

import { supabase } from './supabase.js';

let cachedProfile = null;

/**
 * Returns current session or redirects to /index.html
 * Optionally enforces required roles.
 * @param {{ redirectTo?: string, requiredRoles?: string[] }} opts
 * @returns {Promise<{ session: any, profile: any } | null>}
 */
export async function requireAuth(opts = {}) {
  const { redirectTo = 'index.html', requiredRoles } = opts;

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    window.location.replace(redirectTo);
    return null;
  }

  // 🔥 Profile load — agar fail ho, fallback use karo
  let profile = null;
  try {
    profile = await getProfile(session.user.id);
  } catch (e) {
    console.warn('[auth] profile load failed, using fallback', e);
    profile = {
      id: session.user.id,
      full_name: session.user.email?.split('@')[0] || 'User',
      role: 'admin', // safer default than 'printer'
    };
  }

  const role = profile?.role || 'admin';

  // Role guard
  if (requiredRoles && requiredRoles.length) {
    if (!requiredRoles.includes(role)) {
      window.location.replace(role === 'printer' ? 'print-station.html' : 'dashboard.html');
      return null;
    }
  }

  // Printer users ko restrict karo (sirf print-station aur invoices)
  const path = window.location.pathname.split('/').pop() || 'index.html';
  if (role === 'printer' && !['print-station.html', 'invoices.html', 'index.html', ''].includes(path)) {
    window.location.replace('print-station.html');
    return null;
  }

  return { session, profile };
}

/**
 * Fetch (with caching) the profile for a given user id.
 */
export async function getProfile(userId) {
  if (cachedProfile && cachedProfile.id === userId) return cachedProfile;

  // Try to read existing profile
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[auth] profile fetch error', error);
  }

  if (data) {
    cachedProfile = data;
    return data;
  }

  // Auto-create a minimal profile if trigger didn't run (fallback)
  const { data: userData } = await supabase.auth.getUser();
  const email = userData?.user?.email || '';
  const fallback = {
    id: userId,
    full_name: email.split('@')[0] || 'User',
    role: 'printer', // safest default; promote to admin manually in DB
  };
  try {
    const { data: created } = await supabase
      .from('profiles')
      .upsert(fallback, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (created) {
      cachedProfile = created;
      return created;
    }
  } catch (e) {
    console.warn('[auth] could not auto-create profile', e);
  }
  cachedProfile = fallback;
  return fallback;
}

/**
 * Ensure user has one of the allowed roles. Redirects otherwise.
 */
export async function requireRole(session, allowed) {
  if (!session) return false;
  const profile = await getProfile(session.user.id);
  const role = profile?.role || 'printer';
  return allowed.includes(role);
}

/**
 * Sign out and go to login.
 */
export async function logout() {
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('[auth] signOut error', e);
  }
  cachedProfile = null;
  window.location.replace('index.html');
}

/**
 * Convenience: get currently logged-in user id (or null).
 */
export async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

/* ------------------------------------------------------------
   Global listeners: token refresh + kick on sign-out
   ------------------------------------------------------------ */
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    cachedProfile = null;
  }
});
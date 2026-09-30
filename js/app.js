/* ============================================================
   Shared UI helpers: navbar/sidebar, toasts, modals,
   counters, ripple, escaping, formatting
   ============================================================ */

import { supabase } from './supabase.js';
import { getProfile } from './auth.js';

/* -------------------- Escape / format -------------------- */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtMoney(amount, currency = 'PKR') {
  const n = Number(amount || 0);
  const formatted = n.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

export function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/* -------------------- Toasts -------------------- */
let toastContainer = null;
function ensureToastContainer() {
  if (toastContainer) return toastContainer;
  toastContainer = document.createElement('div');
  toastContainer.className = 'toast-container';
  document.body.appendChild(toastContainer);
  return toastContainer;
}

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms
 */
export function toast(message, type = 'info', duration = 3400) {
  const container = ensureToastContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icon = type === 'success'
    ? 'fa-solid fa-circle-check'
    : type === 'error'
      ? 'fa-solid fa-circle-exclamation'
      : 'fa-solid fa-circle-info';
  el.innerHTML = `<i class="${icon}"></i><span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hide');
    setTimeout(() => el.remove(), 320);
  }, duration);
}

/* -------------------- Ripple effect -------------------- */
export function attachRipple(el) {
  el.addEventListener('click', (e) => {
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  });
}
export function rippleAll() {
  document.querySelectorAll('.btn:not([data-ripple])').forEach((btn) => {
    btn.dataset.ripple = '1';
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    attachRipple(btn);
  });
}

/* -------------------- Animated counter -------------------- */
export function animateCounter(el, target, duration = 1200) {
  if (!el) return;
  const start = Number(el.textContent.replace(/[^0-9.-]/g, '')) || 0;
  const end = Number(target) || 0;
  const startTs = performance.now();

  function frame(now) {
    const p = Math.min(1, (now - startTs) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const current = start + (end - start) * eased;
    el.textContent = Math.round(current).toLocaleString();
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = Math.round(end).toLocaleString();
  }
  requestAnimationFrame(frame);
}

/* -------------------- Modal (promise-based confirm) -------------------- */
export function confirmModal({
  title = 'Are you sure?',
  message = '',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    let resolved = false;
    const safeResolve = (val) => {
      if (resolved) return;
      resolved = true;
      try {
        backdrop.classList.remove('open');
        setTimeout(() => {
          try { backdrop.remove(); } catch (_) {}
        }, 260);
      } catch (_) {}
      resolve(val);
    };

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal glass-card confirm-modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h2>${escapeHtml(title)}</h2>
          <button class="icon-btn" data-close><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body">
          <p>${message}</p>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" data-close>${escapeHtml(cancelText)}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} shimmer" data-confirm>${escapeHtml(confirmText)}</button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('open'));

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) return safeResolve(false);
      if (e.target.closest('[data-close]')) return safeResolve(false);
      if (e.target.closest('[data-confirm]')) return safeResolve(true);
    });

    // ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        safeResolve(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/* -------------------- Sidebar / navbar -------------------- */
const NAV_ITEMS = [
  { key: 'dashboard', href: 'dashboard.html', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', roles: ['admin'] },
  { key: 'create', href: 'create.html', label: 'Create Invoice', icon: 'fa-solid fa-file-circle-plus', roles: ['admin'] },
  { key: 'invoices', href: 'invoices.html', label: 'All Invoices', icon: 'fa-solid fa-file-invoice', roles: ['admin', 'printer'] },
  { key: 'print-station', href: 'print-station.html', label: 'Print Station', icon: 'fa-solid fa-print', roles: ['admin', 'printer'] },
  { key: 'settings', href: 'settings.html', label: 'Settings', icon: 'fa-solid fa-gear', roles: ['admin'] },
];

export async function buildSidebar(activeKey) {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  // 🔥 Defaults — kuch bhi fail ho, sidebar phir bhi render hoga
  let shopName = 'My Shop';
  let logoUrl = 'assets/logo.png';
  let role = 'admin';

  // Settings load — alag try/catch
  try {
    const { data } = await supabase
      .from('settings')
      .select('shop_name, logo_url')
      .limit(1)
      .maybeSingle();
    if (data?.shop_name) shopName = data.shop_name;
    if (data?.logo_url) logoUrl = data.logo_url;
  } catch (e) {
    console.warn('[sidebar] settings load failed (using defaults)', e);
  }

  // Profile load — alag try/catch
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (userData?.user) {
      const profile = await getProfile(userData.user.id);
      role = profile?.role || 'admin';
    }
  } catch (e) {
    console.warn('[sidebar] profile load failed (using admin)', e);
  }

  const brandLogoHTML = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="logo" onerror="this.style.display='none';this.parentNode.innerHTML='<i class=\\'fa-solid fa-receipt\\'></i>';" />`
    : `<i class="fa-solid fa-receipt"></i>`;

  // 🔥 ALWAYS set innerHTML — kabhi fail nahi hoga
  sidebar.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-logo">${brandLogoHTML}</div>
      <div class="brand-name">${escapeHtml(shopName)}</div>
    </div>
    ${NAV_ITEMS.filter(item => item.roles.includes(role)).map(item => `
      <a class="nav-item ${item.key === activeKey ? 'active' : ''}" href="${item.href}">
        <i class="${item.icon}"></i><span>${escapeHtml(item.label)}</span>
      </a>
    `).join('')}
    <div class="sidebar-spacer"></div>
    <button class="nav-item sidebar-logout" id="logoutBtn">
      <i class="fa-solid fa-right-from-bracket"></i><span>Logout</span>
    </button>
  `;

  // Backdrop
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  });

  // Menu button
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) {
    // 🔥 Remove old listeners to avoid duplicates
    const newBtn = menuBtn.cloneNode(true);
    menuBtn.parentNode.replaceChild(newBtn, menuBtn);
    newBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      backdrop.classList.toggle('show', isOpen);
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Log out?',
        message: 'You will need to sign in again to access the app.',
        confirmText: 'Log out',
        danger: true,
      });
      if (ok) {
        const { logout } = await import('./auth.js');
        logout();
      }
    });
  }

  try { rippleAll(); } catch (_) {}
}

  // Backdrop for mobile
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }
  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('show');
  });

  // Menu button toggle (mobile)
  const menuBtn = document.getElementById('menuBtn');
  if (menuBtn) {
    menuBtn.addEventListener('click', () => {
      const isOpen = sidebar.classList.toggle('open');
      backdrop.classList.toggle('show', isOpen);
    });
  }

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      const ok = await confirmModal({
        title: 'Log out?',
        message: 'You will need to sign in again to access the app.',
        confirmText: 'Log out',
        danger: true,
      });
      if (ok) {
        const { logout } = await import('./auth.js');
        logout();
      }
    });
  }

  rippleAll();
}

export async function buildUserChip() {
  const el = document.getElementById('userChip');
  if (!el) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return;
    const profile = await getProfile(userData.user.id);
    const name = profile?.full_name || userData.user.email || 'User';
    const role = profile?.role || 'admin';
    const initials = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
    el.innerHTML = `
      <div class="avatar">${escapeHtml(initials)}</div>
      <div>
        <div class="uc-name">${escapeHtml(name.split('@')[0])}</div>
        <div class="uc-role">${escapeHtml(role)}</div>
      </div>`;
  } catch (_) {}
}

/* -------------------- Auto-init on DOMContentLoaded -------------------- */
document.addEventListener('DOMContentLoaded', () => {
  rippleAll();
});

/* Ensure modals can be closed with Escape */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => {
      m.classList.remove('open');
      setTimeout(() => m.remove(), 260);
    });
  }
});
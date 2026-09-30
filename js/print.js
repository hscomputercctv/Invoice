/* ============================================================
   Print Station: realtime listener for new invoices
   ------------------------------------------------------------
   (The print-station.html page has its own inline module that
   imports the utilities below. This file exposes a reusable
   class so it can also be embedded elsewhere, e.g. dashboard.)
   ============================================================ */

import { supabase } from './supabase.js';
import { fetchInvoiceWithItems, printInvoice, markPrinted } from './invoice.js';
import { toast } from './app.js';

/**
 * Subscribes to invoice INSERTs and calls back with the new row.
 * @param {(invoice: any) => void} onNew
 * @param {(status: string) => void} [onStatus]
 * @returns {() => void} unsubscribe
 */
export function subscribeNewInvoices(onNew, onStatus) {
  const channel = supabase
    .channel('invoices-print-helper')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'invoices' },
      (payload) => {
        try {
          onNew?.(payload.new);
        } catch (e) {
          console.error('[print] onNew handler error', e);
        }
      }
    )
    .subscribe((status) => {
      onStatus?.(status);
    });

  return () => {
    try { supabase.removeChannel(channel); } catch (_) {}
  };
}

/**
 * Play a short two-tone chime using the Web Audio API.
 */
export function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.18, now + i * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.16);
      osc.stop(now + i * 0.16 + 0.22);
    });
  } catch (_) { /* audio may be blocked; ignore */ }
}

/**
 * Fetch + print an invoice and mark it printed.
 */
export async function printAndMark(invoiceId, settings) {
  const { data, error } = await fetchInvoiceWithItems(invoiceId);
  if (error) {
    toast(error.message, 'error');
    return { error };
  }
  printInvoice(data.invoice, data.items, settings);
  await markPrinted(invoiceId);
  return { data };
}
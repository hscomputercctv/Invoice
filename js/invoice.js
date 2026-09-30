/* ============================================================
   Invoice domain logic: numbering, totals, CRUD, print layout
   ============================================================ */

import { supabase } from './supabase.js';
import { escapeHtml, fmtMoney, fmtDate, toast } from './app.js';

/* ------------------------------------------------------------
   Invoice number generation
   Reads the highest existing INV-xxxx and returns next.
   Uses a DB-side advisory lock via RPC if available; falls back
   to a simple max-scan when the RPC isn't installed.
   ------------------------------------------------------------ */
export async function generateInvoiceNo() {
  // Preferred: DB function (see sql/schema.sql: next_invoice_no())
  try {
    const { data, error } = await supabase.rpc('next_invoice_no');
    if (!error && data) return data;
  } catch (_) { /* fall through */ }

  // Fallback: scan existing
  const { data } = await supabase
    .from('invoices')
    .select('invoice_no')
    .order('created_at', { ascending: false })
    .limit(50);

  let max = 0;
  (data || []).forEach(row => {
    const m = String(row.invoice_no || '').match(/INV-(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return 'INV-' + String(max + 1).padStart(4, '0');
}

/* ------------------------------------------------------------
   Totals
   ------------------------------------------------------------ */
export function calculateTotals(items, discount = 0, taxPercent = 0) {
  const subtotal = (items || []).reduce(
    (sum, it) => sum + Number(it.qty || 0) * Number(it.unit_price || 0),
    0
  );
  const disc = Number(discount || 0);
  const taxable = Math.max(0, subtotal - disc);
  const tax = +(taxable * (Number(taxPercent || 0) / 100)).toFixed(2);
  const total = +(taxable + tax).toFixed(2);
  return { subtotal: +subtotal.toFixed(2), discount: disc, tax, total };
}

/* ------------------------------------------------------------
   CRUD helpers
   ------------------------------------------------------------ */
export async function fetchInvoiceWithItems(invoiceId) {
  const [{ data: invoice, error: invErr }, { data: items, error: itErr }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', invoiceId).single(),
    supabase.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('id'),
  ]);
  if (invErr) return { error: invErr };
  if (itErr) return { error: itErr };
  return { data: { invoice, items: items || [] } };
}

export async function deleteInvoice(invoiceId) {
  return supabase.from('invoices').delete().eq('id', invoiceId);
}

export async function markPrinted(invoiceId) {
  return supabase
    .from('invoices')
    .update({ print_status: 'printed', printed_at: new Date().toISOString() })
    .eq('id', invoiceId);
}

/* ------------------------------------------------------------
   Invoice HTML (for on-screen preview + print area)
   ------------------------------------------------------------ */
export function invoiceHTML(invoice, items, settings = {}, opts = {}) {
  const currency = settings?.currency || 'PKR';
  const shopName = settings?.shop_name || 'My Shop';
  const shopAddr = settings?.address || 'Plot D, 48, Metroville Block-4, Karachi, Pakistan';
  const shopPhone = settings?.phone || '+92 315 8901026';
  const logoUrl = settings?.logo_url || 'assets/logo.png';
  const printMode = settings?.print_mode || 'a4';
  const { forScreen = false } = opts;

  const rows = (items || []).map(it => `
    <tr>
      <td>${escapeHtml(it.item_name)}</td>
      <td>${escapeHtml(it.qty)}</td>
      <td>${escapeHtml(fmtMoney(it.unit_price, currency))}</td>
      <td>${escapeHtml(fmtMoney(it.line_total ?? (it.qty * it.unit_price), currency))}</td>
    </tr>
  `).join('');

  const subtotal = invoice.subtotal ?? items.reduce((s, it) => s + Number(it.line_total || it.qty * it.unit_price), 0);
  const discount = invoice.discount ?? 0;
  const tax = invoice.tax ?? 0;
  const total = invoice.total ?? (subtotal - discount + tax);

  return `
    <div class="invoice-preview" id="printArea" data-print-mode="${escapeHtml(printMode)}">
      <div class="inv-head">
        <div class="inv-shop">
          <img src="${escapeHtml(logoUrl)}" alt="logo" onerror="this.style.display='none'" />
          <div>
            <h2>${escapeHtml(shopName)}</h2>
            <p>${escapeHtml(shopAddr)}</p>
            <p><i class="fa-solid fa-phone"></i> ${escapeHtml(shopPhone)}</p>
          </div>
        </div>
        <div class="inv-meta">
          <div class="inv-no">${escapeHtml(invoice.invoice_no || '—')}</div>
          <p><strong>Date:</strong> ${escapeHtml(fmtDate(invoice.invoice_date || invoice.created_at))}</p>
          <p><strong>Status:</strong> ${escapeHtml(invoice.payment_status || 'Unpaid')}</p>
        </div>
      </div>

      <div class="inv-parties">
        <div>
          <h4>Billed To</h4>
          <p><strong>${escapeHtml(invoice.customer_name || 'Walk-in Customer')}</strong></p>
          ${invoice.customer_phone ? `<p>${escapeHtml(invoice.customer_phone)}</p>` : ''}
          ${invoice.customer_address ? `<p>${escapeHtml(invoice.customer_address)}</p>` : ''}
        </div>
        <div style="text-align:right;">
          <h4>Invoice #</h4>
          <p>${escapeHtml(invoice.invoice_no || '—')}</p>
        </div>
      </div>

      <table class="inv-items">
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" style="text-align:center;">No items</td></tr>'}</tbody>
      </table>

      <div class="inv-totals">
        <div class="trow"><span>Subtotal</span><span>${escapeHtml(fmtMoney(subtotal, currency))}</span></div>
        ${discount ? `<div class="trow"><span>Discount</span><span>- ${escapeHtml(fmtMoney(discount, currency))}</span></div>` : ''}
        ${tax ? `<div class="trow"><span>Tax</span><span>${escapeHtml(fmtMoney(tax, currency))}</span></div>` : ''}
        <div class="trow grand"><span>Grand Total</span><span>${escapeHtml(fmtMoney(total, currency))}</span></div>
      </div>

      ${invoice.notes ? `<p style="margin-top:14px;font-size:11.5px;color:#4a5160;"><strong>Notes:</strong> ${escapeHtml(invoice.notes)}</p>` : ''}

      <div class="inv-foot">
        <div class="thanks">Thank you for your business!</div>
        <div>${escapeHtml(shopName)} · ${escapeHtml(shopPhone)}</div>
      </div>
    </div>
  `;
}

/* ------------------------------------------------------------
   Print in isolation (opens hidden iframe or new window)
   This avoids the app chrome being printed.
   ------------------------------------------------------------ */
export function printInvoice(invoice, items, settings = {}) {
  const html = invoiceHTML(invoice, items, settings, { forScreen: false });
  const printMode = settings?.print_mode || 'a4';

  const baseHref = document.baseURI;
  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(invoice.invoice_no || 'Invoice')}</title>
<base href="${escapeHtml(baseHref)}" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Poppins:wght@400;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<link rel="stylesheet" href="css/style.css" />
<link rel="stylesheet" href="css/print.css" />
<style>
  body { background: #fff !important; color: #000 !important; padding: 0; margin: 0; }
  .bg-orbs, .sidebar, .topbar, .toast-container { display: none !important; }
  .invoice-preview { box-shadow: none !important; border-radius: 0 !important; }
  ${printMode === 'thermal' ? `
    @page { size: 80mm auto; margin: 3mm; }
    body { width: 76mm; }
  ` : `
    @page { size: A4; margin: 12mm; }
  `}
  body.print-mode-thermal .invoice-preview { width: 76mm; margin: 0 auto; padding: 4mm; }
</style>
</head>
<body class="print-mode-${escapeHtml(printMode)}">
${html}
<script>
  window.onload = () => {
    setTimeout(() => { window.print(); }, 220);
  };
<\/script>
</body>
</html>`;

  // Use a hidden iframe so the parent window never loses focus
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const idoc = iframe.contentWindow.document;
  idoc.open();
  idoc.write(doc);
  idoc.close();

  // Cleanup after printing has had a chance to complete
  setTimeout(() => iframe.remove(), 60_000);
}
# Invoice Manager · Shop Edition

A complete, production-ready invoice management web app built with **plain HTML, CSS, and vanilla JavaScript** on top of **Supabase** (Postgres, Auth, Realtime, Storage).

- 🌐 Create invoices from anywhere (mobile or laptop)
- 🖨️ Real-time **Print Station** for the shop — auto-prints new invoices with sound + popup
- 💾 All invoices saved permanently in Postgres
- 📊 Animated dashboard with sales chart
- 🔐 Role-based access (`admin` / `printer`)
- 🎨 Premium metallic-blue glassmorphism UI

---

## 1. File structure

```
/index.html          Login
/dashboard.html      Stats + recent invoices
/create.html         Create new invoice
/invoices.html       Search / filter / view / reprint / delete / CSV
/print-station.html  Real-time print station
/settings.html       Shop name, logo, tax, currency, print mode
/css/style.css       Global theme
/css/print.css       A4 + 80mm thermal print rules
/js/supabase.js      Supabase client (placeholders)
/js/auth.js          Session guard + roles
/js/invoice.js       Invoice logic + print layout
/js/print.js         Reusable realtime + print helpers
/js/app.js           Toasts, modals, sidebar, counters
/sql/schema.sql      Complete Supabase schema
/assets/logo.png     Placeholder logo (drop your own)
```

---

## 2. Create the Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Pick a name, database password, and region close to you.
3. Wait ~2 minutes for it to finish provisioning.

---

## 3. Run the SQL schema

1. In Supabase, open **SQL Editor → New query**.
2. Paste the entire contents of `sql/schema.sql`.
3. Click **Run**. You should see “Success. No rows returned.”
4. Verify the tables appear under **Table Editor**.

The schema does all of this for you:

- Creates `profiles`, `settings`, `invoices`, `invoice_items`
- Enables **Row Level Security** with the correct policies
- Adds an auto-profile trigger on `auth.users`
- Creates the `next_invoice_no()` function so invoice numbers auto-increment safely
- Enables **Realtime** on `invoices` and `invoice_items`
- Creates a public storage bucket `logos` with the correct policies

---

## 4. Create your first users

1. In Supabase → **Authentication → Users → Add user → Create new user**.
2. Add two users:
   - **Admin** — e.g. `owner@yourshop.com` (password of your choice)
   - **Printer** — e.g. `printer@yourshop.com`

By default every new user is created with `role = 'printer'`. Promote your admin:

3. In **SQL Editor**, run:

   ```sql
   update public.profiles
   set role = 'admin', full_name = 'Shop Owner'
   where id = (select id from auth.users where email = 'owner@yourshop.com');
   ```

4. Confirm the printer's profile:

   ```sql
   select id, full_name, role from public.profiles;
   ```

You can now log in as either user.

---

## 5. Add your URL and anon key

1. In Supabase → **Project Settings → API**.
2. Copy **Project URL** and **anon public** key.
3. Open `js/supabase.js` and replace the two placeholders:

   ```js
   export const SUPABASE_URL = 'https://xxxxxxxxxxxx.supabase.co';
   export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
   ```

The anon key is safe to expose in the browser — Row Level Security does the actual protection.

---

## 6. Verify Realtime

1. In Supabase → **Database → Replication**.
2. Confirm `invoices` and `invoice_items` are listed under `supabase_realtime`.
   If not, click the toggle to enable them.
3. Open `print-station.html` in one tab (logged in as the printer user), and `create.html` in another (logged in as the admin). Save a test invoice. The print station should chime, pop the “New Invoice Received!” alert, add it to the queue, and preview it.

---

## 7. Host the site for free

### Option A — Netlify (easiest)
1. Push this folder to a GitHub repo.
2. Go to <https://app.netlify.com> → **Add new site → Import from Git**.
3. Pick the repo. **Build command** = *(leave empty)*. **Publish directory** = `/` (root).
4. Deploy. You’ll get a URL like `https://your-shop.netlify.app`.

### Option B — Vercel
1. Push to GitHub.
2. <https://vercel.com/new> → Import repo.
3. Framework preset = **Other**. Build command empty, output directory `./`.
4. Deploy.

### Option C — GitHub Pages
1. Push to GitHub.
2. Repo → **Settings → Pages** → Source = `main` branch, `/ (root)` folder.
3. Wait a minute; site appears at `https://<user>.github.io/<repo>/`.

> Note: For GitHub Pages, place the files at the repo root (or `/docs`) so URLs like `/dashboard.html` work directly.

---

## 8. Set up the Print Station for silent auto-print

Chrome supports printing without a dialog when launched with `--kiosk-printing`. This is ideal for the shop's dedicated print-PC.

### Windows
Create a shortcut to Chrome with this target:

```
"C:\Program Files\Google\Chrome\Application\chrome.exe"
  --kiosk-printing
  --app=https://your-shop.netlify.app/print-station.html
```

(All on one line. Adjust the path if Chrome is installed elsewhere.)

### macOS
Open Terminal and run:

```bash
open -na "Google Chrome" --args \
  --kiosk-printing \
  --app=https://your-shop.netlify.app/print-station.html
```

### Linux
```bash
google-chrome --kiosk-printing --app=https://your-shop.netlify.app/print-station.html
```

**Setup checklist on the print-PC:**

1. Log in once as the **printer** user. The session is saved in `localStorage`.
2. Set the default printer to your thermal or A4 printer (via OS settings).
3. In `print-station.html`, toggle **Auto-Print** on (persisted in `localStorage`).
4. Optionally set the page to open on startup (Task Scheduler on Windows / Login Items on macOS).

Now every new invoice will:

- Trigger a chime + popup on the print station
- Auto-print (if Auto-Print is enabled) without any dialog
- Get marked `print_status = 'printed'` in the database

---

## 9. Daily use

**Remote / admin workflow**
1. Log in from any device at `https://your-shop.netlify.app/`.
2. Open **Create Invoice**, fill in customer + items, click **Save & Send to Print Station**.
3. The invoice appears on the shop's print station in ~1 second.

**Shop print station**
- Keep `print-station.html` open on the shop PC.
- New invoices pop in with a sound and go to the top of the queue.
- Click **PRINT NOW** (or leave Auto-Print on) to print + mark as printed.
- Use **Reprint** anytime from `invoices.html` or the queue.

---

## 10. Changing the shop settings

Go to **Settings** (logged in as admin):

- **Shop Name** — appears in the header, sidebar, invoice header, and login footer
- **Logo** — upload a PNG/JPG/SVG (max 2 MB). Stored in Supabase Storage bucket `logos`.
- **Tax %** — the default tax applied to new invoices
- **Currency** — e.g. `PKR`, `USD`, `AED`
- **Print Mode** — **A4** (standard invoice) or **Thermal 80mm** (POS receipt paper)

Thermal mode is significantly narrower and adapts the layout automatically — both on screen preview and when printing.

---

## 11. Security notes

- The anon key is safe to expose; **Row Level Security** does the real work.
- Only authenticated users can read invoices.
- Only `admin` profiles can delete invoices or edit shop settings.
- Passwords are handled entirely by Supabase Auth — the app never sees them.
- All user-supplied strings are escaped before being inserted into the DOM (XSS-safe).
- The `logos` bucket is public-read (needed to render the logo on the invoice/print), but only authenticated users can upload.

---

## 12. Troubleshooting

| Problem | Solution |
|---|---|
| Login fails silently | Check `js/supabase.js` has the correct URL and anon key. |
| Realtime doesn’t fire | Confirm `invoices` is enabled in **Database → Replication**. |
| “permission denied for table profiles” | Make sure `sql/schema.sql` ran completely without errors. |
| Logo doesn’t show | Re-upload in Settings; confirm the URL is public in **Storage → logos**. |
| Invoice numbers repeat | Make sure the `invoice_no_seq` sequence exists; if you imported rows manually, run `select setval('invoice_no_seq', (select count(*) from invoices)+1);`. |
| Auto-print still shows a dialog | Make sure Chrome was started with `--kiosk-printing`. |
| Thermal prints too wide | Confirm Settings → Print Mode = **Thermal** and that your printer driver is set to 80 mm paper. |

---

## 13. License

MIT — free to use, modify, and ship for your shop.

Enjoy — and feel free to extend it (e.g. add a WhatsApp button, PDF export, or a customer CRM) on top of the same Supabase schema.
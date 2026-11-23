import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const bucket = "invoice-pdfs";

// Helvetica's WinAnsi encoding supports German umlauts, ß and the euro sign.
// Replace only characters outside the font's repertoire, not German text.
const safe = (x: unknown) => Array.from(String(x ?? "")).map((ch) => {
  const cp = ch.codePointAt(0)!;
  if (cp < 32 || cp === 127) return " ";
  if ((cp >= 32 && cp <= 126) || (cp >= 160 && cp <= 255) || cp === 8364) return ch;
  // Convert common typographic punctuation to WinAnsi-safe ASCII.
  if (cp === 8211 || cp === 8212) return "-";
  if (cp === 8216 || cp === 8217) return "'";
  if (cp === 8220 || cp === 8221) return '"';
  if (cp === 8230) return "...";
  return "?";
}).join("");
const amount = (x: unknown) => {
  const n = Number(x);
  if (!Number.isFinite(n)) throw new Error("invalid_amount");
  return n.toFixed(2).replace(".", ",") + " EUR";
};
const fmtDate = (x: unknown) => {
  const s = String(x ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8, 10) + "." + s.slice(5, 7) + "." + s.slice(0, 4) : s;
};
function address(a: unknown): string[] {
  if (!a || typeof a !== "object") return [];
  const o = a as Record<string, unknown>;
  return [o.street, [o.postcode ?? o.zip, o.city].filter(Boolean).join(" "), o.country]
    .filter(Boolean).map((v) => safe(v));
}
function error(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  const response = await handleRequest(req);
  for (const [key, value] of Object.entries(corsHeaders)) response.headers.set(key, value);
  return response;
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") return error("method_not_allowed", 405);
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return error("unauthenticated", 401);
  const client = createClient(url, anon, {
    global: { headers: { Authorization: "Bearer " + token } },
    auth: { persistSession: false },
  });
  const { data: userData, error: authError } = await client.auth.getUser(token);
  if (authError || !userData.user) return error("unauthenticated", 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return error("invalid_json", 400); }
  const invoiceId = String(body.invoice_id ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(invoiceId)) return error("invalid_invoice_id", 400);
  // Query through caller's RLS policies, not the service role.
  const { data: invoice, error: invoiceError } = await client
    .from("invoices").select("*").eq("id", invoiceId).maybeSingle();
  if (invoiceError) return error("invoice_lookup_failed", 500);
  if (!invoice) return error("not_found", 404);
  const { data: lines, error: linesError } = await client.from("invoice_lines")
    .select("line_number,description,lesson_date,quantity,gross_amount,net_amount,vat_amount")
    .eq("invoice_id", invoiceId).order("line_number");
  if (linesError) return error("lines_lookup_failed", 500);
  // Resolve the billed student's subject for generic lesson labels.
  // Prefer immutable invoice snapshot values, then the version valid in the billing month.
  const snap = invoice.snapshot ?? {};
  let lessonSubject = String(snap.subject ?? snap.student?.subject ?? snap.student_subject ?? "").trim();
  if (!lessonSubject && invoice.student_id) {
    const { data: studentVersion } = await client.from("student_versions")
      .select("subject").eq("student_id", invoice.student_id)
      .lte("effective_from", invoice.billing_month)
      .order("effective_from", { ascending: false }).limit(1).maybeSingle();
    lessonSubject = String(studentVersion?.subject ?? "").trim();
  }
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const path = invoice.ledger_id + "/" + invoice.id + "-subject-v2.pdf";
  const existing = await admin.storage.from(bucket).createSignedUrl(path, 300);
  if (existing.data?.signedUrl) {
    return new Response(JSON.stringify({ status: "ready", url: existing.data.signedUrl }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  // Reference layout: Beispielrechnung.pdf. A4 coordinates use a bottom-left origin.
  const pdf = await PDFDocument.create();
  const W = 595.28, H = 841.89, L = 81, R = 535;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.08, 0.08, 0.08);
  const gray = rgb(0.38, 0.38, 0.38);
  const snapshot = invoice.snapshot ?? {};
  const teacher = snapshot.teacher ?? {};
  const payer = snapshot.payer ?? {};
  const clean = (v: unknown) => safe(v).replace(/\s+/g, " ").trim();
  const money = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error("invalid_amount");
    return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " €";
  };
  const measure = (v: string, size = 10, strong = false) =>
    (strong ? bold : font).widthOfTextAtSize(v, size);
  const wrap = (v: unknown, maxWidth: number, size = 10, strong = false) => {
    const words = clean(v).split(" ").filter(Boolean);
    const result: string[] = [];
    let current = "";
    for (let word of words) {
      while (measure(word, size, strong) > maxWidth && word.length > 1) {
        let cut = 1;
        while (cut < word.length && measure(word.slice(0, cut + 1), size, strong) <= maxWidth) cut++;
        if (current) { result.push(current); current = ""; }
        result.push(word.slice(0, cut)); word = word.slice(cut);
      }
      if (!current) current = word;
      else if (measure(current + " " + word, size, strong) <= maxWidth) current += " " + word;
      else { result.push(current); current = word; }
    }
    if (current) result.push(current);
    return result.length ? result : [""];
  };
  let page = pdf.addPage([W, H]);
  const put = (v: unknown, x: number, y: number, size = 10, strong = false, color = ink) =>
    page.drawText(clean(v), { x, y, size, font: strong ? bold : font, color });
  const putRight = (v: unknown, y: number, size = 10, strong = false) => {
    const str = clean(v); put(str, R - measure(str, size, strong), y, size, strong);
  };
  const rule = (y: number, weight = 0.65) =>
    page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: weight, color: ink });
  const footer = () => {
    if (pdf.getPageCount() > 1) {
      put("Rechnung " + clean(invoice.invoice_number), L, 42, 8, false, gray);
      putRight("Seite " + pdf.getPageCount(), 42, 8);
    }
  };
  const period = () => {
    const m = String(invoice.billing_month ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(m)) return fmtDate(invoice.billing_month);
    const [year, month] = m.split("-").map(Number);
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return "01." + String(month).padStart(2, "0") + "." + year
      + " bis " + String(last).padStart(2, "0") + "." + String(month).padStart(2, "0") + "." + year;
  };
  // Sender and window-address area, matching the sample.
  let y = 774;
  for (const [i, item] of [teacher.name, ...address(teacher.address)].filter(Boolean).entries()) {
    for (const row of wrap(item, 280, 10, i === 0)) {
      put(row, L, y, 10, i === 0); y -= 14;
    }
  }
  const sender = [teacher.name, ...address(teacher.address)].filter(Boolean).join(", ");
  put(wrap(sender, 350, 7.5)[0], L, 688, 7.5, false, gray);
  y = 671;
  for (const item of [payer.name, ...address(payer.address)].filter(Boolean)) {
    for (const row of wrap(item, 310, 10)) { put(row, L, y); y -= 14; }
  }
  y = Math.min(603, y - 33);
  put(invoice.kind === "cancellation" ? "Stornorechnung" : "Rechnung", L, y, 17, true);
  y -= 30;
  const meta: Array<[string, unknown]> = [
    ["Rechnungsnummer", invoice.invoice_number],
    ["Rechnungsdatum", fmtDate(invoice.issued_on)],
    ["Leistungszeitraum", period()],
  ];
  const studentName = snapshot.student_name ?? snapshot.student?.name ?? snapshot.student?.student_name;
  if (studentName) meta.push(["Schüler/in", studentName]);
  if (teacher.tax_number) meta.push(["Steuernummer", teacher.tax_number]);
  if (invoice.kind === "cancellation") {
    meta.push(["Storno zu", snapshot.original_invoice_number ?? snapshot.original_invoice_id ?? ""]);
  }
  for (const [label, value] of meta) {
    put(label, L, y, 9.5);
    put(value, L + 139, y, 9.5);
    y -= 17;
  }
  y -= 20;
  const tableHeader = () => {
    put("Datum", L, y, 9.5, true);
    put("Leistung", L + 86, y, 9.5, true);
    putRight("Betrag", y, 9.5, true);
    rule(y - 6, 0.75);
    y -= 25;
  };
  const newPage = () => {
    footer();
    page = pdf.addPage([W, H]);
    put("Rechnung " + clean(invoice.invoice_number) + " (Fortsetzung)", L, 783, 10, true);
    y = 742;
    tableHeader();
  };
  const ensure = (needed: number) => { if (y - needed < 95) newPage(); };
  tableHeader();
  for (const item of lines ?? []) {
    const date = item.lesson_date ? fmtDate(item.lesson_date) : "";
    const rawDescription = String(item.description ?? "");
    const displayDescription = lessonSubject
      ? rawDescription.replace(/Unterrichtsstunde/gi, lessonSubject)
      : rawDescription;
    const description = wrap(displayDescription, R - (L + 86) - 95, 9.5);
    const rowHeight = Math.max(1, description.length) * 14 + 10;
    ensure(rowHeight);
    if (date) put(date, L, y, 9.5);
    for (const [i, line] of description.entries()) put(line, L + 86, y - i * 14, 9.5);
    putRight(money(item.gross_amount), y, 9.5);
    y -= rowHeight;
  }
  ensure(175);
  rule(y + 8, 0.8);
  y -= 8;
  put("Rechnungsbetrag", L + 86, y, 10, true);
  putRight(money(invoice.gross_amount), y, 10, true);
  y -= 32;
  const note = invoice.vat_mode === "small_business"
    ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
    : invoice.vat_mode === "exempt_teaching"
    ? "Umsatzsteuerfrei nach § 4 Nr. 21 UStG."
    : "Umsatzsteuer 19 % ist im Rechnungsbetrag enthalten.";
  for (const line of wrap(note, R - L, 9.5)) { put(line, L, y, 9.5); y -= 15; }
  y -= 13;
  const payment = "Bitte überweisen Sie den Betrag"
    + (invoice.due_on ? " bis zum " + fmtDate(invoice.due_on) : "")
    + " unter Angabe der Rechnungsnummer.";
  for (const line of wrap(payment, R - L, 9.5)) { ensure(15); put(line, L, y, 9.5); y -= 15; }
  y -= 9;
  const bank = ["Bankverbindung:", teacher.name, teacher.iban ? "IBAN " + teacher.iban : "",
    teacher.bank_name].filter(Boolean).join(" ");
  for (const line of wrap(bank, R - L, 9.5)) { ensure(15); put(line, L, y, 9.5); y -= 15; }
  if (teacher.email || teacher.phone) {
    y -= 9;
    const contact = ["Kontakt:", teacher.email, teacher.phone].filter(Boolean).join("  ·  ");
    for (const line of wrap(contact, R - L, 9.5)) { ensure(15); put(line, L, y, 9.5); y -= 15; }
  }
  y -= 22;
  ensure(14);
  put("Vielen Dank!", L, y, 9.5);
  footer();
  const bytes = await pdf.save();
  const uploaded = await admin.storage.from(bucket).upload(path, bytes, {
    contentType: "application/pdf", upsert: false, cacheControl: "3600",
  });
  if (uploaded.error && !String(uploaded.error.message).includes("already exists")
    && !String(uploaded.error.message).includes("Duplicate")) {
    return error("pdf_upload_failed", 500);
  }
  const signed = await admin.storage.from(bucket).createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) return error("pdf_link_failed", 500);
  return new Response(JSON.stringify({ status: "ready", url: signed.data.signedUrl }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

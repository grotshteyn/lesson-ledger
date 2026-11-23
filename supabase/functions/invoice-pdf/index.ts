import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const url = Deno.env.get("SUPABASE_URL")!;
const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const bucket = "invoice-pdfs";

// Helvetica's WinAnsi encoding supports German umlauts, ß and the euro sign.
// Replace only characters outside the font's repertoire, not German text.
const safe = (x: unknown) => String(x ?? "")
  .replace(/[\\u0000-\\u001F\\u007F]/g, " ")
  .replace(/[^\\x20-\\x7E\\u00A0-\\u00FF\\u20AC]/g, "?");
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

Deno.serve(async (req) => {
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
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const path = invoice.ledger_id + "/" + invoice.id + "-din5008-v2.pdf";
  const existing = await admin.storage.from(bucket).createSignedUrl(path, 300);
  if (existing.data?.signedUrl) {
    return new Response(JSON.stringify({ status: "ready", url: existing.data.signedUrl }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  // DIN 5008-inspired A4 invoice. Coordinates are PDF points, origin bottom-left.
  const pdf = await PDFDocument.create();
  const W = 595.28, H = 841.89, left = 70.9, right = 524.4;
  const ink = rgb(0.13, 0.16, 0.19), muted = rgb(0.39, 0.42, 0.45), rule = rgb(0.79, 0.81, 0.83);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const snapshot = invoice.snapshot ?? {};
  const teacher = snapshot.teacher ?? {};
  const payer = snapshot.payer ?? {};
  const text = (value: unknown) => safe(value).replace(/\\s+/g, " ").trim();
  const width = (s: string, size: number, strong = false) => (strong ? bold : font).widthOfTextAtSize(s, size);
  const wrap = (value: unknown, max: number, size: number, strong = false): string[] => {
    const words = text(value).split(" ").filter(Boolean);
    const out: string[] = [];
    let row = "";
    for (let word of words) {
      while (width(word, size, strong) > max && word.length > 1) {
        let n = 1;
        while (n < word.length && width(word.slice(0, n + 1), size, strong) <= max) n++;
        if (row) { out.push(row); row = ""; }
        out.push(word.slice(0, n)); word = word.slice(n);
      }
      if (!row) row = word;
      else if (width(row + " " + word, size, strong) <= max) row += " " + word;
      else { out.push(row); row = word; }
    }
    if (row) out.push(row);
    return out.length ? out : [""];
  };
  let page = pdf.addPage([W, H]);
  let y = 0;
  const draw = (value: unknown, x: number, baseline: number, size = 10, strong = false, color = ink) =>
    page.drawText(text(value), { x, y: baseline, font: strong ? bold : font, size, color });
  const line = (baseline: number, x1 = left, x2 = right, thickness = 0.65) =>
    page.drawLine({ start: { x: x1, y: baseline }, end: { x: x2, y: baseline }, thickness, color: rule });
  const rightText = (value: unknown, baseline: number, size = 10, strong = false, x = right) => {
    const s = text(value); draw(s, x - width(s, size, strong), baseline, size, strong);
  };
  const footer = () => {
    line(49);
    draw("Rechnung " + text(invoice.invoice_number), left, 34, 8, false, muted);
    rightText(String(pdf.getPageCount()), 34, 8);
  };
  const continuation = () => {
    footer();
    page = pdf.addPage([W, H]);
    draw("Rechnung " + text(invoice.invoice_number) + " · Fortsetzung", left, 785, 10, true);
    line(770);
    y = 748;
  };
  const ensure = (needed: number) => { if (y - needed < 94) continuation(); };
  // Header: issuer identity in the top-right area, restrained and letter-like.
  const teacherName = text(teacher.name);
  rightText(teacherName, 785, 12, true);
  const senderLines = [...address(teacher.address), ...(teacher.email ? [teacher.email] : [])];
  let sy = 769;
  for (const entry of senderLines) for (const row of wrap(entry, 225, 8.5)) {
    rightText(row, sy, 8.5); sy -= 12;
  }
  // DIN 5008 type B-style window area: 20 mm left, 45 mm top, 85 mm wide.
  const addrX = left, addrTop = H - 127.6;
  const senderShort = [teacherName, ...address(teacher.address)].filter(Boolean).join(" · ");
  draw(wrap(senderShort, 239, 7)[0], addrX, addrTop - 10, 7, false, muted);
  line(addrTop - 14, addrX, addrX + 240, 0.4);
  let ay = addrTop - 34;
  for (const entry of [payer.name, ...address(payer.address)]) {
    for (const row of wrap(entry, 238, 10)) { draw(row, addrX, ay, 10); ay -= 15; }
  }
  // Document heading and metadata below the address field.
  y = 533;
  draw(invoice.kind === "cancellation" ? "Stornorechnung" : "Rechnung", left, y, 23, true);
  y -= 31;
  const metadata: [string, string][] = [
    ["Rechnungsnummer", text(invoice.invoice_number)],
    ["Rechnungsdatum", fmtDate(invoice.issued_on)],
    ["Leistungszeitraum", (() => {
      const m = String(invoice.billing_month ?? "").slice(0, 7);
      if (!/^\\d{4}-\\d{2}$/.test(m)) return fmtDate(invoice.billing_month);
      const months = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
      return months[Number(m.slice(5, 7)) - 1] + " " + m.slice(0, 4);
    })()],
    ["Fällig am", fmtDate(invoice.due_on)],
  ];
  if (invoice.kind === "cancellation") metadata.push(["Storno zu", text(snapshot.original_invoice_number ?? snapshot.original_invoice_id)]);
  for (const [label, value] of metadata) {
    draw(label, left, y, 9, false, muted); draw(value, left + 120, y, 9, true); y -= 17;
  }
  y -= 20;
  const tableHeader = () => {
    line(y + 11);
    draw("Leistung", left, y - 4, 9, true);
    rightText("Betrag (brutto)", y - 4, 9, true);
    line(y - 12);
    y -= 29;
  };
  tableHeader();
  for (const item of lines ?? []) {
    const description = wrap(item.description, 312, 9.5);
    const date = item.lesson_date ? fmtDate(item.lesson_date) : "";
    const rows = description.length + (date ? 1 : 0);
    ensure(rows * 14 + 15);
    if (y > 720) tableHeader();
    for (const row of description) { draw(row, left, y, 9.5); y -= 14; }
    if (date) { draw(date, left, y, 8, false, muted); y -= 14; }
    rightText(amount(item.gross_amount), y + rows * 14 - 14, 9.5);
    y -= 12;
    line(y + 4, left, right, 0.35);
    y -= 10;
  }
  ensure(170);
  y -= 4;
  const totals: [string, unknown][] = [
    ["Netto", invoice.net_amount],
    ["Umsatzsteuer", invoice.vat_amount],
  ];
  for (const [label, value] of totals) {
    draw(label, right - 220, y, 9.5); rightText(amount(value), y, 9.5); y -= 18;
  }
  line(y + 7, right - 220, right, 1);
  y -= 11;
  draw("Gesamtbetrag", right - 220, y, 12, true);
  rightText(amount(invoice.gross_amount), y, 12, true);
  y -= 32;
  const taxNote = invoice.vat_mode === "small_business"
    ? "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet."
    : invoice.vat_mode === "exempt_teaching"
    ? "Umsatzsteuerfrei nach § 4 Nr. 21 UStG."
    : "Umsatzsteuer 19 % ist im Gesamtbetrag enthalten.";
  for (const row of wrap(taxNote, right - left, 9)) { ensure(14); draw(row, left, y, 9, false, muted); y -= 14; }
  y -= 24;
  ensure(100);
  draw("Bankverbindung", left, y, 11, true); y -= 20;
  if (teacher.bank_name) { for (const row of wrap(teacher.bank_name, 380, 9.5)) { draw(row, left, y, 9.5); y -= 15; } }
  if (teacher.iban) { draw("IBAN", left, y, 9, false, muted); draw(teacher.iban, left + 55, y, 9.5); y -= 17; }
  if (teacher.tax_number) { y -= 10; draw("Steuernummer: " + text(teacher.tax_number), left, y, 8.5, false, muted); }
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
});

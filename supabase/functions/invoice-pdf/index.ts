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
  const path = invoice.ledger_id + "/" + invoice.id + ".pdf";
  const existing = await admin.storage.from(bucket).createSignedUrl(path, 300);
  if (existing.data?.signedUrl) {
    return new Response(JSON.stringify({ status: "ready", url: existing.data.signedUrl }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.12, 0.17, 0.24);
  let y = 795;
  function write(value: unknown, opts: { size?: number; bold?: boolean; x?: number; step?: number } = {}) {
    const text = safe(value);
    const size = opts.size ?? 10;
    if (y < 65) { page = pdf.addPage([595, 842]); y = 795; }
    page.drawText(text.slice(0, 100), { x: opts.x ?? 48, y, font: opts.bold ? bold : font, size, color: dark });
    y -= opts.step ?? size + 7;
  }
  const snapshot = invoice.snapshot ?? {};
  const teacher = snapshot.teacher ?? {};
  const payer = snapshot.payer ?? {};
  write(invoice.kind === "cancellation" ? "STORNORECHNUNG" : "RECHNUNG", { size: 21, bold: true, step: 36 });
  write(teacher.name ?? "", { bold: true });
  for (const s of address(teacher.address)) write(s);
  if (teacher.email) write(teacher.email);
  if (teacher.tax_number) write("Steuernummer: " + teacher.tax_number);
  y -= 18;
  write("Rechnung an:", { bold: true });
  write(payer.name ?? "", { bold: true });
  for (const s of address(payer.address)) write(s);
  y -= 20;
  write("Rechnungsnummer: " + invoice.invoice_number, { bold: true });
  write("Rechnungsdatum: " + fmtDate(invoice.issued_on));
  write("Leistungsmonat: " + fmtDate(invoice.billing_month));
  write("Fällig am: " + fmtDate(invoice.due_on));
  if (invoice.kind === "cancellation") {
    write("Storno zur Rechnung: " + (snapshot.original_invoice_number ?? snapshot.original_invoice_id ?? ""));
  }
  y -= 17;
  write("Leistung                                      Betrag (brutto)", { bold: true, step: 24 });
  for (const line of lines ?? []) {
    const label = safe(line.description).slice(0, 58);
    write(label, { size: 9, step: 13 });
    write(amount(line.gross_amount), { x: 430, size: 9, step: 21 });
  }
  y -= 10;
  write("Netto: " + amount(invoice.net_amount), { bold: true });
  write("Umsatzsteuer: " + amount(invoice.vat_amount), { bold: true });
  write("Gesamtbetrag: " + amount(invoice.gross_amount), { size: 13, bold: true, step: 28 });
  if (invoice.vat_mode === "small_business") {
    write("Keine Umsatzsteuer gemäß § 19 UStG.");
  } else if (invoice.vat_mode === "exempt_teaching") {
    write("Umsatzsteuerfrei nach § 4 Nr. 21 UStG.");
  } else {
    write("Umsatzsteuer 19 % ist im Gesamtbetrag enthalten.");
  }
  if (teacher.iban) write("IBAN: " + teacher.iban);
  if (teacher.bank_name) write("Bank: " + teacher.bank_name);
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

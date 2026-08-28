import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import doleLogo from "../../assets/DOLE LOGO.jpg?inline";
import {
  type ReportInput,
  AGG,
  ratio,
  noteCategory,
  reportBaseName,
  metricOf as m,
} from "./reportShared";

export type { ReportInput } from "./reportShared";

// --- palette (DOLE, from src/style.css) -----------------------------------
type RGB = [number, number, number];
const BLUE: RGB = [30, 65, 155];
const BLUE_DEEP: RGB = [20, 44, 104];
const RED: RGB = [206, 32, 41];
const GOLD: RGB = [250, 209, 21];
const GOLD_INK: RGB = [138, 108, 7];
const INK: RGB = [16, 18, 35];
const INK_SOFT: RGB = [75, 79, 99];
const INK_FAINT: RGB = [130, 134, 155];
const RULE: RGB = [216, 218, 226];
const BAND: RGB = [242, 241, 246];
const GOOD: RGB = [28, 122, 79];
const WARN: RGB = [176, 121, 31];

// --- formatting ----------------------------------------------------------
// jsPDF's built-in fonts are WinAnsi-encoded: no peso sign, arrows or Δ.
function money(n: number): string {
  return "PHP " + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function grp(n: number): string {
  return n.toLocaleString("en-US");
}
function pctText(p: number | null): string {
  return p === null ? "-" : p.toFixed(1);
}
function toneFor(p: number | null): RGB {
  if (p === null) return INK_FAINT;
  if (p >= 95) return GOOD;
  if (p >= 60) return WARN;
  return RED;
}
function clean(s: string): string {
  return s
    .replace(/₱/g, "PHP ")
    .replace(/→/g, "->")
    .replace(/≈/g, "~")
    .replace(/[Δ]/g, "change");
}

// crop the "DEPARTMENT OF LABOR AND EMPLOYMENT" wordmark row off the JPG
let cachedLogo: string | null = null;
async function emblemDataUri(): Promise<string> {
  if (cachedLogo) return cachedLogo;
  const img = new Image();
  img.src = doleLogo;
  await img.decode();
  const h = Math.round(img.naturalHeight * 0.76);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, h);
  ctx.drawImage(img, 0, 0);
  cachedLogo = canvas.toDataURL("image/jpeg", 0.92);
  return cachedLogo;
}

// --- layout constants --------------------------------------------------
const PAGE_W = 595.28;
const ML = 42;
const MR = 42;
const CONTENT_W = PAGE_W - ML - MR;
const BOTTOM = 806;

export async function buildReportPdf(input: ReportInput): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
  doc.setProperties({
    title: reportBaseName(input),
    subject: `${input.programName} monitoring report - ${input.periodLabel}`,
    author: "DOLE MIMAROPA - TSSD",
    creator: "TSSD DMS",
  });
  const emblem = await emblemDataUri();

  const region = input.entries.find((e) => AGG.test(e.scope)) ?? null;
  const provinces = input.entries.filter((e) => !AGG.test(e.scope));
  const generated = new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let y = 40;

  const setFill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const setText = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const setDraw = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);

  const ensure = (need: number) => {
    if (y + need > BOTTOM) {
      doc.addPage();
      y = 44;
    }
  };
  const advanceAfterTable = (gap = 18) => {
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + gap;
  };

  const sectionHeading = (eyebrow: string, title: string) => {
    ensure(52);
    setFill(GOLD);
    doc.rect(ML, y, 12, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    setText(BLUE);
    doc.text(eyebrow.toUpperCase(), ML + 18, y + 3.2);
    y += 13;
    doc.setFont("times", "bold");
    doc.setFontSize(13);
    setText(INK);
    doc.text(title, ML, y + 5);
    y += 17;
  };

  const tableTone = (
    dataKeyIsPct: (key: string | number) => boolean,
  ): Partial<Parameters<typeof autoTable>[1]> => ({
    startY: y,
    margin: { left: ML, right: MR, bottom: 40 },
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: { top: 3.5, right: 5, bottom: 3.5, left: 5 },
      textColor: INK,
      lineColor: RULE,
      lineWidth: 0.4,
    },
    headStyles: {
      fillColor: BAND,
      textColor: INK_SOFT,
      fontStyle: "bold",
      fontSize: 7,
      lineColor: RULE,
      lineWidth: 0.4,
    },
    didParseCell: (data: any) => {
      const key = data.column.dataKey;
      if (data.section === "body" && dataKeyIsPct(key)) {
        const raw = String(data.cell.raw ?? "").replace(/[^\d.-]/g, "");
        const val = parseFloat(raw);
        data.cell.styles.textColor = isNaN(val) ? INK_FAINT : toneFor(val);
        data.cell.styles.fontStyle = "bold";
      }
      if (
        data.section === "body" &&
        AGG.test(String(data.row.raw?.scope ?? ""))
      ) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [251, 251, 253];
      }
    },
  });

  // ---------- tricolour rule ----------
  setFill(BLUE);
  doc.rect(0, 0, PAGE_W * 0.46, 4, "F");
  setFill(GOLD);
  doc.rect(PAGE_W * 0.46, 0, PAGE_W * 0.08, 4, "F");
  setFill(RED);
  doc.rect(PAGE_W * 0.54, 0, PAGE_W * 0.46, 4, "F");

  // ---------- masthead ----------
  doc.addImage(emblem, "JPEG", ML, y, 44, 44);
  const bx = ML + 56;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  setText(GOLD_INK);
  doc.text("REPUBLIC OF THE PHILIPPINES", bx, y + 6);
  doc.setFont("times", "bold");
  doc.setFontSize(12);
  setText(BLUE_DEEP);
  doc.text("Department of Labor and Employment", bx, y + 20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setText(INK_SOFT);
  doc.text("MIMAROPA Region", bx, y + 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  setText(INK_SOFT);
  doc.text("Technical Services and Support Division (TSSD)", bx, y + 43);

  doc.setFontSize(7.5);
  setText(INK_SOFT);
  const meta = [
    `Generated ${generated}`,
    `Prepared by ${input.preparedBy}`,
    `Source ${input.sourceFileName}`,
  ];
  meta.forEach((line, i) =>
    doc.text(line, PAGE_W - MR, y + 8 + i * 11, { align: "right", maxWidth: 220 }),
  );

  y += 54;
  setDraw(BLUE);
  doc.setLineWidth(1.5);
  doc.line(ML, y, PAGE_W - MR, y);
  doc.setLineWidth(0.4);
  y += 20;

  // ---------- title ----------
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  setText(INK_FAINT);
  doc.text("OO1 MONITORING", ML, y);
  y += 12;
  doc.setFont("times", "bold");
  doc.setFontSize(17);
  setText(BLUE_DEEP);
  const titleLines = doc.splitTextToSize(
    `${input.programFullName} - ${input.periodLabel} Monitoring Report`,
    CONTENT_W,
  );
  doc.text(titleLines, ML, y + 4);
  y += titleLines.length * 19 + 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  setText(INK_SOFT);
  const subLines = doc.splitTextToSize(
    "Target vs. actual by province, as of the uploaded logsheet. Figures are system-derived and pending validation against official records.",
    CONTENT_W,
  );
  doc.text(subLines, ML, y);
  y += subLines.length * 11 + 16;

  // ---------- executive summary ----------
  if (region) {
    sectionHeading("At a glance - MIMAROPA Region", "Regional summary");
    const paid = m(region, "paid");
    const fund = m(region, "fund");
    const bits: string[] = [];
    if (paid) {
      const p = ratio(paid.actual, paid.target);
      bits.push(
        `Beneficiaries paid: ${grp(paid.actual)}${paid.target !== null ? ` of ${grp(paid.target)} (${pctText(p)}%)` : ""}`,
      );
    }
    if (fund) {
      const p = ratio(fund.actual, fund.target);
      bits.push(
        `Fund disbursed: ${money(fund.actual)}${fund.target !== null ? ` of ${money(fund.target)} (${pctText(p)}%)` : ""}`,
      );
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    setText(INK);
    const bl = doc.splitTextToSize(bits.join("   |   "), CONTENT_W);
    doc.text(bl, ML, y);
    y += bl.length * 11 + 8;

    const below = provinces.filter((p) => {
      const x = m(p, "paid");
      return x && x.target !== null && x.actual < x.target;
    });
    const sentence =
      (below.length
        ? `${below.length} province${below.length === 1 ? "" : "s"} below the beneficiary target: ${below.map((p) => p.scope).join(", ")}.`
        : "All provinces have met their beneficiary target.") +
      " Placement figures above pledged commonly reflect multiple placement batches per LGU across the year (see Data quality).";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    setText(INK_SOFT);
    setFill(GOLD);
    const sl = doc.splitTextToSize(sentence, CONTENT_W - 12);
    doc.rect(ML, y - 8, 3, sl.length * 10 + 6, "F");
    doc.text(sl, ML + 10, y);
    y += sl.length * 10 + 16;
  }

  // ---------- provincial performance ----------
  sectionHeading("Provincial performance", "Beneficiaries & fund utilisation, by province");
  const provRows = [...provinces, ...(region ? [region] : [])].map((e) => {
    const paid = m(e, "paid");
    const fund = m(e, "fund");
    const bp = paid ? ratio(paid.actual, paid.target) : null;
    const fp = fund ? ratio(fund.actual, fund.target) : null;
    return {
      scope: e.scope,
      target: paid?.target != null ? grp(paid.target) : "-",
      paid: paid ? grp(paid.actual) : "-",
      bpct: bp === null ? "-" : pctText(bp),
      alloc: fund?.target != null ? money(fund.target) : "-",
      disb: fund ? money(fund.actual) : "-",
      fpct: fp === null ? "-" : pctText(fp),
    };
  });
  autoTable(doc, {
    ...tableTone((k) => k === "bpct" || k === "fpct"),
    columns: [
      { header: "Province", dataKey: "scope" },
      { header: "Target", dataKey: "target" },
      { header: "Paid", dataKey: "paid" },
      { header: "%", dataKey: "bpct" },
      { header: "Allocation", dataKey: "alloc" },
      { header: "Disbursed", dataKey: "disb" },
      { header: "%", dataKey: "fpct" },
    ],
    body: provRows,
    columnStyles: {
      scope: { halign: "left" },
      target: { halign: "right" },
      paid: { halign: "right" },
      bpct: { halign: "right" },
      alloc: { halign: "right" },
      disb: { halign: "right" },
      fpct: { halign: "right" },
    },
  });
  advanceAfterTable();

  // ---------- pledge -> placement ----------
  if (provinces.some((p) => m(p, "pledged") || m(p, "placed"))) {
    sectionHeading("Pledge to placement", "Slots pledged vs. students placed");
    const rows = [...provinces, ...(region ? [region] : [])].map((e) => {
      const pl = m(e, "pledged")?.actual ?? 0;
      const su = m(e, "supplemental")?.actual ?? 0;
      const pc = m(e, "placed")?.actual ?? 0;
      const d = pc - (pl + su);
      return {
        scope: e.scope,
        pledged: grp(pl),
        suppl: grp(su),
        total: grp(pl + su),
        placed: grp(pc),
        delta: (d > 0 ? "+" : d < 0 ? "-" : "") + grp(Math.abs(d)),
      };
    });
    autoTable(doc, {
      ...tableTone(() => false),
      columns: [
        { header: "Province", dataKey: "scope" },
        { header: "Pledged", dataKey: "pledged" },
        { header: "Supplemental", dataKey: "suppl" },
        { header: "Total pledged", dataKey: "total" },
        { header: "Placed", dataKey: "placed" },
        { header: "Change vs. pledged", dataKey: "delta" },
      ],
      body: rows,
      columnStyles: { scope: { halign: "left" } },
    });
    advanceAfterTable();
  }

  // ---------- quarterly ----------
  if (input.quarterly && Object.keys(input.quarterly).length) {
    sectionHeading("Quarterly disbursement", "Beneficiaries paid & amount disbursed, by quarter");
    const q = input.quarterly;
    const rows: any[] = [];
    const regByQ: Record<string, { b: number; f: number }> = {};
    for (const scope of Object.keys(q)) {
      for (const row of q[scope]) {
        regByQ[row.quarter] ??= { b: 0, f: 0 };
        regByQ[row.quarter].b += row.beneficiaries;
        regByQ[row.quarter].f += row.fund;
        rows.push({
          scope,
          quarter: row.quarter,
          benef: grp(row.beneficiaries),
          disb: money(row.fund),
        });
      }
    }
    for (const qq of Object.keys(regByQ).sort()) {
      rows.push({
        scope: "MIMAROPA Region",
        quarter: qq,
        benef: grp(regByQ[qq].b),
        disb: money(regByQ[qq].f),
      });
    }
    autoTable(doc, {
      ...tableTone(() => false),
      columns: [
        { header: "Province", dataKey: "scope" },
        { header: "Quarter", dataKey: "quarter" },
        { header: "Beneficiaries", dataKey: "benef" },
        { header: "Disbursed", dataKey: "disb" },
      ],
      body: rows,
      columnStyles: { scope: { halign: "left" }, quarter: { halign: "left" } },
    });
    advanceAfterTable();
  }

  // ---------- fund reallocation ----------
  if (input.unutilizedFunds && input.unutilizedFunds.length) {
    sectionHeading("Fund reallocation", "Takers of unutilised SPES funds");
    let ts = 0;
    let tr = 0;
    let rc = 0;
    const rows = input.unutilizedFunds.map((u) => {
      const s = u.startingBalance;
      const r = u.remainingBalance;
      if (typeof s === "number") ts += s;
      let util = "not recorded";
      if (typeof s === "number" && typeof r === "number" && s > 0) {
        tr += r;
        rc++;
        util = (((s - r) / s) * 100).toFixed(1) + "%";
      }
      return {
        lgu: u.lgu,
        start: typeof s === "number" ? money(s) : "-",
        remain: typeof r === "number" ? money(r) : "-",
        util,
      };
    });
    rows.push({
      lgu: "Total",
      start: money(ts),
      remain: `${money(tr)}  (${rc} of ${input.unutilizedFunds.length} recorded)`,
      util: "",
      scope: "Total",
    } as any);
    autoTable(doc, {
      ...tableTone(() => false),
      columns: [
        { header: "LGU / entity", dataKey: "lgu" },
        { header: "Starting balance", dataKey: "start" },
        { header: "Remaining balance", dataKey: "remain" },
        { header: "Utilised", dataKey: "util" },
      ],
      body: rows,
      columnStyles: { lgu: { halign: "left" } },
    });
    advanceAfterTable();
  }

  // ---------- data quality flags ----------
  {
    const exceed: string[] = [];
    const gaps: string[] = [];
    for (const p of provinces) {
      for (const n of p.extraNotes ?? []) {
        const s = n.toLowerCase();
        if (s.includes("significantly exceeds target")) {
          const placed = m(p, "placed")?.actual;
          const target = m(p, "placed")?.target;
          exceed.push(
            `${p.scope}: ${placed != null ? grp(placed) : "?"} placed vs. ${target != null ? grp(target) : "?"} target`,
          );
        }
        if (s.includes("additional fund needed") && !/PHP\s*0\b|₱0\b/.test(n)) {
          gaps.push(
            `${p.scope}: ${clean(n.replace(/^Additional fund needed[^:]*:\s*/i, ""))}`,
          );
        }
      }
    }
    if (exceed.length || gaps.length) {
      sectionHeading("Data quality", "Flags for review before transmittal");
      const box = (title: string, lines: string[], accent: RGB) => {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const wrapped: string[] = [];
        lines.forEach((l) =>
          doc
            .splitTextToSize("- " + l, CONTENT_W - 24)
            .forEach((w: string) => wrapped.push(w)),
        );
        const boxH = 16 + wrapped.length * 10 + 8;
        ensure(boxH + 6);
        setFill([accent[0], accent[1], accent[2]]);
        doc.rect(ML, y, 3, boxH, "F");
        setDraw(RULE);
        doc.rect(ML + 3, y, CONTENT_W - 3, boxH, "S");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        setText(accent);
        doc.text(title.toUpperCase(), ML + 12, y + 12);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        setText(INK_SOFT);
        doc.text(wrapped, ML + 12, y + 24);
        y += boxH + 10;
      };
      if (exceed.length)
        box(
          "Placement counts exceed target",
          [
            ...exceed,
            "Most likely multiple placement batches logged for the same LGU across the year rather than a data error - spot-check the source where the gap is large.",
          ],
          RED,
        );
      if (gaps.length)
        box("Fund gap to beneficiary target", gaps, BLUE);
    }
  }

  // ---------- notes & observations ----------
  {
    const rows: any[] = [];
    for (const p of provinces) {
      if (p.note) rows.push({ scope: p.scope, cat: "Caveat", detail: clean(p.note) });
      for (const n of p.extraNotes ?? []) {
        const cat = noteCategory(n);
        if (cat === "Data quality" || cat === "Fund gap") continue;
        rows.push({ scope: p.scope, cat, detail: clean(n) });
      }
    }
    if (rows.length) {
      sectionHeading("Notes & observations", "Program indicators recorded in the source file");
      autoTable(doc, {
        ...tableTone(() => false),
        columns: [
          { header: "Province", dataKey: "scope" },
          { header: "Category", dataKey: "cat" },
          { header: "Detail", dataKey: "detail" },
        ],
        body: rows,
        columnStyles: {
          scope: { halign: "left", cellWidth: 90 },
          cat: { halign: "left", cellWidth: 74 },
          detail: { halign: "left" },
        },
      });
      advanceAfterTable();
    }
  }

  // ---------- hiring rates ----------
  if (input.lguRates && Object.keys(input.lguRates).length) {
    sectionHeading("Appendix", "Municipality-level hiring rates");
    const rows = Object.keys(input.lguRates)
      .sort()
      .map((prov) => {
        const arr = input.lguRates![prov];
        const rates = arr.map((r) => r.rate);
        const lo = Math.min(...rates);
        const hi = Math.max(...rates);
        return {
          scope: prov,
          n: grp(arr.length),
          range: lo === hi ? money(lo) : `${money(lo)} - ${money(hi)}`,
        };
      });
    autoTable(doc, {
      ...tableTone(() => false),
      columns: [
        { header: "Province", dataKey: "scope" },
        { header: "Municipalities", dataKey: "n" },
        { header: "Daily-rate range", dataKey: "range" },
      ],
      body: rows,
      columnStyles: { scope: { halign: "left" } },
    });
    advanceAfterTable(12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    setText(INK_FAINT);
    doc.text(
      "Full municipality-by-municipality breakdown is in the accompanying Excel workbook.",
      ML,
      y,
    );
    y += 16;
  }

  // ---------- methodology ----------
  sectionHeading("Notes", "Sources & methodology");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  setText(INK_FAINT);
  const method = doc.splitTextToSize(
    `Source: ${input.sourceFileName}. Targets are taken from the Distribution of Target sheet. Beneficiaries paid and amount disbursed are summed from the Payment sheet. Pledged, supplemental and placed figures are the sum of all rows per province in their respective sheets. Quarterly figures are split by the payment "Date Received from FO". Fund-gap estimates use each province's Provincial-Government daily hiring rate over a 20-day assumption.`,
    CONTENT_W,
  );
  ensure(method.length * 10 + 10);
  doc.text(method, ML, y);
  y += method.length * 10;

  // ---------- footer on every page ----------
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setDraw(RULE);
    doc.setLineWidth(0.4);
    doc.line(ML, 812, PAGE_W - MR, 812);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    setText(INK_FAINT);
    doc.text(
      "System-generated by TSSD DMS. Reflects the source file as submitted; not validated against official DOLE records. Not an official issuance of the Department; review before external transmittal.",
      ML,
      822,
      { maxWidth: CONTENT_W - 60 },
    );
    doc.text(`Page ${i} of ${pageCount}`, PAGE_W - MR, 822, { align: "right" });
  }

  return doc;
}

// A blob URL for showing the exact PDF in an <iframe>. The browser's built-in
// PDF viewer provides its own Download and Print controls; the PDF's /Title
// metadata (set in buildReportPdf) gives the download a clean filename.
export async function reportPdfPreviewUrl(input: ReportInput): Promise<string> {
  const doc = await buildReportPdf(input);
  return doc.output("bloburl").toString();
}

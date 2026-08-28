import ExcelJS from "exceljs";
import doleLogo from "../../assets/DOLE LOGO.jpg?inline";
import {
  type ReportInput,
  AGG,
  metricOf,
  splitScopes,
  noteCategory,
  collectDataQuality,
  quarterlyRows,
  fundTotals,
  reportBaseName,
} from "./reportShared";

export { exportSheetNames } from "./reportShared";
export type { ReportInput } from "./reportShared";

// --- palette (DOLE, ARGB) ------------------------------------------------
const BLUE = "FF1E419B";
const BLUE_DEEP = "FF142C68";
const RED = "FFCE2029";
const GOLD = "FFFAD115";
const GOLD_INK = "FF8A6C07";
const INK = "FF101223";
const INK_SOFT = "FF4B4F63";
const INK_FAINT = "FF8B8FA4";
const BAND = "FFF2F1F6";
const RULE = "FFD8DAE2";
const GOOD = "FF1C7A4F";
const WARN = "FFB0791F";
const TOTAL_BG = "FFF3F6FB";

const MONEY = '"₱"#,##0.00';
const INTFMT = "#,##0";
const PCT = "0.0%";

type Ws = ExcelJS.Worksheet;

function solid(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}
function thin(argb = RULE): Partial<ExcelJS.Borders> {
  const b = { style: "thin" as const, color: { argb } };
  return { top: b, left: b, bottom: b, right: b };
}
function toneFor(pct: number | null): string {
  if (pct === null) return INK_FAINT;
  if (pct >= 0.95) return GOOD;
  if (pct >= 0.6) return WARN;
  return RED;
}

// crop the "DEPARTMENT OF LABOR AND EMPLOYMENT" wordmark row off the JPG
async function emblem(): Promise<string> {
  const img = new Image();
  img.src = doleLogo;
  await img.decode();
  const h = Math.round(img.naturalHeight * 0.76);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, h);
  ctx.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.92).split(",")[1];
}

function sectionBar(ws: Ws, row: number, text: string, span = 7) {
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text.toUpperCase();
  c.fill = solid(BLUE);
  c.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(row).height = 17;
}

function headerRow(
  ws: Ws,
  row: number,
  labels: string[],
  aligns: ("left" | "right" | "center")[],
) {
  labels.forEach((label, i) => {
    const c = ws.getCell(row, i + 1);
    c.value = label;
    c.fill = solid(BAND);
    c.font = { name: "Calibri", size: 9, bold: true, color: { argb: INK_SOFT } };
    c.alignment = { vertical: "middle", horizontal: aligns[i] ?? "left" };
    c.border = { bottom: { style: "medium", color: { argb: BLUE } } };
  });
}

function textBlock(
  ws: Ws,
  row: number,
  text: string,
  opts: { span?: number; bold?: boolean; color?: string; size?: number; height?: number } = {},
) {
  const span = opts.span ?? 7;
  ws.mergeCells(row, 1, row, span);
  const c = ws.getCell(row, 1);
  c.value = text;
  c.font = {
    name: "Calibri",
    size: opts.size ?? 9,
    bold: opts.bold ?? false,
    color: { argb: opts.color ?? INK_SOFT },
  };
  c.alignment = { vertical: "top", horizontal: "left", wrapText: true };
  if (opts.height) ws.getRow(row).height = opts.height;
}

// ---------------------------------------------------------------------------

export async function exportPeriodToExcel(input: ReportInput): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "TSSD DMS";
  wb.created = new Date();

  const { region, provinces } = splitScopes(input.entries);
  const generated = new Date().toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const emblemB64 = await emblem().catch(() => null);

  buildSummary(wb, input, region, provinces, generated, emblemB64);
  if (input.quarterly && Object.keys(input.quarterly).length)
    buildQuarterly(wb, input);
  if (input.unutilizedFunds && input.unutilizedFunds.length)
    buildFunds(wb, input);
  buildIndicators(wb, provinces);
  if (input.lguRates && Object.keys(input.lguRates).length)
    buildHiringRates(wb, input);

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportBaseName(input) + ".xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------

function buildSummary(
  wb: ExcelJS.Workbook,
  input: ReportInput,
  region: ReturnType<typeof splitScopes>["region"],
  provinces: ReturnType<typeof splitScopes>["provinces"],
  generated: string,
  emblemB64: string | null,
) {
  const ws = wb.addWorksheet("Summary", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 26 },
    { width: 14 },
    { width: 14 },
    { width: 9 },
    { width: 18 },
    { width: 18 },
    { width: 9 },
  ];

  // tricolour rule
  ws.mergeCells("A1:C1");
  ws.mergeCells("E1:G1");
  ws.getCell("A1").fill = solid(BLUE);
  ws.getCell("D1").fill = solid(GOLD);
  ws.getCell("E1").fill = solid(RED);
  ws.getRow(1).height = 5;

  // masthead
  if (emblemB64) {
    const id = wb.addImage({ base64: emblemB64, extension: "jpeg" });
    ws.addImage(id, { tl: { col: 0.15, row: 1.7 }, ext: { width: 52, height: 50 } });
  }
  ws.getCell("B3").value = "REPUBLIC OF THE PHILIPPINES";
  ws.getCell("B3").font = { name: "Calibri", size: 8, bold: true, color: { argb: GOLD_INK } };
  ws.getCell("B4").value = "Department of Labor and Employment — MIMAROPA Region";
  ws.getCell("B4").font = { name: "Calibri", size: 12, bold: true, color: { argb: BLUE_DEEP } };
  ws.getCell("B5").value = "Technical Services and Support Division (TSSD)";
  ws.getCell("B5").font = { name: "Calibri", size: 9, color: { argb: INK_SOFT } };
  [
    ["E3", `Generated ${generated}`],
    ["E4", `Prepared by ${input.preparedBy}`],
    ["E5", `Source: ${input.sourceFileName}`],
  ].forEach(([addr, val]) => {
    ws.mergeCells(`${addr}:G${addr[1]}`);
    const c = ws.getCell(addr);
    c.value = val;
    c.font = { name: "Calibri", size: 8, color: { argb: INK_SOFT } };
    c.alignment = { horizontal: "right" };
  });
  ws.mergeCells("A6:G6");
  ws.getCell("A6").border = { bottom: { style: "medium", color: { argb: BLUE } } };

  // title
  ws.getCell("A8").value = "OO1 MONITORING";
  ws.getCell("A8").font = { name: "Calibri", size: 8, bold: true, color: { argb: INK_FAINT } };
  ws.mergeCells("A9:G9");
  const t = ws.getCell("A9");
  t.value = `${input.programFullName} — ${input.periodLabel} Monitoring Report`;
  t.font = { name: "Calibri", size: 15, bold: true, color: { argb: BLUE_DEEP } };
  t.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(9).height = 40;
  textBlock(
    ws,
    10,
    "Target vs. actual by province, as of the uploaded logsheet. Figures are system-derived and pending validation against official records.",
    { size: 9, height: 26 },
  );

  let r = 12;

  // regional summary sentence
  sectionBar(ws, r, "At a glance — MIMAROPA Region");
  r += 1;
  if (region) {
    const paid = metricOf(region, "paid");
    const fund = metricOf(region, "fund");
    const bp = paid && paid.target ? paid.actual / paid.target : null;
    const fp = fund && fund.target ? fund.actual / fund.target : null;
    const below = provinces.filter((p) => {
      const x = metricOf(p, "paid");
      return x && x.target !== null && x.actual < x.target;
    });
    const line =
      `Beneficiaries paid: ${paid ? paid.actual.toLocaleString() : "-"}` +
      (bp !== null ? ` of ${paid!.target!.toLocaleString()} (${(bp * 100).toFixed(1)}%).` : ".") +
      `  Fund disbursed: ${fund ? "₱" + fund.actual.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}` +
      (fp !== null ? ` of ₱${fund!.target!.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${(fp * 100).toFixed(1)}%).` : ".") +
      (below.length
        ? `  ${below.length} province${below.length === 1 ? "" : "s"} below the beneficiary target: ${below.map((p) => p.scope).join(", ")}.`
        : "  All provinces have met their beneficiary target.");
    textBlock(ws, r, line, { size: 9, color: INK, height: 42 });
    r += 2;
  }

  // provincial performance
  sectionBar(ws, r, "Provincial performance — beneficiaries & fund utilisation");
  r += 1;
  headerRow(
    ws,
    r,
    ["Province", "Target", "Paid", "%", "Allocation", "Disbursed", "%"],
    ["left", "right", "right", "right", "right", "right", "right"],
  );
  r += 1;
  const provPerfStart = r;
  [...provinces, ...(region ? [region] : [])].forEach((e) => {
    const paid = metricOf(e, "paid");
    const fund = metricOf(e, "fund");
    const isTotal = AGG.test(e.scope);
    const bp = paid && paid.target ? paid.actual / paid.target : null;
    const fp = fund && fund.target ? fund.actual / fund.target : null;
    const row = ws.getRow(r);
    row.getCell(1).value = e.scope;
    row.getCell(2).value = paid?.target ?? "-";
    row.getCell(3).value = paid?.actual ?? "-";
    row.getCell(4).value = bp;
    row.getCell(5).value = fund?.target ?? "-";
    row.getCell(6).value = fund?.actual ?? "-";
    row.getCell(7).value = fp;
    row.eachCell((c, col) => {
      c.border = thin();
      c.font = {
        name: "Calibri",
        size: 9.5,
        bold: isTotal,
        color: { argb: INK },
      };
      c.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
      if (isTotal) c.fill = solid(TOTAL_BG);
      if (col === 2 || col === 3) c.numFmt = INTFMT;
      if (col === 5 || col === 6) c.numFmt = MONEY;
      if (col === 4 || col === 7) {
        c.numFmt = PCT;
        const v = col === 4 ? bp : fp;
        c.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: toneFor(v) } };
      }
    });
    r += 1;
  });
  ws.getRow(provPerfStart + provinces.length).eachCell((c) => {
    c.border = { ...c.border, top: { style: "medium", color: { argb: "FFB7BFC7" } } };
  });
  r += 1;

  // pledge -> placement
  if (provinces.some((p) => metricOf(p, "pledged") || metricOf(p, "placed"))) {
    sectionBar(ws, r, "Pledge to placement");
    r += 1;
    headerRow(
      ws,
      r,
      ["Province", "Pledged", "Supplemental", "Total pledged", "Placed", "Change vs. pledged", ""],
      ["left", "right", "right", "right", "right", "right", "left"],
    );
    r += 1;
    const start = r;
    [...provinces, ...(region ? [region] : [])].forEach((e) => {
      const pl = metricOf(e, "pledged")?.actual ?? 0;
      const su = metricOf(e, "supplemental")?.actual ?? 0;
      const pc = metricOf(e, "placed")?.actual ?? 0;
      const isTotal = AGG.test(e.scope);
      const row = ws.getRow(r);
      row.getCell(1).value = e.scope;
      row.getCell(2).value = pl;
      row.getCell(3).value = su;
      row.getCell(4).value = pl + su;
      row.getCell(5).value = pc;
      row.getCell(6).value = pc - (pl + su);
      for (let col = 1; col <= 6; col++) {
        const c = row.getCell(col);
        c.border = thin();
        c.font = { name: "Calibri", size: 9.5, bold: isTotal, color: { argb: INK } };
        c.alignment = { horizontal: col === 1 ? "left" : "right", vertical: "middle" };
        if (isTotal) c.fill = solid(TOTAL_BG);
        if (col >= 2) c.numFmt = "+#,##0;-#,##0;0";
        if (col < 6) c.numFmt = INTFMT;
      }
      r += 1;
    });
    ws.getRow(start + provinces.length).eachCell((c) => {
      c.border = { ...c.border, top: { style: "medium", color: { argb: "FFB7BFC7" } } };
    });
    r += 1;
  }

  // data quality flags
  const dq = collectDataQuality(provinces);
  if (dq.exceed.length || dq.gaps.length) {
    sectionBar(ws, r, "Data quality — flags for review before transmittal");
    r += 1;
    if (dq.exceed.length) {
      textBlock(
        ws,
        r,
        "Placement counts exceed target: " +
          dq.exceed
            .map(
              (x) =>
                `${x.scope} ${x.placed?.toLocaleString() ?? "?"} placed vs. ${x.target?.toLocaleString() ?? "?"} target`,
            )
            .join(" · ") +
          ". Most likely multiple placement batches logged for the same LGU across the year rather than a data error.",
        { size: 9, color: RED, height: 40 },
      );
      r += 2;
    }
    for (const g of dq.gaps) {
      textBlock(ws, r, `Fund gap — ${g.scope}: ${g.text}`, {
        size: 9,
        color: BLUE_DEEP,
        height: 26,
      });
      r += 1;
    }
    r += 1;
  }

  // methodology
  sectionBar(ws, r, "Sources & methodology");
  r += 1;
  textBlock(
    ws,
    r,
    `Source: ${input.sourceFileName}. Targets are taken from the Distribution of Target sheet. Beneficiaries paid and amount disbursed are summed from the Payment sheet. Pledged, supplemental and placed figures are the sum of all rows per province in their respective sheets. Quarterly figures are split by the payment "Date Received from FO". Fund-gap estimates use each province's Provincial-Government daily hiring rate over a 20-day assumption.`,
    { size: 8, color: INK_FAINT, height: 70 },
  );
  r += 2;
  textBlock(
    ws,
    r,
    "System-generated by TSSD DMS. Reflects the source file as submitted; not validated against official DOLE records. Not an official issuance of the Department; review before external transmittal.",
    { size: 7.5, color: INK_FAINT, height: 26 },
  );

  ws.views = [{ state: "frozen", ySplit: 11, showGridLines: false }];
}

function styledTable(
  ws: Ws,
  headers: string[],
  aligns: ("left" | "right")[],
  rows: (string | number)[][],
  formats: (string | null)[],
  totalRowLabels: string[] = [],
) {
  headerRow(ws, 1, headers, aligns);
  rows.forEach((vals, ri) => {
    const rownum = ri + 2;
    const row = ws.getRow(rownum);
    const isTotal = totalRowLabels.includes(String(vals[0]));
    vals.forEach((v, ci) => {
      const c = row.getCell(ci + 1);
      c.value = v;
      c.border = thin();
      c.font = { name: "Calibri", size: 9.5, bold: isTotal, color: { argb: INK } };
      c.alignment = { horizontal: aligns[ci] ?? "left", vertical: "middle" };
      if (isTotal) c.fill = solid(TOTAL_BG);
      if (formats[ci]) c.numFmt = formats[ci]!;
    });
  });
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
}

function buildQuarterly(wb: ExcelJS.Workbook, input: ReportInput) {
  const ws = wb.addWorksheet("Quarterly", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 24 }, { width: 12 }, { width: 16 }, { width: 20 }];
  const { rows, regionByQuarter } = quarterlyRows(input.quarterly!);
  const body = [
    ...rows.map((q) => [q.scope, q.quarter, q.beneficiaries, q.fund]),
    ...regionByQuarter.map((q) => [q.scope, q.quarter, q.beneficiaries, q.fund]),
  ];
  styledTable(
    ws,
    ["Province", "Quarter", "Beneficiaries", "Disbursed"],
    ["left", "left", "right", "right"],
    body,
    [null, null, INTFMT, MONEY],
    ["MIMAROPA Region"],
  );
}

function buildFunds(wb: ExcelJS.Workbook, input: ReportInput) {
  const ws = wb.addWorksheet("Fund Reallocation", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 20 }, { width: 12 }];
  const funds = input.unutilizedFunds!;
  const t = fundTotals(funds);
  const body: (string | number)[][] = funds.map((u) => {
    const util =
      typeof u.startingBalance === "number" &&
      typeof u.remainingBalance === "number" &&
      u.startingBalance > 0
        ? (u.startingBalance - u.remainingBalance) / u.startingBalance
        : "";
    return [
      u.lgu,
      typeof u.startingBalance === "number" ? u.startingBalance : "-",
      typeof u.remainingBalance === "number" ? u.remainingBalance : "not recorded",
      util,
    ];
  });
  body.push([
    "Total",
    t.totalStart,
    t.totalRemaining,
    `${t.recordedCount} of ${funds.length} recorded`,
  ]);
  styledTable(
    ws,
    ["LGU / entity", "Starting balance", "Remaining balance", "Utilised"],
    ["left", "right", "right", "right"],
    body,
    [null, MONEY, MONEY, PCT],
    ["Total"],
  );
}

function buildIndicators(
  wb: ExcelJS.Workbook,
  provinces: ReturnType<typeof splitScopes>["provinces"],
) {
  const rows: (string | number)[][] = [];
  for (const p of provinces) {
    if (p.note) rows.push([p.scope, "Caveat", p.note]);
    for (const n of p.extraNotes ?? []) {
      const cat = noteCategory(n);
      if (cat === "Data quality" || cat === "Fund gap") continue;
      rows.push([p.scope, cat, n]);
    }
  }
  if (!rows.length) return;
  const ws = wb.addWorksheet("Program Indicators", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 20 }, { width: 18 }, { width: 96 }];
  headerRow(ws, 1, ["Province", "Category", "Detail"], ["left", "left", "left"]);
  rows.forEach((vals, ri) => {
    const row = ws.getRow(ri + 2);
    vals.forEach((v, ci) => {
      const c = row.getCell(ci + 1);
      c.value = v;
      c.border = thin();
      c.font = { name: "Calibri", size: 9.5, color: { argb: INK } };
      c.alignment = { horizontal: "left", vertical: "top", wrapText: ci === 2 };
    });
  });
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
}

function buildHiringRates(wb: ExcelJS.Workbook, input: ReportInput) {
  const ws = wb.addWorksheet("Hiring Rates", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 22 }, { width: 34 }, { width: 16 }];
  const body: (string | number)[][] = [];
  for (const scope of Object.keys(input.lguRates!).sort()) {
    for (const r of input.lguRates![scope]) body.push([scope, r.lgu, r.rate]);
  }
  styledTable(
    ws,
    ["Province", "LGU / Municipality", "Daily rate"],
    ["left", "left", "right"],
    body,
    [null, null, MONEY],
  );
}

// Private-only add-on. The build copies the public page and loads this file into it.
// After the public page draws its numbers, it calls window.__afterRender(data, results);
// this then fetches /api/sxf (login-protected) and adds the SXF-based TSX estimate.
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const sign = (n) => (n >= 0 ? "+" : "−");
  const dateLabel = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const monthLabel = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  function etNow() {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" }).formatToParts(new Date());
    const o = {}; p.forEach((x) => (o[x.type] = x.value));
    return { wd: o.weekday, mins: (+o.hour % 24) * 60 + +o.minute };
  }
  function sizeWord(a) {
    if (a < 0.1) return "barely any change";
    if (a < 0.3) return "a small move";
    if (a < 1) return "a moderate move, about the size of a typical trading day";
    if (a < 2) return "a large move, bigger than most days";
    return "a very large move";
  }

  function ensureCard() {
    if ($("card-sxf")) return;
    const box = $("ca-cards"); if (!box) return;
    box.style.gap = "16px";
    const el = document.createElement("article");
    el.className = "card"; el.id = "card-sxf";
    el.innerHTML = `
      <h3>S&amp;P/TSX Composite<span>uses SXF futures</span></h3>
      <div><div class="label" id="sxf-lab">Implied open</div><div class="big" id="sxf-open">—</div></div>
      <div class="pill" id="sxf-chg">—</div>
      <p id="sxf-plain">Loading Montreal Exchange prices…</p>
      <div class="note" id="sxf-note" hidden></div>
      <dl id="sxf-dl">
        <dt id="sxf-cl">Last close</dt><dd id="sxf-close">—</dd>
        <dt id="sxf-sl">SXF settlement</dt><dd id="sxf-settle">—</dd>
        <dt id="sxf-nl">SXF now</dt><dd id="sxf-now">—</dd>
      </dl>`;
    box.insertBefore(el, box.firstChild);
  }

  function blank(msg) {
    $("sxf-open").textContent = "—"; $("sxf-chg").className = "pill"; $("sxf-chg").textContent = "—";
    $("sxf-plain").textContent = msg;
  }

  function rewriteMethod() {
    document.querySelectorAll(".method p").forEach((p) => {
      const s = p.querySelector("strong");
      if (s && s.textContent.trim() === "Canada.") {
        p.innerHTML = `<strong>Canada (private version).</strong> The main TSX estimate uses S&amp;P/TSX 60 index futures (SXF) from the Montreal Exchange, read in real time from its public quotes page. It takes how far the front-month SXF contract has moved since its last daily settlement and applies that percentage to the S&amp;P/TSX Composite's last close. The TSX 60 is the 60 largest Canadian companies, which make up most of the Composite's value, so the two usually move closely together but not identically. The "now" price is the midpoint of the current bid and ask when the gap between them is tight, otherwise the last trade. The SXF estimate is hidden from 4 to 8 p.m. Eastern on weekdays, between SXF's close and its next session, when the settlement and the index close can be from different days. The S&amp;P 500 futures stand-in from the public page is kept below it for comparison. Oil, natural gas, gold and the Canadian dollar come from Yahoo Finance; the 10-year yield from the Bank of Canada. Montreal Exchange data on this page is for personal use only and must not be shared.`;
      }
    });
  }

  async function afterRender(j, results) {
    ensureCard(); rewriteMethod();
    const meta = $("meta");
    if (meta && !meta.textContent.includes("Montreal Exchange")) meta.insertAdjacentHTML("beforeend", "<span>SXF: Montreal Exchange (real time)</span>");
    const tsx = results.find((r) => r.k === "tsx");
    const tspan = document.querySelector("#card-tsx h3 span"); if (tspan) tspan.textContent = "uses ES futures";
    const note = $("sxf-note"); note.hidden = true; note.className = "note";
    $("sxf-dl").hidden = false;
    if (!tsx) return blank("The TSX close couldn't be loaded, so there's no SXF estimate.");
    $("sxf-cl").textContent = `Last close (${dateLabel(tsx.closeDate)})`;
    $("sxf-close").textContent = fmt(tsx.close);
    if (tsx.openNow) { $("sxf-dl").hidden = true; return blank("The TSX is open, so its actual open is shown in the card below. The next SXF estimate starts at 8 p.m. Eastern, when SXF's next session begins."); }
    const n = etNow();
    const weekday = !["Sat", "Sun"].includes(n.wd);
    if (weekday && n.mins >= 960 && n.mins < 1200) {
      $("sxf-dl").hidden = true;
      return blank("SXF closes at 4:30 p.m. Eastern and its next session starts at 8 p.m. Until then its settlement and the TSX close can be from different days, so the SXF estimate is paused. The S&P 500 futures stand-in below is still shown.");
    }

    let d;
    try {
      const res = await fetch("api/sxf", { cache: "no-store", credentials: "same-origin" });
      d = await res.json().catch(() => ({ error: "unexpected answer (" + res.status + ")" }));
      if (!res.ok || d.error) throw new Error(d.error || "error " + res.status);
    } catch (e) {
      return blank(`Montreal Exchange prices couldn't be loaded: ${e.message}. Using the S&P 500 stand-in below. It will try again in a minute.`);
    }
    const f = d.front;
    let px = null, how = "";
    if (f.bid > 0 && f.ask > 0 && f.ask >= f.bid && (f.ask - f.bid) / ((f.ask + f.bid) / 2) < 0.005) { px = (f.bid + f.ask) / 2; how = "bid/ask midpoint"; }
    else if (f.last > 0) { px = f.last; how = "last trade"; }
    if (!px || !(f.settlement > 0)) return blank("SXF has no usable price right now (no quotes or trades).");

    const pct = (px / f.settlement - 1) * 100;
    const implied = tsx.close * (1 + pct / 100), pts = implied - tsx.close;
    const dir = Math.abs(pct) < 0.005 ? "flat" : pct > 0 ? "up" : "down";
    $("sxf-lab").textContent = "Implied open";
    $("sxf-open").textContent = fmt(implied);
    $("sxf-chg").className = "pill" + (dir === "flat" ? "" : " " + dir);
    $("sxf-chg").textContent = `${sign(pts)}${fmt(Math.abs(pts), 1)} pts  ${sign(pct)}${fmt(Math.abs(pct), 2)}%`;
    $("sxf-sl").textContent = `SXF settlement (${monthLabel(f.expiry)} contract)`;
    $("sxf-settle").textContent = fmt(f.settlement, 1);
    $("sxf-nl").textContent = `SXF now (${how})`;
    $("sxf-now").textContent = fmt(px, 2);
    const cmp = `${sign(tsx.pct)}${fmt(Math.abs(tsx.pct), 2)}%`;
    $("sxf-plain").textContent = dir === "flat"
      ? `TSX 60 futures are about where they settled, so the TSX is expected to open roughly unchanged. For comparison, the S&P 500 stand-in below says ${cmp}.`
      : `TSX 60 futures are ${fmt(Math.abs(px - f.settlement), 1)} points (${fmt(Math.abs(pct), 2)}%) ${dir === "up" ? "above" : "below"} their last settlement. Applied to the Composite, that points to an open about ${fmt(Math.abs(pct), 2)}% ${dir === "up" ? "higher" : "lower"}, ${sizeWord(Math.abs(pct))}. For comparison, the S&P 500 stand-in below says ${cmp}.`;
    const trading = (n.wd !== "Fri" && n.wd !== "Sat" && n.mins >= 1200) || (weekday && n.mins < 990);
    if (!trading) { note.hidden = false; note.className = "note warn"; note.textContent = "SXF isn't trading right now (weekend or overnight break), so these are its last prices."; }
    else if (!f.trades && !f.volume) { note.hidden = false; note.textContent = "No SXF trades yet this session, so this uses the current bid and ask."; }

    // The public page's commodity "tail" sentence compares commodities with the S&P 500 stand-in;
    // on this page SXF already reflects them, so swap that sentence.
    const ex = $("ca-explain");
    if (ex) {
      const keep = ex.textContent.split(/(?<=\.)\s+/).filter((s) => !/^(That points the same way|That pulls against|There's no clear commodity signal)/.test(s));
      ex.textContent = keep.join(" ") + ` SXF trades on Canadian stocks directly, so it already reflects moves like these; the S&P 500 stand-in (${cmp}) doesn't.`;
    }
    const tc = $("card-tsx");
    if (tc) {
      const span = tc.querySelector("h3 span"); if (span) span.textContent = "comparison: ES futures";
      $("plain-tsx").textContent = `For comparison only: the public page's estimate, which applies the S&P 500 futures move (${cmp}) to the Composite because it has no Canadian futures data.`;
    }
    const h = $("ca-headline");
    if (h) h.textContent =dir === "flat" ? "TSX 60 futures point to a roughly flat TSX open." : `TSX 60 futures point to a ${dir === "up" ? "higher" : "lower"} TSX open, about ${fmt(Math.abs(pct), 2)}%.`;
  }

  window.__afterRender = (j, results) => { afterRender(j, results).catch((e) => { try { blank("SXF estimate error: " + e.message); } catch {} }); };
})();

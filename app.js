(function () {
  const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONTHS = [
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
  ];

  const COURSE = new Set([
    "Süd", "Süd Alternative",
    "Mitte-Süd", "Mitte-Süd Alternative",
    "Zentral", "Zentral Alternative",
  ]);

  const STYLE = {
    "Süd": { bg: "#2F6DB5", fg: "#FFFFFF", bar: "#2F6DB5" },
    "Süd Alternative": { bg: "#9EC5F2", fg: "#173A63", bar: "#2F6DB5" },
    "Mitte-Süd": { bg: "#9B3FA0", fg: "#FFFFFF", bar: "#9B3FA0" },
    "Mitte-Süd Alternative": { bg: "#EBA9E0", fg: "#561C5B", bar: "#9B3FA0" },
    "Zentral": { bg: "#277A4C", fg: "#FFFFFF", bar: "#277A4C" },
    "Zentral Alternative": { bg: "#9FDCB4", fg: "#174A2E", bar: "#277A4C" },
    "Jugendturnier": { bg: "#F7E3E2", fg: "#9E3F3B", bar: "#B5534F" },
    "DTTB/International": { bg: "#EBEBE8", fg: "#4F5A66", bar: "#5E6B78" },
    "Abwesenheit": { bg: "#F5F5F5", fg: "#5F6670", bar: "#A3A9B1" },
    "Ferien/Feiertag": { bg: "#FAF6EC", fg: "#6B5E3E", bar: "#D9CBA3" },
    "Sonstiges": { bg: "#EEEEEE", fg: "#555555", bar: "#9A9A9A" },
  };

  const LEGEND = [
    ["#2F6DB5", "Süd"],
    ["#9EC5F2", "Süd Alt"],
    ["#9B3FA0", "Mitte-Süd"],
    ["#EBA9E0", "Mitte-Süd Alt"],
    ["#277A4C", "Zentral"],
    ["#9FDCB4", "Zentral Alt"],
    ["#F7E3E2", "Nachwuchswettkampf"],
    ["#EBEBE8", "DTTB / international"],
    ["#F5F5F5", "Abwesend / Landeskader"],
    ["#FAF6EC", "Schulferien"],
  ];

  const cfg = window.SITE_CONFIG || {};
  let events = [];
  let showAll = false;
  const open = {};

  function styleOf(typ) {
    return STYLE[typ] || STYLE["Sonstiges"];
  }
  function isCourse(e) {
    return COURSE.has(e.typ);
  }
  function parseDate(s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (!m) return null;
    return { d: +m[1], mo: +m[2], y: +m[3] };
  }
  function utc(p) {
    return Date.UTC(p.y, p.mo - 1, p.d);
  }
  function dayNo(p) {
    return Math.round(utc(p) / 86400000);
  }
  function fmt(p) {
    const wd = WD[new Date(utc(p)).getUTCDay()];
    const dd = String(p.d).padStart(2, "0");
    const mm = String(p.mo).padStart(2, "0");
    return wd + " " + dd + "." + mm + ".";
  }
  function range(e) {
    return e.bis ? fmt(e.from) + "–" + fmt(e.bis) : fmt(e.from);
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [];
    let field = "";
    let i = 0;
    let q = false;
    const pushField = () => { row.push(field); field = ""; };
    const pushRow = () => { if (row.length) rows.push(row); row = []; };
    while (i < text.length) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === ",") pushField();
      else if (c === "\n") { pushField(); pushRow(); }
      else if (c !== "\r") field += c;
      i++;
    }
    if (field.length || row.length) { pushField(); pushRow(); }
    return rows;
  }

  function rowsToEvents(rows) {
    if (!rows.length) return [];
    const header = rows[0].map((h) => h.trim());
    const idx = (name) => header.indexOf(name);
    const iDatum = idx("Datum");
    const iBis = idx("Bis");
    const iTitel = idx("Titel");
    const iTyp = idx("Typ");
    const iOrt = idx("Ort");
    const iNotiz = idx("Notiz");
    if (iDatum < 0 || iTitel < 0 || iTyp < 0) return [];
    const out = [];
    for (let r = 1; r < rows.length; r++) {
      const line = rows[r];
      if (!line || !line.join("").trim()) continue;
      const from = parseDate(line[iDatum] || "");
      if (!from) continue;
      const titel = (line[iTitel] || "").trim();
      if (!titel) continue;
      const typ = (line[iTyp] || "Sonstiges").trim() || "Sonstiges";
      const bisRaw = iBis >= 0 ? (line[iBis] || "").trim() : "";
      const bis = bisRaw ? parseDate(bisRaw) : null;
      out.push({
        from,
        bis,
        titel,
        typ,
        ort: iOrt >= 0 ? (line[iOrt] || "").trim() : "",
        notiz: iNotiz >= 0 ? (line[iNotiz] || "").trim() : "",
      });
    }
    out.sort((a, b) => {
      const c = utc(a.from) - utc(b.from);
      if (c !== 0) return c;
      if (isCourse(a) && !isCourse(b)) return -1;
      if (!isCourse(a) && isCourse(b)) return 1;
      return 0;
    });
    return out;
  }

  function sheetIdFromUrl(url) {
    const m = String(url).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return m ? m[1] : null;
  }

  function loadGviz(url) {
    const id = sheetIdFromUrl(url);
    if (!id) return Promise.reject(new Error("keine Sheet-ID"));
    const gidMatch = String(url).match(/[?&]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    return new Promise((resolve, reject) => {
      const cb = "sheetCb_" + Date.now();
      const t = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 8000);
      function cleanup() {
        clearTimeout(t);
        delete window[cb];
        if (s.parentNode) s.parentNode.removeChild(s);
      }
      window[cb] = function (data) {
        cleanup();
        try {
          const table = data && data.table;
          if (!table) return reject(new Error("leere Tabelle"));
          const cols = (table.cols || []).map((c) => (c && (c.label || c.id)) || "");
          const rows = [cols];
          (table.rows || []).forEach((r) => {
            rows.push((r.c || []).map((c) => {
              if (!c) return "";
              if (c.f != null && c.f !== "") return String(c.f);
              return c.v == null ? "" : String(c.v);
            }));
          });
          resolve(rows);
        } catch (err) { reject(err); }
      };
      const s = document.createElement("script");
      s.src = "https://docs.google.com/spreadsheets/d/" + id +
        "/gviz/tq?tqx=out:json;responseHandler:" + cb + "&gid=" + gid;
      s.onerror = function () { cleanup(); reject(new Error("gviz fehlgeschlagen")); };
      document.head.appendChild(s);
    });
  }

  async function loadEvents() {
    const fallback = cfg.fallbackCsv || "termine.csv";
    async function fromCsvUrl(url) {
      const u = url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now();
      const res = await fetch(u, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return rowsToEvents(parseCsv(await res.text()));
    }
    if (cfg.sheetCsvUrl) {
      try {
        const ev = await fromCsvUrl(cfg.sheetCsvUrl);
        if (ev.length) return ev;
      } catch (_) {
        try {
          const ev = rowsToEvents(await loadGviz(cfg.sheetCsvUrl));
          if (ev.length) return ev;
        } catch (__) { /* fallback */ }
      }
    }
    return fromCsvUrl(fallback);
  }

  function near(course) {
    const a = dayNo(course.from) - 14;
    const b = dayNo(course.bis || course.from) + 14;
    return events.filter((e) => {
      if (e === course || isCourse(e)) return false;
      const start = dayNo(e.from);
      const end = dayNo(e.bis || e.from);
      return start <= b && end >= a;
    });
  }

  function keyOf(e, i) {
    return fmt(e.from) + "|" + e.titel + "|" + i;
  }

  function contextRow(e) {
    const st = styleOf(e.typ);
    const div = document.createElement("div");
    div.className = "row";
    div.style.background = st.bg;
    div.style.color = st.fg;
    div.innerHTML =
      '<span class="bar" style="background:' + st.bar + '"></span>' +
      '<span class="date"></span>' +
      '<span class="label"></span>';
    div.querySelector(".date").textContent = range(e);
    div.querySelector(".label").textContent = e.titel;
    return div;
  }

  function render() {
    const list = document.getElementById("list");
    list.innerHTML = "";
    const rows = showAll ? events : events.filter(isCourse);
    let lastMonth = "";
    rows.forEach((e, i) => {
      const m = MONTHS[e.from.mo - 1];
      if (m !== lastMonth) {
        const h = document.createElement("div");
        h.className = "month";
        h.textContent = m;
        list.appendChild(h);
        lastMonth = m;
      }
      if (!isCourse(e)) {
        list.appendChild(contextRow(e));
        return;
      }
      const st = styleOf(e.typ);
      const k = keyOf(e, i);
      const isOpen = !!open[k];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "course";
      btn.style.background = st.bg;
      btn.style.color = st.fg;
      btn.style.borderLeftColor = st.bar;
      btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      const noteHtml = e.notiz ? '<span class="note"></span>' : "";
      btn.innerHTML =
        '<span class="chev">' + (isOpen ? "▾" : "▸") + "</span>" +
        '<span class="date"></span>' +
        '<span class="label"></span>' +
        noteHtml;
      btn.querySelector(".date").textContent = range(e);
      btn.querySelector(".label").textContent = e.titel;
      if (e.notiz) btn.querySelector(".note").textContent = e.notiz;
      btn.addEventListener("click", function () {
        open[k] = !open[k];
        render();
      });
      list.appendChild(btn);
      if (isOpen) {
        const panel = document.createElement("div");
        panel.className = "panel";
        panel.style.borderLeftColor = st.bg;
        const nb = near(e);
        if (!nb.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "Nichts ±2 Wochen";
          panel.appendChild(empty);
        } else {
          nb.forEach((n) => panel.appendChild(contextRow(n)));
        }
        list.appendChild(panel);
      }
    });
  }

  function setToggle() {
    document.getElementById("btn-mine").classList.toggle("on", !showAll);
    document.getElementById("btn-all").classList.toggle("on", showAll);
  }

  document.getElementById("legend").innerHTML = LEGEND.map(function (item) {
    return '<span class="leg"><span class="swatch" style="background:' + item[0] + '"></span>' + item[1] + "</span>";
  }).join("");

  document.getElementById("btn-mine").addEventListener("click", function () {
    showAll = false;
    setToggle();
    render();
  });
  document.getElementById("btn-all").addEventListener("click", function () {
    showAll = true;
    setToggle();
    render();
  });

  if (cfg.sheetEditUrl) {
    const a = document.getElementById("add-link");
    a.href = cfg.sheetEditUrl;
    a.hidden = false;
  }

  loadEvents()
    .then(function (ev) {
      events = ev;
      render();
    })
    .catch(function (err) {
      const s = document.getElementById("status");
      s.hidden = false;
      s.textContent = "Termine konnten nicht geladen werden.";
      console.error(err);
    });
})();

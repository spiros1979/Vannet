// apptank2.js — Δεξαμενή 2 (D2) σε λίτρα

const DATA_URL = "https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec?mode=read";

// 🔧 άλλαξε το όπως θες
const TANK2_CAPACITY_LT = 500;

function parseDateString(dateString) {
  if (!dateString) return new Date(NaN);
  const [datePart, timePart] = String(dateString).split(" ");
  const [day, month, year] = datePart.split("/").map(Number);

  let [hours, minutes, seconds] = [0, 0, 0];
  if (timePart) [hours, minutes, seconds] = timePart.split(":").map(Number);

  return new Date(year, (month || 1) - 1, day || 1, hours, minutes, seconds);
}

function getTank2Liters(row) {
  const v = Number(String(row?.D2 ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : NaN;
}

function calcStats(arr) {
  if (!arr.length) return { min: NaN, max: NaN, avg: NaN };
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  return { min, max, avg };
}

function filterDataByTime(data, filter) {
  if (!data.length) return [];
  const lastTS = data[data.length - 1].Data.getTime();
  if (isNaN(lastTS)) return [];

  let windowMs = 0;
  switch (filter) {
    case "last24h": windowMs = 24 * 3600000; break;
    case "last12h": windowMs = 12 * 3600000; break;
    case "last6h":  windowMs =  6 * 3600000; break;
    case "last3h":  windowMs =  3 * 3600000; break;
    case "last1h":  windowMs =  1 * 3600000; break;
    default: return data;
  }

  const fromTS = lastTS - windowMs;
  return data.filter(r => r.Data instanceof Date && !isNaN(r.Data.getTime()) && r.Data.getTime() >= fromTS);
}

function aggregateHourly(data) {
  const grouped = {};
  for (const r of data) {
    if (!(r.Data instanceof Date) || isNaN(r.Data.getTime())) continue;
    if (!Number.isFinite(r.liters)) continue;

    const date = r.Data.toLocaleDateString("el-GR");
    const hour = String(r.Data.getHours()).padStart(2, "0");
    const key = `${date} ${hour}:00`;

    (grouped[key] ||= []).push(r.liters);
  }

  return Object.keys(grouped).map(label => {
    const arr = grouped[label];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { label, mean };
  });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function litersToPercent(liters, capacity) {
  if (!Number.isFinite(liters) || !Number.isFinite(capacity) || capacity <= 0) return NaN;
  return (liters / capacity) * 100;
}

async function loadAndRender() {
  setText("status", "Φόρτωση δεδομένων…");

  const res = await fetch(DATA_URL);
  const raw = await res.json();

  if (!Array.isArray(raw) || raw.length === 0) {
    setText("status", "Δεν βρέθηκαν δεδομένα.");
    return;
  }

  let processed = raw.map(row => ({
    Data: parseDateString(row.Data),
    liters: getTank2Liters(row)
  }));

  processed = processed.filter(r =>
    r.Data instanceof Date && !isNaN(r.Data.getTime()) && Number.isFinite(r.liters)
  );

  if (!processed.length) {
    setText("status", "Δεν υπάρχουν έγκυρες τιμές D2.");
    return;
  }

  const filter = document.getElementById("timeFilter")?.value || "all";
  const filtered = filterDataByTime(processed, filter);

  if (!filtered.length) {
    setText("status", "Δεν υπάρχουν δεδομένα στο επιλεγμένο διάστημα.");
    return;
  }

  const last = filtered[filtered.length - 1];
  const pct = litersToPercent(last.liters, TANK2_CAPACITY_LT);

  setText(
    "latest-level",
    `${last.liters.toFixed(0)} lt (${Number.isFinite(pct) ? pct.toFixed(0) : "--"}%)`
  );

  setText("last-update", `Τελευταία λήψη δεδομένων: ${last.Data.toLocaleString("el-GR", { hour12: false })}`);

  const litersArr = filtered.map(r => r.liters);
  const st = calcStats(litersArr);

  setText("level-min", `Ελάχιστο: ${Number.isFinite(st.min) ? st.min.toFixed(0) : "--"} lt`);
  setText("level-avg", `Μ. όρος: ${Number.isFinite(st.avg) ? st.avg.toFixed(0) : "--"} lt`);
  setText("level-max", `Μέγιστο: ${Number.isFinite(st.max) ? st.max.toFixed(0) : "--"} lt`);

  const labelsMin = filtered.map(r =>
    r.Data.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hour12: false })
  );
  const valuesMin = filtered.map(r => r.liters);

  const hourly = aggregateHourly(filtered);
  const labelsHr = hourly.map(x => x.label);
  const valuesHr = hourly.map(x => x.mean);

  renderCharts(labelsMin, valuesMin, labelsHr, valuesHr);

  setText("status", `Δείγματα: ${filtered.length}`);
}

function renderCharts(labelsMin, valuesMin, labelsHr, valuesHr) {
  const minCanvas = document.getElementById("minutoChart");
  const hrCanvas = document.getElementById("oraChart");
  if (!minCanvas || !hrCanvas) return;

  const minCtx = minCanvas.getContext("2d");
  const hrCtx  = hrCanvas.getContext("2d");

  if (window.minutoChart && typeof window.minutoChart.destroy === "function") window.minutoChart.destroy();
  if (window.oraChart && typeof window.oraChart.destroy === "function") window.oraChart.destroy();

  window.minutoChart = new Chart(minCtx, {
    type: "line",
    data: {
      labels: labelsMin,
      datasets: [{ label: "Στάθμη (lt)", data: valuesMin, borderWidth: 2, tension: 0.1, pointRadius: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: (v, i) => (i % 10 === 0 ? labelsMin[i] : "") } },
        y: { title: { display: true, text: "Στάθμη (lt)" } }
      }
    }
  });

  window.oraChart = new Chart(hrCtx, {
    type: "line",
    data: {
      labels: labelsHr,
      datasets: [{ label: "Μέση στάθμη ανά ώρα (lt)", data: valuesHr, borderWidth: 2, tension: 0.1, pointRadius: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: (v, i) => (i % 2 === 0 ? labelsHr[i] : "") } },
        y: { title: { display: true, text: "Στάθμη (lt)" } }
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("update-data")?.addEventListener("click", (e) => {
    e.preventDefault();
    loadAndRender().catch(err => console.error("Tank2 error:", err));
  });

  document.getElementById("timeFilter")?.addEventListener("change", () => {
    loadAndRender().catch(err => console.error("Tank2 error:", err));
  });

  loadAndRender().catch(err => console.error("Tank2 error:", err));
});

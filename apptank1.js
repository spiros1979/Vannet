// apptank1.js

const DATA_URL = "https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec?mode=read";

function parseDateString(dateString) {
  if (!dateString) return new Date(NaN);
  const [datePart, timePart] = String(dateString).split(" ");
  const [day, month, year] = datePart.split("/").map(Number);

  let [hours, minutes, seconds] = [0, 0, 0];
  if (timePart) [hours, minutes, seconds] = timePart.split(":").map(Number);

  return new Date(year, (month || 1) - 1, day || 1, hours, minutes, seconds);
}

// Πιθανά keys που μπορεί να έχεις στο Apps Script για τη Δεξαμενή 1
function getTank1Value(row) {
  const candidates = [
    "tank1", "tank_1", "tank1_level", "tank1Level", "Tank1",
    "deksameni1", "dexameni1", "reservoir1", "level1"
  ];

  for (const k of candidates) {
    if (row && row[k] != null && row[k] !== "") {
      const v = Number(String(row[k]).replace(",", "."));
      if (!isNaN(v)) return v;
    }
  }
  return NaN;
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
    default: return data; // all
  }

  const fromTS = lastTS - windowMs;
  return data.filter(r => r.Data instanceof Date && !isNaN(r.Data.getTime()) && r.Data.getTime() >= fromTS);
}

function aggregateHourly(data) {
  const grouped = {};

  data.forEach(r => {
    if (!(r.Data instanceof Date) || isNaN(r.Data.getTime())) return;
    if (!Number.isFinite(r.level)) return;

    const date = r.Data.toLocaleDateString("el-GR");
    const hour = String(r.Data.getHours()).padStart(2, "0");
    const key = `${date} ${hour}:00`;

    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r.level);
  });

  return Object.keys(grouped).map(key => {
    const arr = grouped[key];
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return { label: key, mean };
  });
}

async function loadAndRender() {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = "Φόρτωση δεδομένων…";

  const res = await fetch(DATA_URL);
  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    if (statusEl) statusEl.textContent = "Δεν βρέθηκαν δεδομένα.";
    return;
  }

  // Μετατρέπουμε σε {Data: Date, level: number}
  let processed = data.map(row => ({
    Data: parseDateString(row.Data),
    level: getTank1Value(row)
  }));

  processed = processed.filter(r => r.Data instanceof Date && !isNaN(r.Data.getTime()) && Number.isFinite(r.level));

  if (!processed.length) {
    if (statusEl) statusEl.textContent = "Δεν υπάρχουν έγκυρες τιμές δεξαμενής 1 (έλεγξε το όνομα πεδίου στο Apps Script).";
    return;
  }

  const filter = document.getElementById("timeFilter")?.value || "all";
  const filtered = filterDataByTime(processed, filter);

  if (!filtered.length) {
    if (statusEl) statusEl.textContent = "Δεν υπάρχουν δεδομένα στο επιλεγμένο διάστημα.";
    return;
  }

  const last = filtered[filtered.length - 1];
  document.getElementById("latest-level").textContent = `${last.level.toFixed(0)}%`;

  const lastUpdate = last.Data.toLocaleString("el-GR", { hour12: false });
  document.getElementById("last-update").textContent = `Τελευταία λήψη δεδομένων: ${lastUpdate}`;

  // λεπτό-λεπτό
  const labelsMin = filtered.map(r => r.Data.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit", hour12: false }));
  const valuesMin = filtered.map(r => r.level);

  // ωριαίο
  const hourly = aggregateHourly(filtered);
  const labelsHr = hourly.map(x => x.label);
  const valuesHr = hourly.map(x => x.mean);

  renderCharts(labelsMin, valuesMin, labelsHr, valuesHr);

  if (statusEl) statusEl.textContent = `Δείγματα: ${filtered.length}`;
}

function renderCharts(labelsMin, valuesMin, labelsHr, valuesHr) {
  const minCtx = document.getElementById("minutoChart").getContext("2d");
  const hrCtx  = document.getElementById("oraChart").getContext("2d");

  if (window.minutoChart && typeof window.minutoChart.destroy === "function") window.minutoChart.destroy();
  if (window.oraChart && typeof window.oraChart.destroy === "function") window.oraChart.destroy();

  window.minutoChart = new Chart(minCtx, {
    type: "line",
    data: { labels: labelsMin, datasets: [{ label: "Στάθμη (%)", data: valuesMin, borderWidth: 2, tension: 0.1, pointRadius: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: (v, i) => (i % 10 === 0 ? labelsMin[i] : "") } },
        y: { title: { display: true, text: "Στάθμη (%)" }, min: 0, max: 100 }
      }
    }
  });

  window.oraChart = new Chart(hrCtx, {
    type: "line",
    data: { labels: labelsHr, datasets: [{ label: "Μέση στάθμη ανά ώρα (%)", data: valuesHr, borderWidth: 2, tension: 0.1, pointRadius: 0 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { callback: (v, i) => (i % 2 === 0 ? labelsHr[i] : "") } },
        y: { title: { display: true, text: "Στάθμη (%)" }, min: 0, max: 100 }
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("update-data")?.addEventListener("click", (e) => {
    e.preventDefault();
    loadAndRender().catch(err => console.error("Tank1 error:", err));
  });

  document.getElementById("timeFilter")?.addEventListener("change", () => {
    loadAndRender().catch(err => console.error("Tank1 error:", err));
  });

  loadAndRender().catch(err => console.error("Tank1 error:", err));
});

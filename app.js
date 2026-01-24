// app.js – Γραφήματα Θερμοκρασίας (charts.html)

// 1. URL του Google Apps Script (read mode → JSON από το φύλλο)
const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec?mode=read";

// 2. Event listeners για κουμπί refresh & dropdown χρόνου
document.addEventListener("DOMContentLoaded", function () {
  loadDataAndUpdateCharts();

  const updateBtn = document.getElementById("update-data");
  if (updateBtn) {
    updateBtn.addEventListener("click", function (e) {
      e.preventDefault();
      loadDataAndUpdateCharts();
    });
  }

  const timeFilterSelect = document.getElementById("timeFilter");
  if (timeFilterSelect) {
    timeFilterSelect.addEventListener("change", function () {
      loadDataAndUpdateCharts();
    });
  }
});

// 3. Φόρτωμα δεδομένων από Apps Script
function loadDataAndUpdateCharts() {
  fetch(SCRIPT_URL)
    .then((response) => response.json())
    .then((data) => {
      processAndDisplayData(data);
    })
    .catch((error) =>
      console.error("Σφάλμα κατά την ανάκτηση των δεδομένων:", error)
    );
}

// 4. Parse "dd/MM/yyyy HH:mm:ss" → Date
function parseDateString(dateString) {
  if (!dateString) return new Date(NaN);

  const [datePart, timePart] = dateString.split(" ");
  const [day, month, year] = datePart.split("/").map(Number);

  let [hours, minutes, seconds] = [0, 0, 0];
  if (timePart) {
    [hours, minutes, seconds] = timePart.split(":").map(Number);
  }

  return new Date(year, month - 1, day, hours, minutes, seconds);
}

// 5. Επεξεργασία δεδομένων & ενημέρωση UI
function processAndDisplayData(rawData) {
  if (!Array.isArray(rawData) || rawData.length === 0) {
    console.error("Δεν ελήφθησαν δεδομένα ή ο πίνακας είναι κενός.");
    document.getElementById("latest-temp").textContent =
      "Δεν υπάρχουν διαθέσιμα δεδομένα.";
    return;
  }

  // Μετατροπή τιμών σε Number + Date
  const processedData = rawData.map((row) => {
    let temp = row.Temperatura;

    if (typeof temp === "string") {
      temp = Number(temp.toString().replace(",", "."));
    } else if (typeof temp !== "number") {
      console.error("Λάθος πεδίο Temperatura:", row);
      temp = NaN;
    }

    const parsedDate = parseDateString(row.Data);
    if (isNaN(parsedDate.getTime())) {
      console.error("Μη έγκυρη ημερομηνία:", row.Data);
    }

    return {
      ...row,
      Data: parsedDate,
      Temperatura: temp,
    };
  });

  // Κρατάμε ΜΟΝΟ όσες σειρές έχουν:
  // - έγκυρη ημερομηνία
  // - έγκυρη θερμοκρασία (όχι NaN)
  const validData = processedData.filter(
    (row) =>
      row.Data instanceof Date &&
      !isNaN(row.Data.getTime()) &&
      typeof row.Temperatura === "number" &&
      !isNaN(row.Temperatura)
  );

  if (!validData.length) {
    console.error("Καμία έγκυρη εγγραφή με θερμοκρασία.");
    document.getElementById("latest-temp").textContent =
      "Δεν υπάρχουν έγκυρα δεδομένα θερμοκρασίας.";
    return;
  }

  // Φίλτρο χρόνου (24h, 12h κτλ) πάνω στα ΚΑΘΑΡΑ δεδομένα
  const timeFilter = document.getElementById("timeFilter").value;
  const filteredDataMinuto = filterDataByTime(validData, timeFilter);

  if (filteredDataMinuto.length === 0) {
    console.error("Κανένα δεδομένο μετά το φιλτράρισμα.");
    document.getElementById("latest-temp").textContent =
      "Δεν υπάρχουν δεδομένα για το επιλεγμένο διάστημα.";
    return;
  }

  // Τελευταία θερμοκρασία από τα φιλτραρισμένα καθαρά δεδομένα
  const latestRow =
    filteredDataMinuto[filteredDataMinuto.length - 1] ||
    validData[validData.length - 1];
  const latestTemp = latestRow.Temperatura;

  document.getElementById(
    "latest-temp"
  ).textContent = `Τελευταία θερμοκρασία: ${latestTemp.toFixed(2)}°C`;

  // Τελευταία ενημέρωση – 24ωρο format
  if (latestRow.Data instanceof Date && !isNaN(latestRow.Data.getTime())) {
    const formattedDateTime = latestRow.Data.toLocaleString("el-GR", {
      hour12: false,
    });
    document.getElementById(
      "last-update"
    ).textContent = `Τελευταία ενημέρωση: ${formattedDateTime}`;
  } else {
    const now = new Date();
    document.getElementById("last-update").textContent =
      "Τελευταία ενημέρωση: " +
      now.toLocaleString("el-GR", { hour12: false });
  }

  // 1ο γράφημα – λεπτό-λεπτό, 24ωρο ώρα
  const labelsMinuto = filteredDataMinuto.map((row) =>
    row.Data.toLocaleTimeString("el-GR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  );
  const dataMinuto = filteredDataMinuto.map((row) => row.Temperatura);

  // 2ο γράφημα – ωριαία ομαδοποίηση
  const hourly = aggregateHourly(filteredDataMinuto);

  const labelsOraDate = hourly.map((h) => h.labelDate); // ΗΗ/ΜΜ/ΕΕ
  const labelsOraTime = hourly.map((h) => h.labelTime); // ΩΩ:00
  const dataOra = hourly.map((h) => h.meanTemp);
  const ciUpper = hourly.map((h) => h.ciUpper);
  const ciLower = hourly.map((h) => h.ciLower);

  updateCharts(
    labelsMinuto,
    dataMinuto,
    labelsOraDate,
    labelsOraTime,
    dataOra,
    ciUpper,
    ciLower
  );
}

// 6. Φιλτράρισμα κατά χρονικό διάστημα
function filterDataByTime(data, filter) {
  if (!data.length) return [];

  const lastValid = [...data]
    .reverse()
    .find((row) => row.Data instanceof Date && !isNaN(row.Data.getTime()));

  if (!lastValid) return data;

  const lastTimestamp = lastValid.Data.getTime();

  let timeFrame = 0;
  switch (filter) {
    case "last24h":
      timeFrame = 24 * 60 * 60 * 1000;
      break;
    case "last12h":
      timeFrame = 12 * 60 * 60 * 1000;
      break;
    case "last6h":
      timeFrame = 6 * 60 * 60 * 1000;
      break;
    case "last3h":
      timeFrame = 3 * 60 * 60 * 1000;
      break;
    case "last1h":
      timeFrame = 1 * 60 * 60 * 1000;
      break;
    default:
      return data; // all
  }

  return data.filter(
    (row) =>
      row.Data instanceof Date &&
      !isNaN(row.Data.getTime()) &&
      row.Data.getTime() >= lastTimestamp - timeFrame
  );
}

// 7. Ομαδοποίηση ανά ώρα & 95% CI
function aggregateHourly(data) {
  const groups = {};

  data.forEach((row) => {
    if (!(row.Data instanceof Date) || isNaN(row.Data.getTime())) return;
    if (isNaN(row.Temperatura)) return;

    const d = row.Data;

    // "στρογγυλεύουμε" στην αρχή της ώρας
    const hourDate = new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate(),
      d.getHours(),
      0,
      0,
      0
    );
    const ts = hourDate.getTime();

    if (!groups[ts]) {
      groups[ts] = {
        dateObj: hourDate,
        values: [],
      };
    }
    groups[ts].values.push(row.Temperatura);
  });

  return Object.keys(groups)
    .map((tsStr) => {
      const ts = Number(tsStr);
      const g = groups[tsStr];
      const values = g.values;
      const n = values.length;
      const meanTemp = values.reduce((a, b) => a + b, 0) / n;

      let ciUpper = meanTemp;
      let ciLower = meanTemp;
      if (n > 1) {
        const variance =
          values.reduce((sum, v) => sum + (v - meanTemp) ** 2, 0) / (n - 1);
        const stdErr = Math.sqrt(variance) / Math.sqrt(n);
        const ci95 = 1.96 * stdErr;
        ciUpper = meanTemp + ci95;
        ciLower = meanTemp - ci95;
      }

      const d = g.dateObj;
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      let yy = String(d.getFullYear());
      if (yy.length === 4) yy = yy.slice(2); // 2025 → 25
      const hh = String(d.getHours()).padStart(2, "0");

      return {
        ts,
        dateObj: d,
        labelDate: `${dd}/${mm}/${yy}`, // ΗΗ/ΜΜ/ΕΕ
        labelTime: `${hh}:00`,         // ΩΩ:00
        meanTemp,
        ciUpper,
        ciLower,
      };
    })
    .sort((a, b) => a.ts - b.ts);
}

// 8. Δημιουργία / ανανέωση γραφημάτων Chart.js
function updateCharts(
  labelsMinuto,
  dataMinuto,
  labelsOraDate,
  labelsOraTime,
  dataOra,
  ciUpper,
  ciLower
) {
  const minutoCanvas = document.getElementById("minutoChart");
  const oraCanvas = document.getElementById("oraChart");

  if (!minutoCanvas || !oraCanvas) {
    console.warn("Δεν βρέθηκαν τα canvas για τα γραφήματα θερμοκρασίας.");
    return;
  }

  const minutoCtx = minutoCanvas.getContext("2d");
  const oraCtx = oraCanvas.getContext("2d");

  if (window.minutoChart && typeof window.minutoChart.destroy === "function") {
    window.minutoChart.destroy();
  }
  if (window.oraChart && typeof window.oraChart.destroy === "function") {
    window.oraChart.destroy();
  }

  // -------------------------------
  // 1ο γράφημα – λεπτό-λεπτό
  // -------------------------------
  try {
    window.minutoChart = new Chart(minutoCtx, {
      type: "line",
      data: {
        labels: labelsMinuto, // "10:05", "10:06" ...
        datasets: [
          {
            label: "Θερμοκρασία",
            data: dataMinuto,
            borderWidth: 2,
            borderColor: "rgba(75, 192, 192, 1)",
            fill: false,
            tension: 0.1,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            display: true,
            type: "category",
            title: { display: true, text: "" },
            ticks: {
              callback: function (value, index) {
                return index % 10 === 0 ? (labelsMinuto[index] || "") : "";
              },
            },
          },
          y: {
            display: true,
            title: { display: true, text: "Θερμοκρασία (°C)" },
          },
        },
      },
    });
  } catch (error) {
    console.error("Σφάλμα στο γράφημα λεπτό-λεπτό:", error);
  }

  // -------------------------------
  // 2ο γράφημα – ωριαία μέση θερμοκρασία + 95% CI
  // -------------------------------
  try {
    const dummyLabels = dataOra.map((_, i) => i.toString());

    window.oraChart = new Chart(oraCtx, {
      type: "line",
      data: {
        labels: dummyLabels,
        datasets: [
          {
            label: "Μέση Ωριαία Θερμοκρασία",
            data: dataOra,
            borderWidth: 2,
            borderColor: "rgba(153, 102, 255, 1)",
            fill: false,
            tension: 0.1,
            pointRadius: 0,
          },
          {
            label: "95% CI Άνω",
            data: ciUpper,
            borderColor: "rgba(255, 159, 64, 0.2)",
            backgroundColor: "rgba(255, 159, 64, 0.2)",
            fill: "-1",
            borderWidth: 1,
            pointRadius: 0,
          },
          {
            label: "95% CI Κάτω",
            data: ciLower,
            borderColor: "rgba(255, 159, 64, 0.2)",
            backgroundColor: "rgba(255, 159, 64, 0.2)",
            fill: "origin",
            borderWidth: 1,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          x: {
            display: true,
            type: "category",
            title: { display: true, text: "" },
            ticks: {
              callback: function (value, index) {
                if (index % 2 !== 0) return "";

                const dateLabel = labelsOraDate[index] || "";
                const timeLabel = labelsOraTime[index] || "";

                if (!dateLabel && !timeLabel) return "";

                return [dateLabel, timeLabel];
              },
            },
          },
          y: {
            display: true,
            title: { display: true, text: "Θερμοκρασία (°C)" },
          },
        },
      },
    });
  } catch (error) {
    console.error("Σφάλμα στο γράφημα μέσης ωριαίας:", error);
  }
}

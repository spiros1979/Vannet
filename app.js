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

  // format από Apps Script: "dd/MM/yyyy HH:mm:ss"
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

  // Αν ΟΛΕΣ οι θερμοκρασίες είναι NaN → σταματάμε
  if (processedData.every((row) => isNaN(row.Temperatura))) {
    console.error("Όλες οι θερμοκρασίες είναι μη έγκυρες (NaN).");
    document.getElementById("latest-temp").textContent =
      "Σφάλμα στα δεδομένα θερμοκρασίας.";
    return;
  }

  // Φίλτρο χρόνου (24h, 12h κτλ)
  const timeFilter = document.getElementById("timeFilter").value;
  const filteredDataMinuto = filterDataByTime(processedData, timeFilter);

  if (filteredDataMinuto.length === 0) {
    console.error("Κανένα δεδομένο μετά το φιλτράρισμα.");
    document.getElementById("latest-temp").textContent =
      "Δεν υπάρχουν δεδομένα για το επιλεγμένο διάστημα.";
    return;
  }

  // Τελευταία θερμοκρασία
  const latestRow =
    filteredDataMinuto[filteredDataMinuto.length - 1] ||
    processedData[processedData.length - 1];
  const latestTemp = latestRow.Temperatura;
  document.getElementById(
    "latest-temp"
  ).textContent = `Τελευταία θερμοκρασία: ${latestTemp.toFixed(2)}°C`;

  // Τελευταία ενημέρωση – από το timestamp της τελευταίας γραμμής
  if (latestRow.Data instanceof Date && !isNaN(latestRow.Data.getTime())) {
    const d = latestRow.Data;
    const formattedDate = d.toLocaleDateString("el-GR");
    const formattedTime = d.toLocaleTimeString("el-GR");
    document.getElementById(
      "last-update"
    ).textContent = `Τελευταία ενημέρωση: ${formattedDate} ${formattedTime}`;
  } else {
    // fallback: ώρα browser
    const now = new Date();
    document.getElementById("last-update").textContent =
      "Τελευταία ενημέρωση: " + now.toLocaleString("el-GR");
  }

  // Δεδομένα για 1ο γράφημα (λεπτό-λεπτό)
  const labelsMinuto = filteredDataMinuto.map((row) =>
    row.Data.toLocaleString("el-GR")
  );
  const dataMinuto = filteredDataMinuto.map((row) => row.Temperatura);

  // Δεδομένα για 2ο γράφημα (μέση ωριαία τιμή + 95% CI)
  const hourlyData = aggregateHourly(filteredDataMinuto);
  const labelsOra = hourlyData.map((row) => row.label);
  const dataOra = hourlyData.map((row) => row.meanTemp);
  const ciUpper = hourlyData.map((row) => row.ciUpper);
  const ciLower = hourlyData.map((row) => row.ciLower);

  // Ζωγράφισε γραφήματα
  updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

// 6. Φιλτράρισμα κατά χρονικό διάστημα
function filterDataByTime(data, filter) {
  if (!data.length) return [];

  const lastValid = [...data]
    .reverse()
    .find((row) => row.Data instanceof Date && !isNaN(row.Data.getTime()));

  if (!lastValid) return data; // αν δεν βρούμε έγκυρη ημερομηνία, γύρνα όλα

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
      return data; // "all"
  }

  const filtered = data.filter(
    (row) =>
      row.Data instanceof Date &&
      !isNaN(row.Data.getTime()) &&
      row.Data.getTime() >= lastTimestamp - timeFrame
  );

  console.log(`Δεδομένα μετά το φίλτρο (${filter}):`, filtered);
  return filtered;
}

// 7. Ομαδοποίηση ανά ώρα & 95% CI
function aggregateHourly(data) {
  const grouped = data.reduce((acc, curr) => {
    if (!(curr.Data instanceof Date) || isNaN(curr.Data.getTime())) return acc;

    const d = curr.Data;
    const dateStr = d.toLocaleDateString("el-GR");
    const hour = d.getHours().toString().padStart(2, "0");
    const key = `${dateStr} ${hour}:00`;

    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(curr.Temperatura);
    return acc;
  }, {});

  return Object.keys(grouped).map((key) => {
    const values = grouped[key];
    const n = values.length;
    const meanTemp = values.reduce((a, b) => a + b, 0) / n;

    let ciUpper = meanTemp;
    let ciLower = meanTemp;
    if (n > 1) {
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - meanTemp, 2), 0) /
        (n - 1);
      const stdErr = Math.sqrt(variance) / Math.sqrt(n);
      const ci95 = 1.96 * stdErr;
      ciUpper = meanTemp + ci95;
      ciLower = meanTemp - ci95;
    }

    return {
      label: key,
      meanTemp,
      ciUpper,
      ciLower,
    };
  });
}

// 8. Δημιουργία / ανανέωση γραφημάτων Chart.js
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {
  const minutoCtx = document.getElementById("minutoChart").getContext("2d");
  const oraCtx = document.getElementById("oraChart").getContext("2d");

  if (window.minutoChart && typeof window.minutoChart.destroy === "function") {
    window.minutoChart.destroy();
  }
  if (window.oraChart && typeof window.oraChart.destroy === "function") {
    window.oraChart.destroy();
  }

  // Γράφημα λεπτό-λεπτό
  try {
    window.minutoChart = new Chart(minutoCtx, {
      type: "line",
      data: {
        labels: labelsMinuto,
        datasets: [
          {
            label: "Θερμοκρασία",
            data: dataMinuto,
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
            title: { display: true, text: "" },
            ticks: {
              callback: function (value, index) {
                // δείξε κάθε 10η ετικέτα
                if (index % 10 === 0) {
                  const label = labelsMinuto[index] || "";
                  // π.χ. "5/12/2025, 10:30:00" → δείξε μόνο ώρα
                  const parts = label.split(" ");
                  return parts[1] || label;
                }
                return "";
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

  // Γράφημα μέσης ωριαίας θερμοκρασίας + 95% CI
  try {
    window.oraChart = new Chart(oraCtx, {
      type: "line",
      data: {
        labels: labelsOra,
        datasets: [
          {
            label: "Μέση Ωριαία Θερμοκρασία",
            data: dataOra,
            borderColor: "rgba(153, 102, 255, 1)",
            fill: false,
            tension: 0.1,
            pointRadius: 0,
          },
          {
            label: "95% CI Άνω",
            data: ciUpper,
            borderColor: "rgba(255, 159, 64, 0.2)",
            fill: "-1",
            backgroundColor: "rgba(255, 159, 64, 0.2)",
            borderWidth: 1,
            pointRadius: 0,
          },
          {
            label: "95% CI Κάτω",
            data: ciLower,
            borderColor: "rgba(255, 159, 64, 0.2)",
            fill: "-1",
            backgroundColor: "rgba(255, 159, 64, 0.2)",
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
            title: { display: true, text: "" },
            ticks: {
              callback: function (value, index) {
                if (index % 2 === 0) {
                  const label = labelsOra[index] || "";
                  const [datePart] = label.split(" ");
                  return datePart || label;
                }
                return "";
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

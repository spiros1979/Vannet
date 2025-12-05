//------------------------------------------------------------
// appumidit.js (ΝΕΑ ΔΙΟΡΘΩΜΕΝΗ ΕΚΔΟΣΗ)
//------------------------------------------------------------

// Ανανέωση δεδομένων όταν πατηθεί το εικονίδιο
document.getElementById('update-data').addEventListener('click', function() {
    loadDataAndUpdateCharts();
});

//==========================================================
// Βοηθητική συνάρτηση: Μετατρέπει "dd/MM/yyyy HH:mm:ss" → Date()
//==========================================================
function parseDateString(dateString) {
    try {
        const [datePart, timePart] = dateString.split(" ");
        const [day, month, year]   = datePart.split("/").map(Number);

        let hours = 0, minutes = 0, seconds = 0;

        if (timePart) {
            [hours, minutes, seconds] = timePart.split(":").map(Number);
        }

        return new Date(year, month - 1, day, hours, minutes, seconds);
    }
    catch (err) {
        console.error("Σφάλμα parseDateString:", dateString);
        return new Date(NaN);
    }
}

//==========================================================
// Φόρτωμα δεδομένων από Google Script
//==========================================================
function loadDataAndUpdateCharts() {

    const url = "https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec?mode=read";

    fetch(url)
        .then(r => r.json())
        .then(data => processAndDisplayData(data))
        .catch(err => console.error("Σφάλμα fetch:", err));
}

//==========================================================
// Επεξεργασία δεδομένων
//==========================================================
function processAndDisplayData(data) {

    const processed = data.map(row => {

        // --- Υγρασία ---
        let hum = Number(row["Umidità"]);
        if (isNaN(hum)) {
            hum = NaN;
        }

        // --- Ημερομηνία ---
        const parsed = parseDateString(row.Data);

        return {
            ...row,
            Data: parsed,
            Umidità: hum
        };
    });

    // Φιλτράρισμα ανά φίλτρο χρόνου
    const filter = document.getElementById("timeFilter").value;
    const filtered = filterDataByTime(processed, filter);

    if (!filtered.length) {
        document.getElementById("latest-temp").textContent =
            "Δεν υπάρχουν διαθέσιμα δεδομένα";
        return;
    }

    // Τελευταίο δείγμα
    const last = filtered[filtered.length - 1];
    document.getElementById("latest-temp").textContent =
        `Τελευταία υγρασία: ${last.Umidità.toFixed(2)} %`;

    // Ενημέρωση timestamp εμφάνισης
    const now = new Date().toLocaleString("el-GR", { hour12: false });
    document.getElementById("last-update").textContent =
        `Τελευταία ενημέρωση: ${now}`;

    //------------------------------------------------------
    // LABELS **24ωρης μορφής** για το λεπτό-λεπτό γράφημα
    //------------------------------------------------------
    const labelsMinuto = filtered.map(row =>
        row.Data.toLocaleTimeString("el-GR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })
    );

    const dataMinuto = filtered.map(row => row.Umidità);

    //------------------------------------------------------
    // Ωριαία ομαδοποίηση
    //------------------------------------------------------
    const hourly = aggregateHourly(filtered);

    const labelsOra = hourly.map(h => h.label);
    const dataOra   = hourly.map(h => h.meanHum);
    const ciUpper   = hourly.map(h => h.ciUpper);
    const ciLower   = hourly.map(h => h.ciLower);

    //------------------------------------------------------
    // Δημιουργία γραφημάτων
    //------------------------------------------------------
    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

//==========================================================
// Φιλτράρισμα ανά 1h / 3h / 6h / 12h / 24h
//==========================================================
function filterDataByTime(data, filter) {

    const lastTS = data[data.length - 1].Data.getTime();
    let frame = 0;

    switch (filter) {
        case "last24h": frame = 24 * 3600 * 1000; break;
        case "last12h": frame = 12 * 3600 * 1000; break;
        case "last6h":  frame =  6 * 3600 * 1000; break;
        case "last3h":  frame =  3 * 3600 * 1000; break;
        case "last1h":  frame =  1 * 3600 * 1000; break;
        default: return data;
    }

    return data.filter(r => r.Data.getTime() >= lastTS - frame);
}

//==========================================================
// Ομαδοποίηση ανά ώρα με CI
//==========================================================
function aggregateHourly(data) {

    const groups = {};

    data.forEach(row => {
        const d = row.Data;

        const date = d.toLocaleDateString("el-GR");
        const hour = d.getHours().toString().padStart(2, "0");

        const key = `${date} ${hour}:00`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(row.Umidità);
    });

    return Object.keys(groups).map(key => {
        const values = groups[key];
        const mean = values.reduce((a, b) => a + b, 0) / values.length;

        let stderr = 0;
        if (values.length > 1) {
            const variance =
                values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
            stderr = Math.sqrt(variance) / Math.sqrt(values.length);
        }

        const ci = 1.96 * stderr;

        return {
            label: key,
            meanHum: mean,
            ciUpper: mean + ci,
            ciLower: mean - ci
        };
    });
}

//==========================================================
// Δημιουργία ΓΡΑΦΗΜΑΤΩΝ
//==========================================================
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {

    const ctxMin = document.getElementById("minutoChart").getContext("2d");
    const ctxOra = document.getElementById("oraChart").getContext("2d");

    if (window.minutoChart) window.minutoChart.destroy();
    if (window.oraChart) window.oraChart.destroy();

    //------------------------------------------------------
    // Γράφημα λεπτό-λεπτό (πρώτο)
    //------------------------------------------------------
    window.minutoChart = new Chart(ctxMin, {
        type: "line",
        data: {
            labels: labelsMinuto,
            datasets: [{
                label: "Υγρασία",
                data: dataMinuto,
                borderColor: "rgba(75, 192, 192, 1)",
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }},
            scales: {
                x: {
                    ticks: {
                        callback: (value, index) =>
                            index % 10 === 0 ? labelsMinuto[value] : ""
                    }
                },
                y: {
                    title: { display: true, text: "Υγρασία (%)" }
                }
            }
        }
    });

    //------------------------------------------------------
    // Γράφημα ωριαίας μέσης υγρασίας + CI
    //------------------------------------------------------
    window.oraChart = new Chart(ctxOra, {
        type: "line",
        data: {
            labels: labelsOra,
            datasets: [
                {
                    label: "Μέση υγρασία ανά ώρα",
                    data: dataOra,
                    borderColor: "rgba(153, 102, 255, 1)",
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: "95% CI",
                    data: ciUpper,
                    borderColor: "rgba(255, 159, 64, 0.2)",
                    backgroundColor: "rgba(255, 159, 64, 0.2)",
                    fill: "-1",
                    pointRadius: 0
                },
                {
                    label: "95% CI",
                    data: ciLower,
                    borderColor: "rgba(255, 159, 64, 0.2)",
                    backgroundColor: "rgba(255, 159, 64, 0.2)",
                    fill: "origin",
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }},
            scales: {
                x: {
                    ticks: {
                        callback: (value, index) =>
                            index % 2 === 0 ? labelsOra[value] : ""
                    }
                },
                y: {
                    title: { display: true, text: "Υγρασία (%)" }
                }
            }
        }
    });
}

//==========================================================
// Εκκίνηση
//==========================================================
document.addEventListener("DOMContentLoaded", function() {
    loadDataAndUpdateCharts();

    document.getElementById("update-data").addEventListener("click", loadDataAndUpdateCharts);
    document.getElementById("timeFilter").addEventListener("change", loadDataAndUpdateCharts);
});

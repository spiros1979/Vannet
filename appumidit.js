//------------------------------------------------------------
// appumidit.js (έκδοση με φιλτράρισμα invalid δεδομένων)
//------------------------------------------------------------

//==========================================================
// Βοηθητική συνάρτηση: "dd/MM/yyyy HH:mm:ss" → Date()
//==========================================================
function parseDateString(dateString) {
    try {
        const [datePart, timePart] = (dateString || "").split(" ");
        const [day, month, year]   = (datePart || "").split("/").map(Number);

        let hours = 0, minutes = 0, seconds = 0;

        if (timePart) {
            const parts = timePart.split(":").map(Number);
            hours   = parts[0] ?? 0;
            minutes = parts[1] ?? 0;
            seconds = parts[2] ?? 0;
        }

        const d = new Date(year, month - 1, day, hours, minutes, seconds);
        if (isNaN(d.getTime())) {
            // invalid ημερομηνία
            throw new Error("Invalid date");
        }
        return d;
    } catch (err) {
        console.error("Σφάλμα parseDateString:", dateString, err);
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
        .catch(err => {
            console.error("Σφάλμα fetch:", err);
            const latest = document.getElementById("latest-temp");
            if (latest) {
                latest.textContent = "Σφάλμα φόρτωσης δεδομένων";
            }
        });
}

//==========================================================
// Επεξεργασία δεδομένων
//==========================================================
function processAndDisplayData(data) {
    // 1. Μετατροπή & καθάρισμα
    let processed = data.map(row => {
        // Υγρασία
        const humRaw = Number(row["Umidità"]);
        const hum = isNaN(humRaw) ? NaN : humRaw;

        // Ημερομηνία
        const parsedDate = parseDateString(row.Data);

        return {
            ...row,
            Data: parsedDate,
            Umidità: hum
        };
    });

    // Πετάμε σειρές με invalid Date
    processed = processed.filter(r =>
        r.Data instanceof Date && !isNaN(r.Data.getTime())
    );

    if (!processed.length) {
        document.getElementById("latest-temp").textContent =
            "Δεν υπάρχουν διαθέσιμα δεδομένα (invalid ημερομηνίες)";
        return;
    }

    // 2. Φίλτρο χρόνου
    const timeFilterEl = document.getElementById("timeFilter");
    const filter = timeFilterEl ? timeFilterEl.value : "all";

    let filtered = filterDataByTime(processed, filter);

    // Πετάμε σειρές με NaN υγρασία
    filtered = filtered.filter(r => !isNaN(r.Umidità));

    if (!filtered.length) {
        document.getElementById("latest-temp").textContent =
            "Δεν υπάρχουν διαθέσιμα δεδομένα (μετά το φίλτρο χρόνου)";
        return;
    }

    // 3. Τελευταίο δείγμα
    const last = filtered[filtered.length - 1];
    document.getElementById("latest-temp").textContent =
        `Τελευταία υγρασία: ${last.Umidità.toFixed(2)} %`;

    // 4. Timestamp ενημέρωσης
    const now = new Date().toLocaleString("el-GR", { hour12: false });
    document.getElementById("last-update").textContent =
        `Τελευταία ενημέρωση: ${now}`;

    // 5. Labels & data για λεπτό-λεπτό
    const labelsMinuto = filtered.map(row =>
        row.Data.toLocaleTimeString("el-GR", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false
        })
    );

    const dataMinuto = filtered.map(row => row.Umidità);

    // 6. Ωριαία ομαδοποίηση
    const hourly = aggregateHourly(filtered);

    const labelsOra = hourly.map(h => h.label);
    const dataOra   = hourly.map(h => h.meanHum);
    const ciUpper   = hourly.map(h => h.ciUpper);
    const ciLower   = hourly.map(h => h.ciLower);

    // 7. Δημιουργία γραφημάτων
    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

//==========================================================
// Φιλτράρισμα ανά 1h / 3h / 6h / 12h / 24h
//==========================================================
function filterDataByTime(data, filter) {
    if (!data.length) return [];

    const lastTS = data[data.length - 1].Data.getTime();
    if (isNaN(lastTS)) return [];

    let frame = 0;

    switch (filter) {
        case "last24h": frame = 24 * 3600 * 1000; break;
        case "last12h": frame = 12 * 3600 * 1000; break;
        case "last6h":  frame =  6 * 3600 * 1000; break;
        case "last3h":  frame =  3 * 3600 * 1000; break;
        case "last1h":  frame =  1 * 3600 * 1000; break;
        default:
            // "all"
            return data;
    }

    const fromTS = lastTS - frame;
    return data.filter(r => r.Data.getTime() >= fromTS);
}

//==========================================================
// Ομαδοποίηση ανά ώρα με CI
//==========================================================
function aggregateHourly(data) {
    const groups = {};

    data.forEach(row => {
        if (!(row.Data instanceof Date) || isNaN(row.Data.getTime())) return;
        if (isNaN(row.Umidità)) return;

        const d = row.Data;

        const date = d.toLocaleDateString("el-GR");
        const hour = d.getHours().toString().padStart(2, "0");

        const key = `${date} ${hour}:00`;

        if (!groups[key]) groups[key] = [];
        groups[key].push(row.Umidità);
    });

    return Object.keys(groups).map(key => {
        const values = groups[key];
        if (!values.length) {
            return {
                label: key,
                meanHum: NaN,
                ciUpper: NaN,
                ciLower: NaN
            };
        }

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
    }).filter(r => !isNaN(r.meanHum));
}

//==========================================================
// Δημιουργία ΓΡΑΦΗΜΑΤΩΝ
//==========================================================
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {
    const canvasMin = document.getElementById("minutoChart");
    const canvasOra = document.getElementById("oraChart");

    if (!canvasMin || !canvasOra) {
        console.warn("Δεν βρέθηκαν τα canvas για τα γραφήματα.");
        return;
    }

    const ctxMin = canvasMin.getContext("2d");
    const ctxOra = canvasOra.getContext("2d");

    if (window.minutoChart) window.minutoChart.destroy();
    if (window.oraChart) window.oraChart.destroy();

    //------------------------------------------------------
    // Γράφημα λεπτό-λεπτό
    //------------------------------------------------------
    window.minutoChart = new Chart(ctxMin, {
        type: "line",
        data: {
            labels: labelsMinuto,
            datasets: [{
                label: "Υγρασία",
                data: dataMinuto,
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: {
                        // value εδώ είναι ήδη το label (π.χ. "10:05")
                        callback: (value, index) =>
                            index % 10 === 0 ? value : ""
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
                    borderWidth: 2,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: "95% CI πάνω",
                    data: ciUpper,
                    borderWidth: 1,
                    tension: 0.1,
                    pointRadius: 0
                },
                {
                    label: "95% CI κάτω",
                    data: ciLower,
                    borderWidth: 1,
                    tension: 0.1,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    ticks: {
                        callback: (value, index) =>
                            index % 2 === 0 ? value : ""
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
    // αρχικό φόρτωμα
    loadDataAndUpdateCharts();

    // κουμπί ανανέωσης
    const updateBtn = document.getElementById("update-data");
    if (updateBtn) {
        updateBtn.addEventListener("click", function (e) {
            e.preventDefault();
            loadDataAndUpdateCharts();
        });
    }

    // dropdown φίλτρου
    const timeFilterEl = document.getElementById("timeFilter");
    if (timeFilterEl) {
        timeFilterEl.addEventListener("change", loadDataAndUpdateCharts);
    }
});

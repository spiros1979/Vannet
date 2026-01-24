// -------------------------------
// Φόρτωμα δεδομένων από Apps Script
// -------------------------------
function loadDataAndUpdateCharts() {
    const url = 'https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec?mode=read';

    fetch(url)
        .then(response => response.json())
        .then(data => processAndDisplayData(data))
        .catch(error => console.error('Σφάλμα κατά την ανάκτηση δεδομένων:', error));
}

// -----------------------------------------------
// Μετατροπή dd/MM/yyyy HH:mm:ss → JS Date object
// -----------------------------------------------
function parseDateString(dateString) {
    if (!dateString) return new Date(NaN);

    let [datePart, timePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);

    let [hours, minutes, seconds] = [0, 0, 0];
    if (timePart) {
        [hours, minutes, seconds] = timePart.split(':').map(Number);
    }
    return new Date(year, month - 1, day, hours, minutes, seconds);
}

// -------------------------------------------------------------
// Επεξεργασία & εμφάνιση δεδομένων (AIQ + 2 γραφήματα)
// -------------------------------------------------------------
function processAndDisplayData(data) {

    // Προεπεξεργασία δεδομένων – δουλεύουμε μόνο με AIQ
    const processedData = data.map(row => {
        let aiqVal = row.aiq;

        if (typeof aiqVal === 'string') {
            aiqVal = parseFloat(aiqVal.replace(',', '.'));
        } else if (typeof aiqVal !== 'number') {
            console.error('Μη έγκυρη τιμή AIQ:', row);
            aiqVal = NaN;
        }

        const parsedDate = parseDateString(row.Data);

        return {
            ...row,
            Data: parsedDate,
            aiq: aiqVal
        };
    });

    // Αν όλες οι τιμές AIQ είναι NaN → δεν έχουμε δεδομένα
    if (processedData.every(row => isNaN(row.aiq))) {
        document.getElementById('latest-temp').textContent =
            'Δεν υπάρχουν διαθέσιμα δεδομένα AIQ.';
        return;
    }

    // Φίλτρο χρόνου (όπως στα άλλα γραφήματα)
    const timeFilter = document.getElementById('timeFilter').value;
    const filteredData = filterDataByTime(processedData, timeFilter);

    if (!filteredData.length) {
        document.getElementById('latest-temp').textContent =
            'Δεν υπάρχουν δεδομένα για το επιλεγμένο διάστημα.';
        return;
    }

    // Τελευταία τιμή AIQ
    const lastRow = filteredData[filteredData.length - 1];
    const latestAIQ = lastRow.aiq;

    if (Number.isFinite(latestAIQ)) {
        document.getElementById('latest-temp').textContent =
            `Τελευταία τιμή AIQ: ${latestAIQ.toFixed(2)}`;
    } else {
        document.getElementById('latest-temp').textContent =
            'Τελευταία τιμή AIQ: --';
    }

    // Τελευταία λήψη δεδομένων (από το τελευταίο row του filteredData)
    const lastSample = filteredData[filteredData.length - 1];

    const d = lastSample.Data instanceof Date ? lastSample.Data : new Date(lastSample.Data);
    const lastUpdateTime = isNaN(d.getTime())
        ? String(lastSample.Data)
        : d.toLocaleString('el-GR', { hour12: false });

    const el = document.getElementById('last-update');
    if (el) {
        el.textContent = `Τελευταία λήψη δεδομένων: ${lastUpdateTime}`;
    }

    // Labels + τιμές για 1ο γράφημα (λεπτό-λεπτό AIQ)
    const labelsMinuto = filteredData.map(row =>
        row.Data.toLocaleString('el-GR', {
            hour12: false
        })
    );

    const dataMinuto = filteredData.map(row => row.aiq);

    // Ωριαία ομαδοποίηση AIQ
    const hourlyData = aggregateHourly(filteredData);

    const labelsOra = hourlyData.map(row => row.label);
    const dataOra   = hourlyData.map(row => row.meanAiq);
    const ciUpper   = hourlyData.map(row => row.ciUpper);
    const ciLower   = hourlyData.map(row => row.ciLower);

    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

// -----------------------------------------------
// Φιλτράρισμα ανά χρονικό παράθυρο
// -----------------------------------------------
function filterDataByTime(data, filter) {
    if (!data.length) return [];

    const lastTS = data[data.length - 1].Data.getTime();
    let windowMs = 0;

    switch (filter) {
        case 'last24h': windowMs = 24 * 3600000; break;
        case 'last12h': windowMs = 12 * 3600000; break;
        case 'last6h':  windowMs =  6 * 3600000; break;
        case 'last3h':  windowMs =  3 * 3600000; break;
        case 'last1h':  windowMs =  1 * 3600000; break;
        default:
            return data; // "all"
    }

    return data.filter(row =>
        row.Data instanceof Date &&
        !isNaN(row.Data.getTime()) &&
        row.Data.getTime() >= lastTS - windowMs
    );
}

// ----------------------------------------------
// Ωριαία ομαδοποίηση AIQ με 95% CI
// ----------------------------------------------
function aggregateHourly(data) {
    const grouped = {};

    data.forEach(row => {
        if (!(row.Data instanceof Date) || isNaN(row.Data.getTime())) return;

        const d = row.Data;
        const date = d.toLocaleDateString('el-GR');
        const hour = d.getHours().toString().padStart(2, '0');
        const key = `${date} ${hour}:00`;

        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(row.aiq);
    });

    return Object.keys(grouped).map(key => {
        const arr = grouped[key];
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;

        let stdErr = 0;
        if (arr.length > 1) {
            const variance =
                arr.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
                (arr.length - 1);
            stdErr = Math.sqrt(variance) / Math.sqrt(arr.length);
        }

        const ci = 1.96 * stdErr;

        return {
            label: key,
            meanAiq: mean,
            ciUpper: mean + ci,
            ciLower: mean - ci
        };
    });
}

// ------------------------
// Ενημέρωση γραφημάτων
// ------------------------
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {

    const minutoCtx = document.getElementById('minutoChart').getContext('2d');
    const oraCtx    = document.getElementById('oraChart').getContext('2d');

    if (window.minutoChart && typeof window.minutoChart.destroy === 'function') {
        window.minutoChart.destroy();
    }
    if (window.oraChart && typeof window.oraChart.destroy === 'function') {
        window.oraChart.destroy();
    }

    // -- 1ο γράφημα: Δείκτης AIQ λεπτό-λεπτό --
    window.minutoChart = new Chart(minutoCtx, {
        type: 'line',
        data: {
            labels: labelsMinuto,
            datasets: [{
                label: 'Δείκτης AIQ',
                data: dataMinuto,
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0.1,
                fill: false,
                pointRadius: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: {
                        callback: function (value, index) {
                            // Δείξε κάθε 10η ετικέτα (προαιρετικό για να μην γίνεται χαμός)
                            if (index % 10 === 0) {
                                return labelsMinuto[index];
                            }
                            return '';
                        }
                    }
                },
                y: {
                    title: { display: true, text: 'Δείκτης AIQ' }
                }
            }
        }
    });

    // -- 2ο γράφημα: Ωριαία μέση τιμή AIQ + 95% CI --
    window.oraChart = new Chart(oraCtx, {
        type: 'line',
        data: {
            labels: labelsOra,
            datasets: [
                {
                    label: 'Μέσος Δείκτης AIQ ανά ώρα',
                    data: dataOra,
                    borderColor: '#4E9DF2',
                    tension: 0.1,
                    fill: false,
                    pointRadius: 0
                },
                {
                    label: '95% CI Άνω',
                    data: ciUpper,
                    borderColor: '#C44127',
                    backgroundColor: 'rgba(196, 65, 39, 0.15)',
                    fill: '-1',
                    pointRadius: 0
                },
                {
                    label: '95% CI Κάτω',
                    data: ciLower,
                    borderColor: '#E0AA14',
                    backgroundColor: 'rgba(224, 170, 20, 0.15)',
                    fill: '-1',
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: {
                        callback: function (value, index) {
                            // Δείξε κάθε 2η ετικέτα για να φαίνονται καθαρά
                            if (index % 2 === 0) {
                                return labelsOra[index];
                            }
                            return '';
                        }
                    }
                },
                y: {
                    title: { display: true, text: 'Δείκτης AIQ' }
                }
            }
        }
    });
}

// ----------------------------------------
// Αυτόματο φόρτωμα όταν ανοίγει η σελίδα
// ----------------------------------------
document.addEventListener('DOMContentLoaded', function () {
    loadDataAndUpdateCharts();

    document.getElementById('update-data')
        .addEventListener('click', function (e) {
            e.preventDefault();
            loadDataAndUpdateCharts();
        });

    document.getElementById('timeFilter')
        .addEventListener('change', loadDataAndUpdateCharts);
});

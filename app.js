// Όταν πατηθεί το κουμπί "update-data" κάνουμε φόρτωση και ανανέωση των γραφημάτων
document.getElementById('update-data').addEventListener('click', function() {
    loadDataAndUpdateCharts();
});

// Φόρτωση δεδομένων από Apps Script (JSON) και ενημέρωση των γραφημάτων
function loadDataAndUpdateCharts() {

    // TODO: ΑΛΛΑΞΕ ΤΟ ΜΕ ΤΟ ΔΙΚΟ ΣΟΥ Apps Script URL που επιστρέφει JSON
    const url = 'https://script.google.com/macros/s/AKfycbxd1U-hm2xo79srYB-o9AdgHBBCKOrbaL4fFzdJlXbzhpV08Sq8Tua6qk_5Q78cJWFZ/exec'; 

    fetch(url)
        .then(response => response.json())
        .then(data => {
            processAndDisplayData(data);
        })
        .catch(error => console.error('Σφάλμα κατά το fetch των δεδομένων:', error));
}

// Μετατροπή string ημερομηνίας σε αντικείμενο Date (υποστηρίζει μορφή με ή χωρίς κόμμα)
function parseDateString(dateString) {
    // Χωρίζουμε ημερομηνία και ώρα με βάση το κόμμα (αν υπάρχει)
    let [datePart, timePart] = dateString.split(', ');

    // Αν δεν βρέθηκε κόμμα, δοκιμάζουμε με κενό
    if (!timePart) {
        [datePart, timePart] = dateString.split(' ');
    }

    // Ημερομηνία σε μορφή ΗΗ/ΜΜ/ΕΕΕΕ
    const [day, month, year] = datePart.split('/').map(Number);

    // Ώρα σε μορφή ΩΩ:ΛΛ:ΔΔ ή κενή
    let [hours, minutes, seconds] = [0, 0, 0];
    if (timePart) {
        [hours, minutes, seconds] = timePart.split(':').map(Number);
    }

    return new Date(year, month - 1, day, hours, minutes, seconds);
}

// Κύρια επεξεργασία δεδομένων + ενημέρωση HTML + προετοιμασία για Chart.js
function processAndDisplayData(data) {
    // Προ-επεξεργασία δεδομένων (μετατροπή τύπων κλπ.)
    const processedData = data.map(row => {
        let temperatura = row.Temperatura;  // ΠΕΔΙΟ από το JSON / Google Sheet (μην το πειράξεις εδώ)

        // Αν είναι string, το κάνουμε number (και αντικαθιστούμε κόμμα με τελεία)
        if (typeof temperatura === 'string') {
            temperatura = parseFloat(temperatura.replace(',', '.'));
        } else if (typeof temperatura !== 'number') {
            console.error('Το πεδίο Temperatura λείπει ή δεν είναι έγκυρο:', row);
            temperatura = NaN;  // Σημειώνουμε ως μη έγκυρο
        }

        // Μετατροπή ημερομηνίας (στήλη Data του Sheet)
        const parsedDate = new Date(row.Data);
        if (isNaN(parsedDate.getTime())) {
            console.error('Μη έγκυρη ημερομηνία:', row.Data);
        }

        return {
            ...row,
            Data: parsedDate,      // Φροντίζουμε η Data να είναι τύπου Date
            Temperatura: temperatura
        };
    });

    // Αν ΟΛΕΣ οι θερμοκρασίες είναι NaN, τότε κάτι πάει στραβά
    if (processedData.every(row => isNaN(row.Temperatura))) {
        console.error('Όλες οι τιμές θερμοκρασίας είναι μη έγκυρες.');
        return;
    }

    // Φιλτράρισμα δεδομένων ανάλογα με το φίλτρο χρόνου (π.χ. 24h, 12h...)
    const timeFilter = document.getElementById('timeFilter').value;
    const filteredDataMinuto = filterDataByTime(processedData, timeFilter);
    
    if (filteredDataMinuto.length === 0) {
        console.error("Δεν υπάρχουν δεδομένα μετά το φιλτράρισμα.");
        document.getElementById('latest-temp').textContent = "Δεν υπάρχουν διαθέσιμα δεδομένα.";
        return;
    }

    // Τελευταία θερμοκρασία (η πιο πρόσφατη εγγραφή)
    const latestTemp = filteredDataMinuto[filteredDataMinuto.length - 1].Temperatura;
    document.getElementById('latest-temp').textContent =
        `Τελευταία θερμοκρασία: ${latestTemp.toFixed(2)} °C`;

    // Τελευταία ώρα ενημέρωσης (τώρα)
    const lastUpdateTime = new Date().toLocaleString('el-GR', { hour12: false });
    document.getElementById('last-update').textContent =
        `Τελευταία ενημέρωση: ${lastUpdateTime}`;

    // Δεδομένα για 1ο γράφημα (λεπτό προς λεπτό)
    const labelsMinuto = filteredDataMinuto.map(row => row.Data.toLocaleString('el-GR'));
    const dataMinuto = filteredDataMinuto.map(row => row.Temperatura);

    // Δεδομένα για 2ο γράφημα (μέση θερμοκρασία ανά ώρα + confidence intervals)
    const hourlyData = aggregateHourly(filteredDataMinuto);
    const labelsOra = hourlyData.map(row => row.label);
    const dataOra = hourlyData.map(row => row.meanTemp);
    const ciUpper = hourlyData.map(row => row.ciUpper);
    const ciLower = hourlyData.map(row => row.ciLower);

    // Τελική ενημέρωση των γραφημάτων
    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

// Φιλτράρισμα δεδομένων με βάση χρονικό παράθυρο (1h, 3h, 6h, 12h, 24h)
function filterDataByTime(data, filter) {
    const lastTimestamp = data[data.length - 1].Data.getTime();

    let timeFrame = 0;
    switch (filter) {
        case 'last24h':
            timeFrame = 24 * 60 * 60 * 1000; // 24 ώρες
            break;
        case 'last12h':
            timeFrame = 12 * 60 * 60 * 1000; // 12 ώρες
            break;
        case 'last6h':
            timeFrame = 6 * 60 * 60 * 1000;  // 6 ώρες
            break;
        case 'last3h':
            timeFrame = 3 * 60 * 60 * 1000;  // 3 ώρες
            break;
        case 'last1h':
            timeFrame = 1 * 60 * 60 * 1000;  // 1 ώρα
            break;
        default:
            // "Όλα τα δεδομένα"
            return data;
    }

    const filteredData = data.filter(row =>
        row.Data.getTime() >= (lastTimestamp - timeFrame)
    );

    console.log(`Φιλτραρισμένα δεδομένα (${filter}):`, filteredData);
    return filteredData;
}

// Ομαδοποίηση δεδομένων ανά ώρα και υπολογισμός μέσης τιμής + 95% confidence interval
function aggregateHourly(data) {
    const grouped = data.reduce((acc, curr) => {
        const hour = curr.Data.getHours();
        const date = curr.Data.toLocaleDateString('el-GR');
        const key = `${date} ${hour}:00`;

        if (!acc[key]) {
            acc[key] = [];
        }

        acc[key].push(curr.Temperatura);
        return acc;
    }, {});

    return Object.keys(grouped).map(key => {
        const values = grouped[key];
        const meanTemp = values.reduce((a, b) => a + b, 0) / values.length;

        // Υπολογισμός τυπικού σφάλματος
        const stdErr = Math.sqrt(
            values.reduce((sum, val) => sum + Math.pow(val - meanTemp, 2), 0) /
            (values.length - 1)
        ) / Math.sqrt(values.length);

        const ci95 = 1.96 * stdErr;

        return {
            label: key,
            meanTemp,
            ciUpper: meanTemp + ci95,
            ciLower: meanTemp - ci95
        };
    });
}

// Δημιουργία / ενημέρωση των 2 γραφημάτων (λεπτό-λεπτό & μέση ανά ώρα)
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {
    const minutoCtx = document.getElementById('minutoChart').getContext('2d');
    const oraCtx = document.getElementById('oraChart').getContext('2d');

    // Αν υπάρχουν ήδη γραφήματα, τα καταστρέφουμε πριν ξαναφτιάξουμε
    if (window.minutoChart && typeof window.minutoChart.destroy === 'function') {
        window.minutoChart.destroy();
    }

    if (window.oraChart && typeof window.oraChart.destroy === 'function') {
        window.oraChart.destroy();
    }

    // -------- 1ο Γράφημα: Θερμοκρασία ανά λεπτό --------
    try {
        window.minutoChart = new Chart(minutoCtx, {
            type: 'line',
            data: {
                labels: labelsMinuto,
                datasets: [{
                    label: 'Θερμοκρασία',
                    data: dataMinuto,
                    borderColor: 'rgba(75, 192, 192, 1)',
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false // Απόκρυψη legend
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: '' },
                        ticks: {
                            callback: function(value, index, ticks) {
                                // Εμφάνιση ετικέτας μόνο κάθε 10 σημεία
                                if (index % 10 === 0) {
                                    const date = parseDateString(labelsMinuto[value]);
                                    if (!isNaN(date.getTime())) {
                                        return date.toLocaleDateString('el-GR');
                                    } else {
                                        console.error('Σφάλμα στη μετατροπή ημερομηνίας:', labelsMinuto[value]);
                                        return '';
                                    }
                                } else {
                                    return '';
                                }
                            }
                        }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'Θερμοκρασία (°C)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Σφάλμα κατά τη δημιουργία του γραφήματος λεπτού-λεπτού:', error);
    }

    // -------- 2ο Γράφημα: Μέση Θερμοκρασία ανά ώρα + 95% CI --------
    try {
        window.oraChart = new Chart(oraCtx, {
            type: 'line',
            data: {
                labels: labelsOra, 
                datasets: [
                    {
                        label: 'Μέση Θερμοκρασία Ανά Ώρα',
                        data: dataOra,
                        borderColor: 'rgba(153, 102, 255, 1)',
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Διάστημα Εμπιστοσύνης 95%',
                        data: ciUpper,
                        borderColor: 'rgba(255, 159, 64, 0.2)',
                        fill: '-1',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        borderWidth: 1,
                        pointRadius: 0
                    },
                    {
                        label: 'Διάστημα Εμπιστοσύνης 95%',
                        data: ciLower,
                        borderColor: 'rgba(255, 159, 64, 0.2)',
                        fill: '-1',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        borderWidth: 1,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: '' },
                        ticks: {
                            callback: function(value, index, ticks) {
                                // Εμφάνιση ημερομηνίας μόνο κάθε 2 labels
                                if (index % 2 === 0) {
                                    const dateLabel = labelsOra[value];
                                    const [datePart, timePart] = dateLabel.split(' ');
                                    return datePart; // Επιστρέφουμε μόνο την ημερομηνία
                                } else {
                                    return '';
                                }
                            }
                        }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'Θερμοκρασία (°C)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Σφάλμα κατά τη δημιουργία του γραφήματος μέσης θερμοκρασίας ανά ώρα:', error);
    }

}

// Όταν φορτώνει η σελίδα:
document.addEventListener('DOMContentLoaded', function() {
    // Αρχική φόρτωση δεδομένων
    loadDataAndUpdateCharts();

    // Κουμπί ανανέωσης
    document.getElementById('update-data').addEventListener('click', function() {
        loadDataAndUpdateCharts();
    });

    // Αλλαγή φίλτρου χρόνου από το dropdown
    document.getElementById('timeFilter').addEventListener('change', function() {
        loadDataAndUpdateCharts();
    });
});

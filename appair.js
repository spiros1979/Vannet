// Κουμπί "Ανανέωση δεδομένων"
document.getElementById('update-data').addEventListener('click', function() {
    loadDataAndUpdateCharts();
});

// Φόρτωση δεδομένων από Apps Script (JSON) και ενημέρωση γραφημάτων
function loadDataAndUpdateCharts() {

    // TODO: ΑΛΛΑΞΕ ΤΟ ΜΕ ΤΟ ΔΙΚΟ ΣΟΥ URL (Apps Script που επιστρέφει JSON με πεδίο aiq)
    const url = 'https://script.google.com/macros/s/AKfycbxd1U-hm2xo79srYB-o9AdgHBBCKOrbaL4fFzdJlXbzhpV08Sq8Tua6qk_5Q78cJWFZ/exec'; 

    fetch(url)
        .then(response => response.json())
        .then(data => {
            processAndDisplayData(data);
        })
        .catch(error => console.error('Σφάλμα κατά το fetch των δεδομένων (AIQ):', error));
}

// Μετατροπή string ημερομηνίας σε Date (υποστηρίζει "ημ/μην/έτος ώρα")
function parseDateString(dateString) {
    // Χωρίζουμε ημερομηνία και ώρα με βάση το κόμμα (αν υπάρχει)
    let [datePart, timePart] = dateString.split(', ');

    // Αν δεν υπάρχει κόμμα, δοκιμάζουμε με κενό
    if (!timePart) {
        [datePart, timePart] = dateString.split(' ');
    }

    // Ημερομηνία ΗΗ/ΜΜ/ΕΕΕΕ
    const [day, month, year] = datePart.split('/').map(Number);

    // Ώρα ΩΩ:ΛΛ:ΔΔ ή κενή
    let [hours, minutes, seconds] = [0, 0, 0];
    if (timePart) {
        [hours, minutes, seconds] = timePart.split(':').map(Number);
    }

    return new Date(year, month - 1, day, hours, minutes, seconds);
}

// Κύρια επεξεργασία δεδομένων AIQ + ενημέρωση HTML + προετοιμασία για Chart.js
function processAndDisplayData(data) {
    // Προ-επεξεργασία δεδομένων
    const processedData = data.map(row => {
        // Περιμένουμε πεδίο aiq από το JSON
        let aiq = row.aiq;

        if (typeof aiq === 'string') {
            aiq = parseFloat(aiq.replace(',', '.'));
        } else if (typeof aiq !== 'number') {
            console.error('Το πεδίο aiq δεν βρέθηκε ή δεν είναι έγκυρο:', row);
            aiq = NaN;
        }

        // Μετατροπή της ημερομηνίας (στήλη Data στο JSON)
        const parsedDate = new Date(row.Data);
        if (isNaN(parsedDate.getTime())) {
            console.error('Μη έγκυρη ημερομηνία:', row.Data);
        }

        return {
            ...row,
            Data: parsedDate, // Φροντίζουμε να είναι τύπου Date
            aiq: aiq          // Κανονικοποιημένη τιμή AIQ
        };
    });

    // Έλεγχος αν έχουμε έγκυρα δεδομένα AIQ
    if (processedData.every(row => isNaN(row.aiq))) {
        console.error('Όλες οι τιμές AIQ είναι μη έγκυρες.');
        return;
    }

    // Φιλτράρισμα δεδομένων με βάση το επιλεγμένο φίλτρο χρόνου
    const timeFilter = document.getElementById('timeFilter').value;
    const filteredDataMinuto = filterDataByTime(processedData, timeFilter);
    
    if (filteredDataMinuto.length === 0) {
        console.error('Δεν υπάρχουν δεδομένα AIQ μετά το φιλτράρισμα.');
        document.getElementById('latest-temp').textContent = 'Δεν υπάρχουν διαθέσιμα δεδομένα.';
        return;
    }

    // Τελευταία τιμή AIQ (πιο πρόσφατη εγγραφή)
    const latestAiq = filteredDataMinuto[filteredDataMinuto.length - 1].aiq;
    document.getElementById('latest-temp').textContent =
        `Τελευταία μέτρηση: ${latestAiq.toFixed(0)} (AIQ 0–100)`;

    // Τελευταία ώρα ενημέρωσης (τώρα)
    const lastUpdateTime = new Date().toLocaleString('el-GR', { hour12: false });
    document.getElementById('last-update').textContent =
        `Τελευταία ενημέρωση: ${lastUpdateTime}`;

    // Δεδομένα για 1ο γράφημα (AIQ ανά λεπτό)
    const labelsMinuto = filteredDataMinuto.map(row => row.Data.toLocaleString('el-GR'));
    const dataMinuto = filteredDataMinuto.map(row => row.aiq);

    // Δεδομένα για 2ο γράφημα (μέσος AIQ ανά ώρα + confidence intervals)
    const hourlyData = aggregateHourly(filteredDataMinuto);
    const labelsOra = hourlyData.map(row => row.label);
    const dataOra = hourlyData.map(row => row.meanAiq);
    const ciUpper = hourlyData.map(row => row.ciUpper);
    const ciLower = hourlyData.map(row => row.ciLower);

    // Ενημέρωση γραφημάτων
    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

// Φιλτράρισμα δεδομένων με βάση το επιλεγμένο χρονικό παράθυρο
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
            return data; // "Όλα τα δεδομένα"
    }

    const filteredData = data.filter(row =>
        row.Data.getTime() >= (lastTimestamp - timeFrame)
    );

    console.log(`Φιλτραρισμένα δεδομένα (${filter}):`, filteredData);
    return filteredData;
}

// Ομαδοποίηση δεδομένων ανά ώρα & υπολογισμός μέσου AIQ + 95% CI
function aggregateHourly(data) {
    const grouped = data.reduce((acc, curr) => {
        const hour = curr.Data.getHours();
        const date = curr.Data.toLocaleDateString('el-GR');
        const key = `${date} ${hour}:00`;

        if (!acc[key]) {
            acc[key] = [];
        }

        acc[key].push(curr.aiq);
        return acc;
    }, {});

    return Object.keys(grouped).map(key => {
        const values = grouped[key];
        const meanAiq = values.reduce((a, b) => a + b, 0) / values.length;

        // Τυπικό σφάλμα
        const stdErr = Math.sqrt(
            values.reduce((sum, val) => sum + Math.pow(val - meanAiq, 2), 0) /
            (values.length - 1)
        ) / Math.sqrt(values.length);

        const ci95 = 1.96 * stdErr;

        return {
            label: key,
            meanAiq,
            ciUpper: meanAiq + ci95,
            ciLower: meanAiq - ci95
        };
    });
}

// Δημιουργία / ενημέρωση των 2 γραφημάτων AIQ
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {
    const minutoCtx = document.getElementById('minutoChart').getContext('2d');
    const oraCtx = document.getElementById('oraChart').getContext('2d');

    // Καταστροφή παλιών charts αν υπάρχουν
    if (window.minutoChart && typeof window.minutoChart.destroy === 'function') {
        window.minutoChart.destroy();
    }

    if (window.oraChart && typeof window.oraChart.destroy === 'function') {
        window.oraChart.destroy();
    }

    // -------- 1ο Γράφημα: AIQ ανά λεπτό --------
    try {
        window.minutoChart = new Chart(minutoCtx, {
            type: 'line',
            data: {
                labels: labelsMinuto,
                datasets: [{
                    label: 'AIQ (0–100)',
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
                                // Εμφάνιση ετικέτας ανά 10 σημεία
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
                        title: { display: true, text: 'AIQ (0–100)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Σφάλμα κατά τη δημιουργία του γραφήματος AIQ λεπτό-λεπτό:', error);
    }

    // -------- 2ο Γράφημα: Μέσος AIQ ανά ώρα + 95% CI --------
    try {
        window.oraChart = new Chart(oraCtx, {
            type: 'line',
            data: {
                labels: labelsOra, 
                datasets: [
                    {
                        label: 'Μέσος AIQ ανά ώρα',
                        data: dataOra,
                        borderColor: 'rgba(153, 102, 255, 1)',
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: 'Διάστημα εμπιστοσύνης 95%',
                        data: ciUpper,
                        borderColor: 'rgba(255, 159, 64, 0.2)',
                        fill: '-1',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        borderWidth: 1,
                        pointRadius: 0
                    },
                    {
                        label: 'Διάστημα εμπιστοσύνης 95%',
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
                                    return datePart; // μόνο η ημερομηνία
                                } else {
                                    return '';
                                }
                            }
                        }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'AIQ (0–100)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Σφάλμα κατά τη δημιουργία του γραφήματος μέσου AIQ ανά ώρα:', error);
    }

}

// Όταν φορτώνει η σελίδα
document.addEventListener('DOMContentLoaded', function() {
    // Αρχική φόρτωση δεδομένων
    loadDataAndUpdateCharts();

    // Κουμπί "Ανανέωση"
    document.getElementById('update-data').addEventListener('click', function() {
        loadDataAndUpdateCharts();
    });

    // Αλλαγή φίλτρου χρόνου
    document.getElementById('timeFilter').addEventListener('change', function() {
        loadDataAndUpdateCharts();
    });
});

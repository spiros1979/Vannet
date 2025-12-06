// Όταν πατηθεί το κουμπί "Ανανέωση" (εικονίδιο με τα βελάκια)
document.getElementById('update-data').addEventListener('click', function() {
    loadDataAndUpdateCharts();
});

// Κύρια συνάρτηση: διαβάζει δεδομένα από το Apps Script και ενημερώνει τα γραφήματα πίεσης
function loadDataAndUpdateCharts() {
    // URL του Google Apps Script σε mode=read (JSON για τα γραφήματα)
    const url = 'https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec?mode=read';

    fetch(url)
        .then(response => response.json())
        .then(data => {
            processAndDisplayData(data);
        })
        .catch(error => console.error('Σφάλμα κατά το fetch των δεδομένων:', error));
}

// Βοηθητική συνάρτηση: μετατρέπει string "dd/MM/yyyy HH:mm:ss" σε Date
function parseDateString(dateString) {
    let [datePart, timePart] = dateString.split(' ');

    const [day, month, year] = datePart.split('/').map(Number);

    let [hours, minutes, seconds] = [0, 0, 0];
    if (timePart) {
        [hours, minutes, seconds] = timePart.split(':').map(Number);
    }

    return new Date(year, month - 1, day, hours, minutes, seconds);
}

// Επεξεργασία δεδομένων και ενημέρωση κειμένων + γραφημάτων πίεσης
function processAndDisplayData(data) {
    // 1) Προεπεξεργασία δεδομένων (τύποι, ημερομηνία κλπ.)
    const processedData = data.map(row => {
        let pressione = row.Pressione;

        // Μετατροπή σε float αν είναι string (με κόμμα ή τελεία)
        if (typeof pressione === 'string') {
            pressione = parseFloat(pressione.replace(',', '.'));
        } else if (typeof pressione !== 'number') {
            console.error('Πεδίο Pressione δεν είναι έγκυρο:', row);
            pressione = NaN;
        }

        // Μετατροπή ημερομηνίας
        const parsedDate = parseDateString(row.Data);
        if (isNaN(parsedDate.getTime())) {
            console.error('Μη έγκυρη ημερομηνία:', row.Data);
        }

        return {
            ...row,
            Data: parsedDate,   // Date object
            Pressione: pressione
        };
    });

    // 2) Αν όλες οι πιέσεις είναι NaN, σταματάμε
    if (processedData.every(row => isNaN(row.Pressione))) {
        console.error('Όλες οι τιμές πίεσης είναι μη έγκυρες.');
        document.getElementById('latest-temp').textContent = 'Δεν υπάρχουν διαθέσιμα δεδομένα.';
        return;
    }

    // 3) Φιλτράρισμα ανάλογα με το φίλτρο χρόνου (1h, 3h, 6h, 12h, 24h, όλα)
    const timeFilter = document.getElementById('timeFilter').value;
    const filteredDataMinuto = filterDataByTime(processedData, timeFilter);

    if (filteredDataMinuto.length === 0) {
        console.error('Δεν υπάρχουν δεδομένα μετά το φιλτράρισμα.');
        document.getElementById('latest-temp').textContent = 'Δεν υπάρχουν διαθέσιμα δεδομένα.';
        return;
    }

    // 4) Τελευταία πίεση
    const latestPress = filteredDataMinuto[filteredDataMinuto.length - 1].Pressione;
    document.getElementById('latest-temp').textContent =
        `Τελευταία πίεση: ${latestPress.toFixed(2)} hPa`;

    // 5) Τελευταία ενημέρωση (ώρα συστήματος)
    const lastUpdateTime = new Date().toLocaleString('el-GR', { hour12: false });
    document.getElementById('last-update').textContent =
        `Τελευταία ενημέρωση: ${lastUpdateTime}`;

    // 6) Δεδομένα για 1ο γράφημα (ανά δείγμα)
    const labelsMinuto = filteredDataMinuto.map(
        row => row.Data.toLocaleString('el-GR', { hour12: false })
    );
    const dataMinuto = filteredDataMinuto.map(row => row.Pressione);

    // 7) Δεδομένα για 2ο γράφημα (ωριαίος μέσος όρος με CI)
    const hourlyData = aggregateHourly(filteredDataMinuto);
    const labelsOra = hourlyData.map(row => row.label);
    const dataOra   = hourlyData.map(row => row.meanPress);
    const ciUpper   = hourlyData.map(row => row.ciUpper);
    const ciLower   = hourlyData.map(row => row.ciLower);

    // 8) Ενημέρωση γραφημάτων
    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

// Φιλτράρει δεδομένα με βάση το φίλτρο χρόνου
function filterDataByTime(data, filter) {
    const lastTimestamp = data[data.length - 1].Data.getTime();

    let timeFrame = 0;
    switch (filter) {
        case 'last24h':
            timeFrame = 24 * 60 * 60 * 1000;
            break;
        case 'last12h':
            timeFrame = 12 * 60 * 60 * 1000;
            break;
        case 'last6h':
            timeFrame = 6 * 60 * 60 * 1000;
            break;
        case 'last3h':
            timeFrame = 3 * 60 * 60 * 1000;
            break;
        case 'last1h':
            timeFrame = 1 * 60 * 60 * 1000;
            break;
        default:
            return data; // "all"
    }

    const filteredData = data.filter(row => row.Data.getTime() >= (lastTimestamp - timeFrame));
    console.log(`Δεδομένα πίεσης μετά το φιλτράρισμα (${filter}):`, filteredData);
    return filteredData;
}

// Ομαδοποίηση ανά ώρα + υπολογισμός μέσου όρου πίεσης και 95% CI
function aggregateHourly(data) {
    const grouped = data.reduce((acc, curr) => {
        const hour = curr.Data.getHours();
        const date = curr.Data.toLocaleDateString('el-GR');
        const key = `${date} ${hour}:00`;

        if (!acc[key]) {
            acc[key] = [];
        }

        acc[key].push(curr.Pressione);
        return acc;
    }, {});

    return Object.keys(grouped).map(key => {
        const values = grouped[key];
        const meanPress = values.reduce((a, b) => a + b, 0) / values.length;

        let stdErr = 0;
        if (values.length > 1) {
            const variance = values.reduce((sum, val) => sum + Math.pow(val - meanPress, 2), 0) / (values.length - 1);
            stdErr = Math.sqrt(variance) / Math.sqrt(values.length);
        }
        const ci95 = 1.96 * stdErr;

        return {
            label: key,
            meanPress,
            ciUpper: meanPress + ci95,
            ciLower: meanPress - ci95
        };
    });
}

// Δημιουργία / ενημέρωση των δύο γραφημάτων (πίεση ανά δείγμα & μέση πίεση ανά ώρα)
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {
    const minutoCtx = document.getElementById('minutoChart').getContext('2d');
    const oraCtx    = document.getElementById('oraChart').getContext('2d');

    if (window.minutoChart && typeof window.minutoChart.destroy === 'function') {
        window.minutoChart.destroy();
    }

    if (window.oraChart && typeof window.oraChart.destroy === 'function') {
        window.oraChart.destroy();
    }

    // 1ο γράφημα: πίεση ανά δείγμα
    try {
        window.minutoChart = new Chart(minutoCtx, {
            type: 'line',
            data: {
                labels: labelsMinuto,
                datasets: [{
                    label: 'Πίεση',
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
                        display: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: '' },
                        ticks: {
                            callback: function(value, index) {
                                if (index % 10 === 0) {
                                    const label = labelsMinuto[value];
                                    const parts = label.split(',');
                                    return parts[0] || label;
                                } else {
                                    return '';
                                }
                            }
                        }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'Πίεση (hPa)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Σφάλμα κατά τη δημιουργία του γραφήματος πίεσης λεπτό-λεπτό:', error);
    }

    // 2ο γράφημα: μέση πίεση ανά ώρα με 95% CI
    try {
        window.oraChart = new Chart(oraCtx, {
            type: 'line',
            data: {
                labels: labelsOra,
                datasets: [
                    {
                        label: 'Μέση πίεση ανά ώρα',
                        data: dataOra,
                        borderColor: 'rgba(153, 102, 255, 1)',
                        fill: false,
                        tension: 0.1,
                        pointRadius: 0
                    },
                    {
                        label: '95% CI',
                        data: ciUpper,
                        borderColor: 'rgba(255, 159, 64, 0.2)',
                        fill: '-1',
                        backgroundColor: 'rgba(255, 159, 64, 0.2)',
                        borderWidth: 1,
                        pointRadius: 0
                    },
                    {
                        label: '95% CI',
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
                            callback: function(value, index) {
                                if (index % 2 === 0) {
                                    const dateLabel = labelsOra[value];
                                    const [datePart] = dateLabel.split(' ');
                                    return datePart || dateLabel;
                                } else {
                                    return '';
                                }
                            }
                        }
                    },
                    y: {
                        display: true,
                        title: { display: true, text: 'Πίεση (hPa)' }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Σφάλμα κατά τη δημιουργία του γραφήματος μέσης πίεσης:', error);
    }
}

// Όταν φορτώσει η σελίδα πίεσης, φορτώνουμε δεδομένα και δένουμε τα events
document.addEventListener('DOMContentLoaded', function() {
    loadDataAndUpdateCharts();

    document.getElementById('update-data').addEventListener('click', function() {
        loadDataAndUpdateCharts();
    });

    document.getElementById('timeFilter').addEventListener('change', function() {
        loadDataAndUpdateCharts();
    });
});

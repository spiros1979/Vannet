// Όταν πατηθεί το κουμπί "Ανανέωση δεδομένων"
document.getElementById('update-data').addEventListener('click', function() {
    loadDataAndUpdateCharts();
});

// Φόρτωση δεδομένων από Apps Script (JSON) και ενημέρωση γραφημάτων
function loadDataAndUpdateCharts() {

    // TODO: Αργότερα θα αλλάξουμε αυτό το URL με το δικό σου Apps Script (JSON για πίεση)
    const url = 'https://script.google.com/macros/s/AKfycbxd1U-hm2xo79srYB-o9AdgHBBCKOrbaL4fFzdJlXbzhpV08Sq8Tua6qk_5Q78cJWFZ/exec'; 

    fetch(url)
        .then(response => response.json())
        .then(data => {
            processAndDisplayData(data);
        })
        .catch(error => console.error('Σφάλμα κατά το fetch των δεδομένων (πίεση):', error));
}

// Μετατροπή string ημερομηνίας σε αντικείμενο Date
function parseDateString(dateString) {
    // Πρώτα χωρίζουμε με κόμμα (αν υπάρχει)
    let [datePart, timePart] = dateString.split(', ');

    // Αν δεν βρεθεί κόμμα, δοκιμάζουμε με κενό
    if (!timePart) {
        [datePart, timePart] = dateString.split(' ');
    }

    // Ημερομηνία σε μορφή ΗΗ/ΜΜ/ΕΕΕΕ
    const [day, month, year] = datePart.split('/').map(Number);

    // Ώρα σε μορφή ΩΩ:ΛΛ:ΔΔ (αν λείπει, βάζουμε 0)
    let [hours, minutes, seconds] = [0, 0, 0];
    if (timePart) {
        [hours, minutes, seconds] = timePart.split(':').map(Number);
    }

    return new Date(year, month - 1, day, hours, minutes, seconds);
}

// Κύρια επεξεργασία δεδομένων + ενημέρωση HTML + προετοιμασία για Chart.js
function processAndDisplayData(data) {
    // Προ-επεξεργασία δεδομένων
    const processedData = data.map(row => {
        let pressione = row.Pressione;  // ΠΕΔΙΟ "Pressione" από το JSON (μην το αλλάξεις εδώ)

        if (typeof pressione === 'string') {
            pressione = parseFloat(pressione.replace(',', '.'));
        } else if (typeof pressione !== 'number') {
            console.error('Το πεδίο Pressione δεν βρέθηκε ή δεν είναι έγκυρο:', row);
            pressione = NaN;  // Σημάδεψε ως μη έγκυρο
        }

        // Μετατροπή ημερομηνίας από το πεδίο Data
        const parsedDate = new Date(row.Data);
        if (isNaN(parsedDate.getTime())) {
            console.error('Μη έγκυρη ημερομηνία:', row.Data);
        }

        return {
            ...row,
            Data: parsedDate,
            Pressione: pressione
        };
    });

    // Έλεγχος αν υπάρχουν έγκυρες τιμές πίεσης
    if (processedData.every(row => isNaN(row.Pressione))) {
        console.error('Όλες οι τιμές πίεσης είναι μη έγκυρες.');
        return;
    }

    // Φιλτράρισμα δεδομένων με βάση το επιλεγμένο χρονικό φίλτρο
    const timeFilter = document.getElementById('timeFilter').value;
    const filteredDataMinuto = filterDataByTime(processedData, timeFilter);
    
    if (filteredDataMinuto.length === 0) {
        console.error('Δεν υπάρχουν δεδομένα μετά το φιλτράρισμα.');
        document.getElementById('latest-temp').textContent = 'Δεν υπάρχουν διαθέσιμα δεδομένα.';
        return;
    }

    // Τελευταία μέτρηση πίεσης (πιο πρόσφατη)
    const latestPress = filteredDataMinuto[filteredDataMinuto.length - 1].Pressione;
    document.getElementById('latest-temp').textContent =
        `Τελευταία πίεση: ${latestPress.toFixed(2)} hPa`;

    // Τελευταία ώρα ενημέρωσης (τώρα)
    const lastUpdateTime = new Date().toLocaleString('el-GR', { hour12: false });
    document.getElementById('last-update').textContent =
        `Τελευταία ενημέρωση: ${lastUpdateTime}`;

    // Δεδομένα για 1ο γράφημα (πίεση ανά λεπτό)
    const labelsMinuto = filteredDataMinuto.map(row => row.Data.toLocaleString('el-GR'));
    const dataMinuto = filteredDataMinuto.map(row => row.Pressione);

    // Δεδομένα για 2ο γράφημα (μέση πίεση ανά ώρα + confidence intervals)
    const hourlyData = aggregateHourly(filteredDataMinuto);
    const labelsOra = hourlyData.map(row => row.label);
    const dataOra = hourlyData.map(row => row.meanTemp);
    const ciUpper = hourlyData.map(row => row.ciUpper);
    const ciLower = hourlyData.map(row => row.ciLower);

    // Ενημέρωση γραφημάτων
    updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower);
}

// Φιλτράρισμα δεδομένων με βάση χρονικό παράθυρο
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
            return data; // Όλα τα δεδομένα
    }

    const filteredData = data.filter(row =>
        row.Data.getTime() >= (lastTimestamp - timeFrame)
    );
    console.log(`Φιλτραρισμένα δεδομένα (${filter}):`, filteredData);
    return filteredData;
}

// Ομαδοποίηση ανά ώρα + μέση πίεση + 95% διάστημα εμπιστοσύνης
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
        const meanTemp = values.reduce((a, b) => a + b, 0) / values.length;

        // Τυπικό σφάλμα
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

// Δημιουργία / ενημέρωση των 2 γραφημάτων πίεσης
function updateCharts(labelsMinuto, dataMinuto, labelsOra, dataOra, ciUpper, ciLower) {
    const minutoCtx = document.getElementById('minutoChart').getContext('2d');
    const oraCtx = document.getElementById('oraChart').getContext('2d');

    // Καταστροφή παλιών charts (αν υπάρχουν)
    if (window.minutoChart && typeof window.minutoChart.destroy === 'function') {
        window.minutoChart.destroy();
    }

    if (window.oraChart && typeof window.oraChart.destroy === 'function') {
        window.oraChart.destroy();
    }

    // -------- 1ο γράφημα: Πίεση ανά λεπτό --------
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
                        display: false // Απόκρυψη legend
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: { display: true, text: '' },
                        ticks: {
                            callback: function(value, index, ticks) {
                                // Εμφάνιση ετικέτας κάθε 10 σημεία
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

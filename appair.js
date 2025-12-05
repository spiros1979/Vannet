// Κουμπί ανανέωσης (εικονίδιο)
document.getElementById('update-data').addEventListener('click', function() {
    loadDataAndUpdateCharts();
});

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
    let [datePart, timePart] = dateString.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);

    let [hours, minutes, seconds] = [0, 0, 0];
    if (timePart) {
        [hours, minutes, seconds] = timePart.split(':').map(Number);
    }
    return new Date(year, month - 1, day, hours, minutes, seconds);
}

// -------------------------------------------------------------
// Επεξεργασία & εμφάνιση δεδομένων (Gas + AIQ + 2 γραφήματα)
// -------------------------------------------------------------
function processAndDisplayData(data) {

    // Προεπεξεργασία δεδομένων
    const processedData = data.map(row => {
        let gasVal = row.gas;

        if (typeof gasVal === 'str

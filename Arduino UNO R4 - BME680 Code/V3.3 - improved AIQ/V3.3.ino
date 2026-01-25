// V3.3 με βελτιωμένο υπολογισμό AIQ (Gas + Humidity compensation)
// Βασισμένο στο V3.2.ino 

#include <Wire.h>
#include <WiFiS3.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>
#include <WiFiUdp.h>
#include <NTPClient.h>

// ---- ΡΥΘΜΙΣΕΙΣ WiFi ----
const char* ssid     = "Devices";
const char* password = "2109347761";

// ---- ΡΥΘΜΙΣΕΙΣ Google Apps Script ----
const char* scriptHost = "script.google.com";
String scriptPath = "/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec";

// ---- AIQ Όρια (0–100) ----
// ΣΗΜΕΙΩΣΗ: Στο BME680, ΥΨΗΛΗ αντίσταση = ΚΑΘΑΡΟΣ αέρας
// Αυτές οι σταθερές χρησιμοποιούνται πλέον στον νέο αλγόριθμο
const float GAS_CEILING = 50.0;   // kΩ = Άριστος αέρας (Οροφή)
const float GAS_FLOOR   = 5.0;    // kΩ = Πολύ κακός αέρας (Δάπεδο)
// Κρατάμε και τις παλιές αν χρειάζεται για συμβατότητα, αλλά ο υπολογισμός άλλαξε.
// const float GAS_MIN = 5.0; 
// const float GAS_MAX = 80.0; 

// ---- BME680 ----
Adafruit_BME680 bme;
bool bme_ok = false;

// ---- NTP / Ώρα ----
WiFiUDP ntpUDP;
// Όffσet ώρας (π.χ. UTC+2)
const long utcOffsetInSeconds = 2L * 3600L;

// NTP client
NTPClient timeClient(ntpUDP, "pool.ntp.org", utcOffsetInSeconds, 3600000);

// Για να θυμόμαστε πότε στείλαμε τελευταία φορά
int lastSentHour   = -1;
int lastSentMinute = -1;

// ΠΡΟΔΗΛΩΣΗ
void sendToGoogle(float temperature, float humidity, float pressure, float gas_kohm, float aiq);
void takeMeasurementAndSend();
float calculateAIQ(float gas_kohm, float humidity);

void setup() {
  Serial.begin(115200);
  delay(1000);
  // Διατηρούμε το μήνυμα όσο πιο κοντά γίνεται στο V3.2, αλλά αλλάζουμε το Version
  Serial.println("Ξεκινάω UNO R4 WiFi + BME680 + Google Script (αρχική αποστολή + στις :00 και :30)..."); 

  // --- BME680 ---
  Wire.begin();

  Serial.println("Ψάχνω για BME680 στο I2C (0x76)...");
  if (!bme.begin(0x76)) {   // 0x76 για τον Pimoroni
    Serial.println("BME680 ΔΕΝ βρέθηκε!");
    bme_ok = false;
  } else {
    Serial.println("BME680 OK (0x76)");
    bme_ok = true;

    bme.setTemperatureOversampling(BME680_OS_8X);
    bme.setHumidityOversampling(BME680_OS_2X);
    bme.setPressureOversampling(BME680_OS_4X);
    bme.setIIRFilterSize(BME680_FILTER_SIZE_3);
    bme.setGasHeater(320, 150);  // θερμαντήρας gas sensor
  }

  // --- WiFi ---
  Serial.print("Σύνδεση σε WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    Serial.print(".");
    delay(500);
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi OK!");

    // Retry για IP (UNO R4 καμιά φορά αργεί)
    IPAddress ip = WiFi.localIP();
    Serial.print("IP αρχικά: ");
    Serial.println(ip);

    int tries = 0;
    while (ip == IPAddress(0, 0, 0, 0) && tries < 20) {
      delay(500);
      ip = WiFi.localIP();
      Serial.print("Ξαναδιαβάζω IP: ");
      Serial.println(ip);
      tries++;
    }

    Serial.print("Τελική IP: ");
    Serial.println(ip);

    // --- NTP TIME ---
    timeClient.begin();
    Serial.print("Συγχρονισμός ώρας μέσω NTP");
    unsigned long tStart = millis();
    while (!timeClient.update() && millis() - tStart < 15000) {
      Serial.print(".");
      delay(500);
    }
    Serial.println();

    if (!timeClient.isTimeSet()) {
      Serial.println("ΠΡΟΕΙΔΟΠΟΙΗΣΗ: Δεν μπόρεσα να πάρω ώρα από NTP. Θα προσπαθώ ξανά στο loop.");
    } else {
      Serial.print("Ώρα (τοπική offset): ");
      Serial.print(timeClient.getHours());
      Serial.print(":");
      Serial.println(timeClient.getMinutes());
    }

  } else {
    Serial.println("WiFi ΔΕΝ συνδέθηκε (timeout). Θα γίνει προσπάθεια σε αποστολή.");
  }

  // 👉 ΠΡΩΤΗ ΑΠΟΣΤΟΛΗ ΜΕ ΤΗΝ ΕΝΑΡΞΗ
  takeMeasurementAndSend();

  // Αποθηκεύουμε την ώρα της πρώτης αποστολής, αν υπάρχει
  if (timeClient.isTimeSet()) {
    lastSentHour   = timeClient.getHours();
    lastSentMinute = timeClient.getMinutes();
  }
}

void loop() {
  // Προσπαθούμε να κρατάμε την ώρα φρέσκια
  timeClient.update();

  if (timeClient.isTimeSet()) {
    int h = timeClient.getHours();
    int m = timeClient.getMinutes();
    int s = timeClient.getSeconds();

    // Στείλε στις :00 και :30, μόνο μία φορά ανά λεπτό
    if ((m == 0 || m == 30) &&
        (h != lastSentHour || m != lastSentMinute) &&
        s < 10) {

      Serial.println();
      Serial.println("===== ΝΕΑ ΜΕΤΡΗΣΗ & ΑΠΟΣΤΟΛΗ (στις :00 ή :30) =====");
      takeMeasurementAndSend();

      lastSentHour   = h;
      lastSentMinute = m;
    }

  } else {
    // Αν χάσαμε την ώρα, ξαναπροσπαθούμε περιοδικά
    static unsigned long lastTry = 0;
    if (millis() - lastTry > 10000) {
      Serial.println("Δεν έχω ώρα από NTP ακόμα, ξαναπροσπαθώ...");
      timeClient.update();
      lastTry = millis();
    }
  }

  delay(200);
}

// -------------------------------------------------------------------------
// ΝΕΟΣ ΥΠΟΛΟΓΙΣΜΟΣ AIQ (0-100, 0=Άριστο, 100=Πολύ Κακό)
// -------------------------------------------------------------------------
float calculateAIQ(float gas_kohm, float humidity) {
  // 1. Gas Score (75% βαρύτητα)
  // Υψηλή αντίσταση (>50k) -> Καθαρός αέρας -> Score κοντά στο 0
  // Χαμηλή αντίσταση (<5k) -> Μολυσμένος αέρας -> Score κοντά στο 75
  
  float gasScore = 0.0;
  if (gas_kohm >= GAS_CEILING) {
    gasScore = 0.0; // Άριστα
  } else if (gas_kohm <= GAS_FLOOR) {
    gasScore = 75.0; // Μέγιστο κακό από αέριο
  } else {
    // ratio 0 -> gas=floor -> score 75.
    // ratio 1 -> gas=ceiling -> score 0.
    float ratio = (gas_kohm - GAS_FLOOR) / (GAS_CEILING - GAS_FLOOR);
    gasScore = (1.0 - ratio) * 75.0;
  }

  // 2. Humidity Score (25% βαρύτητα)
  // Ιδανική υγρασία: 40%. Απόκλιση προσθέτει "πόντους" (χειροτερεύει το AIQ)
  float humScore = 0.0;
  float diff = 0.0;
  if (humidity >= 38 && humidity <= 42) {
    humScore = 0.0; // Ιδανική ζώνη
  } else {
    if (humidity < 38) diff = 38 - humidity;
    else diff = humidity - 42;
    // Αν diff = 60 (π.χ. 100% hum), θέλουμε score 25.
    // Άρα συντελεστής = 25 / 60 = ~0.416
    humScore = diff * 0.416;
    if (humScore > 25.0) humScore = 25.0; 
  }

  float finalAIQ = gasScore + humScore;
  if (finalAIQ > 100.0) finalAIQ = 100.0;
  if (finalAIQ < 0.0) finalAIQ = 0.0;

  return finalAIQ;
}


// ------------------------
// Συνάρτηση: Μέτρηση + Αποστολή
// ------------------------
void takeMeasurementAndSend() {
  if (!bme_ok) {
    Serial.println("Δεν υπάρχει BME680, παράλειψη αποστολής.");
    return;
  }

  if (!bme.performReading()) {
    Serial.println("Σφάλμα ανάγνωσης BME680.");
    return;
  }

  float temperature = bme.temperature;              // °C
  float humidity    = bme.humidity;                 // %
  float pressure    = bme.pressure / 100.0;         // hPa
  float gas_kohm    = bme.gas_resistance / 1000.0;  // kΩ

  // -------- ΑΛΛΑΓΗ ΕΔΩ: ΝΕΟΣ ΥΠΟΛΟΓΙΣΜΟΣ --------
  float aiq = calculateAIQ(gas_kohm, humidity);
  // ----------------------------------------------

  // ΕΜΦΑΝΙΣΕ ΜΕΤΡΗΣΕΙΣ στο Serial Monitor (ίδιο format με V3.2 για να μην έχει αλλαγές)
  Serial.println();
  Serial.println("----- ΝΕΑ ΜΕΤΡΗΣΗ -----");
  Serial.print("Θερμοκρασία: "); Serial.print(temperature); Serial.println(" °C");
  Serial.print("Υγρασία:    ");  Serial.print(humidity);    Serial.println(" %");
  Serial.print("Πίεση:      ");  Serial.print(pressure);    Serial.println(" hPa");
  Serial.print("Gas:        ");  Serial.print(gas_kohm);    Serial.println(" kΩ");
  Serial.print("AIQ:        ");  Serial.print(aiq);         Serial.println(" (0–100)");
  Serial.println("-----------------------");

  // ΣΤΕΙΛΕ στο Google Script
  sendToGoogle(temperature, humidity, pressure, gas_kohm, aiq);
}

// ------------------------
// Συνάρτηση: Αποστολή στο Google Script
// ------------------------
void sendToGoogle(float temperature, float humidity, float pressure, float gas_kohm, float aiq) {
  // Έλεγχος WiFi – αν έχει πέσει, προσπαθούμε να ξανασυνδεθούμε
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi χάθηκε → επανασύνδεση...");
    WiFi.begin(ssid, password);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
      Serial.print(".");
      delay(500);
    }
    Serial.println();
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("Αποτυχία επανασύνδεσης, δεν στέλνω δεδομένα.");
      return;
    }
  }

  WiFiSSLClient client;

  Serial.println("Σύνδεση στο script.google.com...");
  if (!client.connect(scriptHost, 443)) {
    Serial.println("Αποτυχία σύνδεσης στο script.google.com");
    client.stop();
    return;
  }

  // Φτιάχνουμε URL με τις παραμέτρους για το write mode
  // EXACTLY AS IN V3.2
  String url = scriptPath;
  url += "?mode=write";
  url += "&temp=";   url += String(temperature, 2);
  url += "&hum=";    url += String(humidity, 2);
  url += "&press=";  url += String(pressure, 2);
  url += "&gas=";    url += String(gas_kohm, 2);
  url += "&aiq=";    url += String(aiq, 0);   // AIQ χωρίς δεκαδικά (όπως V3.2)

  // DEBUG: εκτύπωση πλήρους URL
  Serial.print("URL που στέλνω: ");
  Serial.println(url);

  Serial.print("Αποστολή GET στο Apps Script... ");

  // Στέλνουμε HTTP GET
  client.print(String("GET ") + url + " HTTP/1.1\r\n" +
               "Host: " + scriptHost + "\r\n" +
               "Connection: close\r\n\r\n");

  // Περιμένουμε απάντηση
  unsigned long timeout = millis();
  while (client.available() == 0 && millis() - timeout < 10000) {}

  if (client.available()) {
    // Διαβάζουμε την πρώτη γραμμή (status line)
    String statusLine = client.readStringUntil('\n');
    statusLine.trim();
    Serial.print("HTTP status: ");
    Serial.println(statusLine);

    // Διαβάζουμε και αγνοούμε τα υπόλοιπα headers/body
    while (client.available()) {
      client.read();
    }

    // Θεωρούμε επιτυχία 200 ή 302
    if (statusLine.indexOf("200") != -1 || statusLine.indexOf("302") != -1) {
      Serial.println("OK (200 ή 302)");
    } else {
      Serial.println("ΠΡΟΒΛΗΜΑ: Ούτε 200 ούτε 302!");
    }

  } else {
    Serial.println("ΑΠΟΤΥΧΙΑ (timeout, δεν ήρθε απάντηση)");
  }

  client.stop();
  Serial.println("Τέλος αποστολής προς Google Script.");
}

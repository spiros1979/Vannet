#include <Wire.h>
#include <WiFiS3.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME680.h>

// ---- ΡΥΘΜΙΣΕΙΣ WiFi ----
const char* ssid     = "Devices";
const char* password = "2109347761";

// ---- ΡΥΘΜΙΣΕΙΣ Google Apps Script ----
// ΠΛΗΡΕΣ URL (για write & read):
// https://script.google.com/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec
const char* scriptHost = "script.google.com";
String scriptPath = "/macros/s/AKfycbwF74IEhl8fC3evudqC1DGk4jd_r_PBh9_Ay2Pq8JzAf6RryAxLcmG4w7SYCW3nqk15pw/exec";

// ---- AIQ Όρια (0–100) ----
const float GAS_MIN = 5.0;    // kΩ = πολύ κακός αέρας
const float GAS_MAX = 80.0;   // kΩ = πολύ καλός αέρας

// ---- BME680 ----
Adafruit_BME680 bme;
bool bme_ok = false;

// Χρόνος τελευταίας αποστολής (σε ms)
unsigned long lastSendMillis = 0;
// Διάστημα αποστολής: 2 λεπτά = 120.000 ms
const unsigned long sendInterval = 120000UL;

// ΠΡΟΔΗΛΩΣΗ
void sendToGoogle(float temperature, float humidity, float pressure, float gas_kohm, float aiq);
void takeMeasurementAndSend();

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Ξεκινάω UNO R4 WiFi + BME680 + Google Script (αρχική αποστολή + ανά 2 λεπτά)...");

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
  } else {
    Serial.println("WiFi ΔΕΝ συνδέθηκε (timeout). Θα γίνει προσπάθεια σε αποστολή.");
  }

  // 👉 ΠΡΩΤΗ ΑΠΟΣΤΟΛΗ ΜΕ ΤΗΝ ΕΝΑΡΞΗ
  takeMeasurementAndSend();

  // Από εδώ και πέρα, οι επόμενες αποστολές θα γίνονται ανά 2 λεπτά
  lastSendMillis = millis();
}

void loop() {
  unsigned long now = millis();

  // Αν έχουν περάσει τουλάχιστον 2 λεπτά...
  if (now - lastSendMillis >= sendInterval) {
    lastSendMillis = now;  // ανανέωση “τελευταίας αποστολής”

    Serial.println();
    Serial.println("===== ΝΕΑ ΜΕΤΡΗΣΗ & ΑΠΟΣΤΟΛΗ (ανά 2 λεπτά) =====");

    takeMeasurementAndSend();
  }

  delay(200);
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

  // ΥΠΟΛΟΓΙΣΜΟΣ AIQ (0–100) – απλή γραμμική κλίμακα
  float aiq = (gas_kohm - GAS_MIN) / (GAS_MAX - GAS_MIN) * 100.0;
  if (aiq < 0)   aiq = 0;
  if (aiq > 100) aiq = 100;

  // ΕΜΦΑΝΙΣΕ ΜΕΤΡΗΣΕΙΣ στο Serial Monitor
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
  String url = scriptPath;
  url += "?temp=";   url += String(temperature, 2);
  url += "&hum=";    url += String(humidity, 2);
  url += "&press=";  url += String(pressure, 2);
  url += "&gas=";    url += String(gas_kohm, 2);
  url += "&aiq=";    url += String(aiq, 0);   // AIQ χωρίς δεκαδικά

  Serial.print("Αποστολή GET στο Apps Script... ");

  // Στέλνουμε HTTP GET
  client.print(String("GET ") + url + " HTTP/1.1\r\n" +
               "Host: " + scriptHost + "\r\n" +
               "Connection: close\r\n\r\n");

  // Περιμένουμε απάντηση (αλλά δεν την τυπώνουμε αναλυτικά)
  unsigned long timeout = millis();
  while (client.available() == 0 && millis() - timeout < 10000) {}

  if (client.available()) {
    while (client.available()) {
      client.read();   // αγνοούμε bytes
    }
    Serial.println("OK");
  } else {
    Serial.println("ΑΠΟΤΥΧΙΑ (timeout)");
  }

  client.stop();
  Serial.println("Τέλος αποστολής προς Google Script.");
}

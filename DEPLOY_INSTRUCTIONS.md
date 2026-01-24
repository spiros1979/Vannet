# Οδηγίες Push στο Branch: Antigravity-Version

Εφόσον υπάρχει ήδη το repo και το branch, ακολούθησε αυτά τα βήματα στο τερματικό σου (PowerShell/CMD).

### Βήμα 1: Ρύθμιση του Remote (Σύνδεση με το υπάρχον repo)
Σιγουρέψου ότι το git "βλέπει" το σωστό URL. Τρέξε:

```powershell
git remote remove origin
git remote add origin https://github.com/spiros1979/Vannet.git
```

### Βήμα 2: Κατέβασμα των τελευταίων αλλαγών
Πρώτα πρέπει να ενημερώσουμε το git για τα branches που υπάρχουν στο GitHub:

```powershell
git fetch origin
```

### Βήμα 3: Επιλογή του σωστού Branch
Πρέπει να αλλάξουμε στο branch `Antigravity-Version`.

```powershell
# Αν είσαι ήδη σε αυτό, δεν πειράζει.
# Αν δεν το έχεις τοπικά, αυτό θα το δημιουργήσει και θα το συνδέσει με το remote.
git checkout -B Antigravity-Version origin/Antigravity-Version
```
*(Αν το παραπάνω βγάλει λάθος ότι δεν υπάρχει, κάνε απλά `git checkout -b Antigravity-Version`)*

### Βήμα 4: Προσθήκη και Ανέβασμα των Αρχείων
Τώρα που είσαι στο σωστό branch, πρόσθεσε τις αλλαγές μας:

```powershell
# 1. Προσθήκη όλων των αλλαγών (PWA, Notifications, UI, Settings)
git add .

# 2. Commit
git commit -m "Update Antigravity-Version: PWA, Notifications, Smart Settings, UI Polish"

# 3. Push (Ανέβασμα) στο συγκεκριμένο branch
git push origin Antigravity-Version
```

### Συνοπτικά (για copy-paste):
```powershell
git remote remove origin
git remote add origin https://github.com/spiros1979/Vannet.git
git fetch origin
git checkout -B Antigravity-Version origin/Antigravity-Version
git add .
git commit -m "Final Update: PWA & Smart Features"
git push origin Antigravity-Version
```

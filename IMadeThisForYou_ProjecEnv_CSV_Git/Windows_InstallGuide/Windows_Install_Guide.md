# AlgorithmicMirror_Collage — Windows Gallery Install Guide

This guide covers migrating the app from the Mac dev environment to the
gallery's Windows machine using a **portable, self-contained Node.js**
setup — nothing installed system-wide on the gallery machine.

Everything referenced here (the guide itself, the portable Node runtime,
and the two launcher scripts) lives inside the `Windows_InstallGuide`
folder, which sits alongside `Scripts_and_Archive` in the project root:

```
IMadeThisForYou_ProjEnv/
├── Scripts_and_Archive/
│   ├── Algorithmic_Mirror_Collage/   <- the app (main.js, sketch/, controls/, etc.)
│   └── Archive/                       <- video archive (main.js expects this as a sibling)
├── Windows_InstallGuide/
│   ├── Windows_Install_Guide.md
│   ├── Windows_Install_Guide.txt
│   ├── install.bat
│   ├── start.bat
│   ├── npmrc-template.txt
│   └── node-runtime/                  <- you add this (see Part A, Step 2)
├── Tidalcycles_Files/
└── Touchdesigner_Files/
```

The batch scripts use relative paths (`%~dp0..\Scripts_and_Archive\...`),
so this only works if the folder structure above stays intact when you
copy everything to the gallery machine. Don't rename or move
`Windows_InstallGuide` or `Scripts_and_Archive` relative to each other.

---

## PART A — Do this now, on your Mac

These steps don't need the gallery machine at all. Doing them now means
the only things left to do on-site are copying files and clicking two
scripts.

### A1. Check your Mac's Node version

In Terminal:

```bash
node -v
```

Note the exact version (e.g. `v20.11.1`). You'll download the matching
Windows build in the next step — using the same major version avoids
subtle npm/Electron behavior differences between your dev environment
and the gallery machine.

### A2. Download the portable Windows Node build

Go to nodejs.org's downloads and get the **Windows Binary (.zip)**, not
the `.msi` installer — you specifically want the zip, since that's the
one that doesn't run an installer or touch the Windows registry.

Direct URL pattern (swap in your version number from A1):

```
https://nodejs.org/dist/vX.Y.Z/node-vX.Y.Z-win-x64.zip
```

### A3. Extract and place it in Windows_InstallGuide

Unzip it, rename the extracted folder to exactly `node-runtime`, and
place it directly inside `Windows_InstallGuide` (see the folder diagram
above). The folder should contain `node.exe`, `npm.cmd`, `npx.cmd` at
its top level.

### A4. Add the two launcher scripts

Save `install.bat` and `start.bat` (provided alongside this guide) into
`Windows_InstallGuide`, next to `node-runtime`. Nothing to edit in them
unless your folder names differ from the diagram above.

### A5. (Optional) Keep npm's cache inside the project too

By default, npm still caches downloaded packages in a Windows
user-profile folder even when Node itself is portable — harmless
clutter, but not fully "contained." If you want the cache inside the
project as well, copy `npmrc-template.txt` into
`Scripts_and_Archive/Algorithmic_Mirror_Collage/` and rename it to
`.npmrc`. This tells npm to cache inside the app folder instead.

### A6. Verify your package.json has a start script

Open `Scripts_and_Archive/Algorithmic_Mirror_Collage/package.json` and
confirm there's a `"scripts"` entry like:

```json
"scripts": {
  "start": "electron ."
}
```

If `start` isn't defined, `start.bat` will fail — in that case, edit
`start.bat` to run `npx electron .` instead of `npm start` (a
commented-out line for this is already in the script).

### A7. Final structure check before you travel

Confirm the `Archive` folder sits exactly one level up from
`Algorithmic_Mirror_Collage` — that's what `main.js`'s
`path.join(__dirname, '..', 'Archive')` expects. If it's nested
differently on your drive, the app will launch but show zero videos.

---

## PART B — On-site, at the gallery Windows machine

### B1. Confirm the Windows environment

Just to have on record: check the Windows version (Settings → System →
About) and confirm you're not relying on any pre-existing Node
install — you're not, since everything's portable, but worth knowing
what's already on the machine in case of conflicts.

### B2. Transfer the project

Copy the whole `IMadeThisForYou_ProjEnv` folder (or at minimum
`Scripts_and_Archive` + `Windows_InstallGuide`, keeping them as
siblings) from your external drive onto the gallery machine.

### B3. Run install.bat

Double-click `install.bat` inside `Windows_InstallGuide`. This:
- Points a temporary PATH at your portable `node-runtime` folder
- Moves into `Algorithmic_Mirror_Collage`
- Runs `npm install`, fetching all dependencies (including a
  Windows-native Electron binary) — this step needs internet access
- Leaves the terminal window open with a "press any key" pause at the
  end so you can read any errors before it closes

Expect this to take a few minutes depending on the connection.

### B4. Run start.bat

Double-click `start.bat`. This launches the app the same way `npm
start` would on your Mac. Both the sketch window and controls window
should open.

---

## PART C — Testing sequence once it's running

1. Confirm the manifest loads — console output should list categories
   and file counts (visible if you keep the terminal window open).
2. Confirm videos actually play in the collage window, not just that
   the window opens.
3. Connect the MPD218 and test both pad selection and fader control.
4. Only after 1–3 check out, move into visual/experiential review —
   density, layout, performance on the gallery display — and decide
   from there whether `COLS` or anything else needs adjusting.

---

## Notes / things to double check if something goes wrong

- **"npm install" fails outright** — check the internet connection is
  actually reaching npm's registry (not just AV equipment on a local
  network) and that no proxy/firewall is blocking
  `registry.npmjs.org`.
- **App launches but no videos** — almost certainly the Archive folder
  isn't where `main.js` expects it (see A7).
- **MIDI controller not detected** — confirm Windows recognizes the
  MPD218 as a device at all (Device Manager) before troubleshooting
  the app itself.

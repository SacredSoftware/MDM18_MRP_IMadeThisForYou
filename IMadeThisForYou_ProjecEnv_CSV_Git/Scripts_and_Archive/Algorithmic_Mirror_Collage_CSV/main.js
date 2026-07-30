//------------Set Up Configuration----------------//
const { app, BrowserWindow, ipcMain } = require('electron'); 
const path = require('path'); 
const fs = require('fs'); 

let sketchWindow = null;
let controlsWindow = null;
let manifest = [];

//------------Scan Archive----------------//
function scanArchive() {
    const archivePath = path.join(__dirname, '..', 'Archive');
    const manifest = [];
    const categories = fs.readdirSync(archivePath).filter(name => {
        const fullPath = path.join(archivePath, name);
        return fs.statSync(fullPath).isDirectory();
    });

    for (const category of categories) {
        const videosPath = path.join(archivePath, category, 'videos');

        let files = [];
        if (fs.existsSync(videosPath)) {
            files = fs.readdirSync(videosPath)
                .filter(f => f.toLowerCase().endsWith('.mp4'));
        }

        manifest.push({
            label: category,
            path: videosPath,
            files: files
        });
    }

    return manifest;
}

//------------Generate Windows----------------//
function createWindows() {
    sketchWindow = new BrowserWindow ( {
        width: 1080,
        height: 1920,
        title: 'AlgorithmicMirror - Collage',
        backgroundColor: '#000000', 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, 
            nodeIntegration: false,
            webSecurity: false,
            allowFileAccessFromFiles: true
        }
    })

    controlsWindow = new BrowserWindow ( {
        width: 640,
        height: 480,
        title: 'AlgorithmicMirror — Controls', 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true, 
            nodeIntegration: false,
            webSecurity: false,
            allowFileAccessFromFiles: true
        }
    })

    sketchWindow.loadFile(path.join(__dirname, 'sketch/index.html'));
    controlsWindow.loadFile(path.join(__dirname, 'controls/controls.html'));

    sketchWindow.on('closed', () => {sketchWindow = null });
    controlsWindow.on('closed', () => {controlsWindow = null });
}

//------------IPC main.js listners----------------//
ipcMain.handle('get-manifest', () => {
    return manifest
});

ipcMain.on('weight-changed', (event, data) => {
  if (sketchWindow) sketchWindow.webContents.send('weight-changed', data);
});

ipcMain.on('grid-density-changed', (event, data) => {
  if (sketchWindow) sketchWindow.webContents.send('grid-density-changed', data);
});

ipcMain.on('reshuffle', (event, data) => {
  if (sketchWindow) sketchWindow.webContents.send('reshuffle', data);
});

//------------App Launch & Shut Down----------------//
app.whenReady().then(() => {
    manifest = scanArchive();
    console.log('Manifest Built:', manifest.length, 'categories');
    manifest.forEach(m => console.log(` ${m.label}: ${m.files.length} files`));
    createWindows();
});

app.on('window-all-closed', () => {
    if (process.platform !=='darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (sketchWindow === null && controlsWindow === null) {
        createWindows();
    }
})

//------------Set Up Variables----------------//
let manifest = []; 
let videos = [];

let ROWS = 6; 
let COLS = Math.round(ROWS * (16 / 9)); 
let TOTAL = COLS * ROWS; 
let preloadVideos = [];
let preloadStarted = []; 
const PRELOAD_LEAD_SECONDS = 2;

//------------Auto-Reload (mitigates long-running memory/decoder drift)----------------//
const RELOAD_INTERVAL_MS = 45 * 60 * 1000; // 45 min
setTimeout(() => {
    console.log('Auto-reload triggered at', new Date().toISOString());
    location.reload();
}, RELOAD_INTERVAL_MS);

//------------Adjusting Source Path Syntax-------------//
function joinPathForwardSlash(dirPath, fileName) {
    const normalizedDir = dirPath.replace(/\\/g, '/');
    return normalizedDir.replace(/\/+$/, '') + '/' + fileName;
}

function useCompressedFolder(dirPath){
    const normalizedDir = dirPath.replace(/\\/g, '/');
    return normalizedDir.replace(/\/videos\/?$/, '/videos_compressed');
}

//------------Building Sources Function----------------//
function buildSources() {
    let pool = []; 
    for (const entry of manifest) { 
        const compressedPath = useCompressedFolder(entry.path);
        for (const file of entry.files) { 
            pool.push(joinPathForwardSlash(compressedPath, file));
        }
    }
    pool = shuffleArray(pool);
    return pool.slice(0, TOTAL);
}

function pickRandomSource() {
    const entry = manifest[Math.floor(Math.random() * manifest.length)];
    if (!entry || entry.files.length === 0) return null;
    const file = entry.files[Math.floor(Math.random() * entry.files.length)];
    return joinPathForwardSlash(useCompressedFolder(entry.path), file);
}
    
//------------Shuffle Array & Dispose Video Functions----------------//
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function disposeVideo(v) {
    if (!v) return;
    const el = v.elt;
    el.onended = null;
    el.ontimeupdate = null;
    el.onerror = null;
    el.oncanplay = null;
    el.pause();
    el.removeAttribute('src');
    el.load();
    v.remove();
}

//------------Load & Play Functions----------------//
let isLoading = true; // true only during the very first fill

async function initialFill() {
    isLoading = true; 
    const sources = buildSources();
    const promises = sources.map(src => loadVideoAsync(src));
    videos = await Promise.all(promises);

    videos.forEach(v => {
        if (v) {
            v.volume(0);
            v.play(); // no looping for videos
        }
    });

    isLoading = false;
}

function loadVideoAsync(src) {
    return new Promise((resolve) => {
        let v = createVideo(src);
        v.hide();
        v.elt.oncanplay = () => resolve(v);
        v.elt.onerror = () => {
            console.warn('Video failed to load (decoder cap or bad file):', src);
            disposeVideo(v);
            resolve(null);
        };
    });
}

function loadCell(i) {
    const src = pickRandomSource();
    if (!src) return;
    loadVideoAsync(src).then(v => {
        if (!v) return;
        const old = videos[i];
        v.volume(0);
        v.play();
        videos[i] = v; 
        if (old) disposeVideo(old);
        watchForPreload(i);
        videos[i].elt.onended = () => swapCell(i);
    });
}

function watchForPreload(i){
    const el = videos[i].elt;
    el.ontimeupdate = () => {
        if (preloadStarted[i]) return;
        if (el.duration && (el.duration - el.currentTime) <= PRELOAD_LEAD_SECONDS) {
            preloadStarted[i] = true;
            beginPreload(i);
        }
    };
}

function beginPreload(i) {
    const src = pickRandomSource();
    if (!src) return;
    loadVideoAsync(src).then(v => {
        if (!v) {
            preloadStarted[i] = false; // allow a retry
            return;
        }
        v.volume(0);
        v.elt.pause();
        preloadVideos[i] = v;
    });
}

function swapCell(i){
    const old = videos[i];

    if (preloadVideos[i]) {
        videos[i] = preloadVideos[i];
        preloadVideos[i] = null;
        preloadStarted[i] = false;
        videos[i].play();
        if (old) disposeVideo(old);
        watchForPreload(i);
        videos[i].elt.onended = () => swapCell(i);
    } else {
        if (old) disposeVideo(old);
        loadCell(i); 
    }
}

//------------Setup & Draw Functions----------------//
async function setup() {
    createCanvas(windowWidth, windowHeight);
    background(0);

    manifest = await window.api.getManifest();

    preloadVideos = new Array(TOTAL).fill(null);
    preloadStarted = new Array(TOTAL).fill(false);

    await initialFill();

    for (let i = 0; i < videos.length; i++) {
        if (!videos[i]) continue;
        watchForPreload(i);
        videos[i].elt.onended = () => swapCell(i);
    }
}

function draw() {
    background(0);

    if (isLoading) { 
        fill(255);
        noStroke();
        textAlign(CENTER, CENTER);
        textSize(14);
        text('Loading...', width / 2, height / 2);
        return;
    }

    const cellW = width / COLS; 
    const cellH = height / ROWS; 

    for (let i = 0; i < videos.length; i++) {
        if(!videos[i]) continue;
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const x = col * cellW;
        const y = row * cellH;
        if (videos[i].width > 0) { 
            image(videos[i], x, y, cellW, cellH);
        }
    }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
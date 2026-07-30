//------------Set Up Variables----------------//
let manifest = []; 
let weights = []; 
let videos = [];

let COLS = 6; 
let ROWS = Math.round(COLS * (16 / 9)); 
let TOTAL = COLS * ROWS; 
let loadDebounceTimer = null;

//------------Adjusting Source Path Syntax-------------//
function joinPathForwardSlash(dirPath, fileName) {
    const normalizedDir = dirPath.replace(/\\/g, '/');
    return normalizedDir.replace(/\/+$/, '') + '/' + fileName;
}

//------------Building Sources Function----------------//
function buildSources() {
    let result = [];
    const seen = new Set();

    // Calculate exact slots using largest remainder method
    const rawSlots = manifest.map((_, f) => weights[f] * TOTAL);
    const floorSlots = rawSlots.map(s => Math.floor(s));
    const remainders = rawSlots.map((s, i) => ({ i, r: s - floorSlots[i] }));
    const totalFloor = floorSlots.reduce((a, b) => a + b, 0);
    const remainder = TOTAL - totalFloor;
    remainders.sort((a, b) => b.r - a.r);
    const slots = [...floorSlots];
    for (let k = 0; k < remainder; k++) slots[remainders[k].i]++;

    // Build result using exact slots
    for (let f = 0; f < manifest.length; f++) {
        const entry = manifest[f];
        if (entry.files.length === 0 || slots[f] === 0) continue;

        const shuffled = shuffleArray([...entry.files]);
        for (let i = 0; i < slots[f]; i++) {
            const fullPath = joinPathForwardSlash(entry.path, shuffled[i % shuffled.length]);
            result.push(fullPath);
            seen.add(fullPath);
        }
    }

    // Build backfill pool from unused files
    let backfillPool = [];
    for (const entry of manifest) {
        for (const file of entry.files) {
            const fullPath = joinPathForwardSlash(entry.path, file);
            if (!seen.has(fullPath)) backfillPool.push(fullPath);
        }
    }
    backfillPool = shuffleArray(backfillPool);

    // Deduplicate — replace repeats with backfill
    const finalSeen = new Set();
    result = result.map(path => {
        if (!finalSeen.has(path)) {
            finalSeen.add(path);
            return path;
        }
        while (backfillPool.length > 0) {
            const replacement = backfillPool.pop();
            if (!finalSeen.has(replacement)) {
                finalSeen.add(replacement);
                return replacement;
            }
        }
        return path;
    });

    return shuffleArray(result);
}

//------------Shuffle Array & Weights Functions----------------//
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function setWeight(changedIndex, newVal) { 
    newVal = Math.max(0, Math.min(1, newVal));
    const oldVal = weights[changedIndex];
    const oldOther = 1 - oldVal;
    const newOther = 1 - newVal;
    
    weights[changedIndex] = newVal;

    if (oldOther === 0) {
        const share = newOther / (manifest.length - 1);
        weights = weights.map((w, i) => i === changedIndex ? newVal : share);
    } else {
        weights = weights.map((w,i) => {
            if (i === changedIndex) return newVal;
            return w * (newOther / oldOther);
        });
    }

    const total = weights.reduce((a, b) => a + b, 0); 
    weights = weights.map(w => w / total);
}

//------------Load & Play Functions----------------//
let isLoading = false; 
let pendingReload = false;    // set when a reload is requested mid-load

async function loadAndPlay() {
    if (isLoading) {
        pendingReload = true;   // don't drop the request — run again once free
        return;
    }
    isLoading = true;
    videos.forEach(v => { try {v.remove();} catch(e) {}});
    videos = [];

    const sources = buildSources();
    const promises = sources.map(src => loadVideoAsync(src)); 
    videos = await Promise.all(promises);

    videos.forEach(v => {
        if (v) {
            v.volume(0);
            v.loop();
            v.play();
        }
    });

    isLoading = false;

    if (pendingReload) {
        pendingReload = false;
        loadAndPlay();          // pick up the latest weights automatically
    }
}

function loadVideoAsync(src) {
    return new Promise((resolve) => {
        let v = createVideo(src);
        v.hide();
        v.elt.oncanplay = () => resolve(v);
        v.elt.onerror = () => {
            console.warn('Video failed to load (decoder cap or bad file):', src);
            resolve(null);
        };
    });
}

//------------Setup & Draw Functions----------------//
async function setup() {
    createCanvas(windowWidth, windowHeight);
    background(0);

    manifest = await window.api.getManifest();
    weights = manifest.map(() => 1 / manifest.length);

    await loadAndPlay();
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

//------------ipc Listener Functions----------------//
window.api.on('weight-changed', (data) => {
  weights = data.weights;
  clearTimeout(loadDebounceTimer);
  loadDebounceTimer = setTimeout(() => loadAndPlay(), 600);
});

window.api.on('reshuffle', () => {
  weights = manifest.map(() => 1 / manifest.length);
  clearTimeout(loadDebounceTimer);
  loadDebounceTimer = setTimeout(() => loadAndPlay(), 600);
});
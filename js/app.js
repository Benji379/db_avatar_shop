// Evita ejecutar este script en Node: es solo para el navegador
if (typeof document === 'undefined') {
  console.error('app.js se ejecuta en el navegador. Usa: node server.js y abre http://localhost:3000');
  if (typeof process !== 'undefined' && process.exit) process.exit(0);
}

/** =================== Config =================== */
const BASE = "./items_capturados";
const AGGREGATE_FILE = `${BASE}/items_all.jsonl`;
const CATEGORY_FILES = {
  Head:       `${BASE}/items_Head.jsonl`,
  Body:       `${BASE}/items_Body.jsonl`,
  Glass:      `${BASE}/items_Glass.jsonl`,
  Flag:       `${BASE}/items_Flag.jsonl`,
  Background: `${BASE}/items_Background.jsonl`,
  Foreground: `${BASE}/items_Foreground.jsonl`,
  "Ex-Item":  `${BASE}/items_Ex-Item.jsonl`,
};
const SPRITES_DIR = `${BASE}/images`; // <Cat>/<ref>.png

const TARGET_PREVIEW_FRAME = 160;   // tamaño visual del frame (preview y lab)
const TARGET_THUMB_H = 95;          // alto visual de la miniatura
let   GLOBAL_FPS = 6;               // ← velocidad global (puedes cambiarla)

/** Helpers de tiempo según FPS global */
const fpsMs = () => Math.max(16, Math.floor(1000 / Math.max(1, GLOBAL_FPS)));
GLOBAL_FPS = 25;
const MOVE_SOUNDS = [
  { label: "Aceptar", value: "./sounds/click/accept.ogg" },
  { label: "Twinkle", value: "./sounds/click/bigtwinkle.wav" },
  { label: "Stage", value: "./sounds/click/stage.wav" },
  { label: "Purchase", value: "./sounds/click/purchase.wav" },
  { label: "Pause", value: "./sounds/click/pause.wav" },
  { label: "Win", value: "./sounds/click/win.mp3" },
  { label: "Sin sonido", value: "" },
];
let moveSoundUrl = MOVE_SOUNDS[0].value;
let moveAudio = null;

const LAYER_ORDER = ["Head", "Body", "Glass", "Flag", "Background", "Foreground"]; // orden de categorías / tabs

// Orden exclusivo para dibujar el preview compuesto.
// No cambia el orden de los tabs; solo el apilado visual del avatar.
const PREVIEW_LAYER_ORDER = ["Background", "Flag", "Body", "Head", "Glass", "Foreground"];

// Posiciones para armar el avatar en UN SOLO preview, estilo DragonBound.
// x/y son porcentajes dentro del cuadro; size es el tamaño visual del frame.
// Ajustes actuales pedidos:
// - Head más chico.
// - Glass más separado del centro.
// - Flag hacia la derecha.
const PREVIEW_COMPOSITE_CONFIG = {
  Background: { mode: "background", z: 0 },
  Flag:       { x: 36, y: 40, size: 82,  z: 20 },
  Body:       { x: 50, y: 58, size: 126, z: 30 },
  Head:       { x: 50, y: 39, size: 94,  z: 40 },
  Glass:      { x: 42, y: 37, size: 118, z: 50 },
  Foreground: { x: 72, y: 47, size: 112, z: 60 },
};
const DEFAULT_PREVIEW_COMPOSITE_CONFIG = clonePreviewConfig(PREVIEW_COMPOSITE_CONFIG);

let LOADER_CONFIG = {
  duration: 1.5,
  headSprite: "./items_capturados/images/Head/mh04506.png"
};


/** =================== Helpers DOM/Utils =================== */
const $ = (id) => document.getElementById(id);
const setStatus = (s) => {
  const el = $("status");
  if (el) el.textContent = s || "";
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isRare = (name) => /\(RARE\)/i.test(name);

function clonePreviewConfig(config){
  return Object.fromEntries(
    Object.entries(config).map(([cat, value]) => [cat, {...value}])
  );
}

function applyPreviewConfig(config){
  const source = config && typeof config === "object" ? config : {};
  for(const [cat, defaults] of Object.entries(DEFAULT_PREVIEW_COMPOSITE_CONFIG)){
    PREVIEW_COMPOSITE_CONFIG[cat] = {...defaults, ...(source[cat] || {})};
    for(const key of ["x", "y", "size", "z"]){
      if(PREVIEW_COMPOSITE_CONFIG[cat][key] !== undefined){
        const value = Number(PREVIEW_COMPOSITE_CONFIG[cat][key]);
        PREVIEW_COMPOSITE_CONFIG[cat][key] = Number.isFinite(value) ? value : defaults[key];
      }
    }
  }
}

async function loadAppConfig(){
  // 1. Cargar desde config.json (Prioridad para cambios del desarrollador)
  try {
    const response = await fetch("./js/config.json", { cache: "no-store" });
    if (response.ok) {
      const config = await response.json();
      if (config) {
        if (config.previewCompositeConfig) applyPreviewConfig(config.previewCompositeConfig);
        if (config.loaderDurationSeconds) LOADER_CONFIG.duration = config.loaderDurationSeconds;
        if (config.loaderHeadSprite) LOADER_CONFIG.headSprite = config.loaderHeadSprite;
        console.log("Configuración cargada desde config.json");
      }
    }
  } catch (e) {
    console.warn("No se pudo cargar config.json:", e);
  }

  // 2. Cargar desde localStorage (Cambios realizados por el usuario en vivo)
  try {
    const localData = localStorage.getItem("gb_shop_config");
    if (localData) {
      const config = JSON.parse(localData);
      if (config && config.previewCompositeConfig) {
        applyPreviewConfig(config.previewCompositeConfig);
        console.log("Configuración cargada desde localStorage");
      }
    }
  } catch (err) {
    console.warn("Error leyendo localStorage:", err);
  }
}


async function saveAppConfig(){
  const configData = { previewCompositeConfig: clonePreviewConfig(PREVIEW_COMPOSITE_CONFIG) };
  
  // 1. Guardar en localStorage siempre
  try {
    localStorage.setItem("gb_shop_config", JSON.stringify(configData));
    console.log("Configuración guardada en localStorage");
  } catch (err) {
    console.error("Error guardando en localStorage:", err);
  }

  // 2. Intentar guardar en el servidor
  try {
    const res = await fetch("./api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(configData),
    });
    if(res.ok) {
      console.log("Configuración guardada en el servidor");
    }
  } catch (err) {
    // Silencioso si falla el servidor, ya guardamos en localStorage
    console.log("Servidor no disponible para guardado (esto es normal en GitHub Pages)");
  }
}

/** Lee texto con tolerancia a 404 */
async function fetchTextOrNull(url){
  try{
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) return null;
    return await res.text();
  }catch{ return null; }
}

/** Lee JSONL */
async function loadJsonl(url){
  const text = await fetchTextOrNull(url);
  if(!text) return [];
  return text.split("\n").map(l => l.trim()).filter(Boolean).map(line=>{
    try{ return JSON.parse(line); }catch{ return null; }
  }).filter(Boolean);
}

/** Fuente de datos: usa agregado si existe; si no, por categoría */
async function loadAllRows(){
  const agg = await loadJsonl(AGGREGATE_FILE);
  if(agg.length) return agg;
  const parts = await Promise.all(Object.values(CATEGORY_FILES).map(loadJsonl));
  return parts.flat();
}

/** Construye URL del sprite */
async function resolveSpriteUrl(item){
  const local = `${SPRITES_DIR}/${encodeURIComponent(item.category)}/${encodeURIComponent(item.ref)}.png`;
  const ok = await new Promise(res=>{
    const im = new Image();
    im.onload = ()=> res(true);
    im.onerror = ()=> res(false);
    im.src = local + `?t=${Date.now()}`;
  });
  if(ok) return local;
  if(item.img_url || item.imageUrl) return item.img_url || item.imageUrl;
  return local;
}

const spriteInfoCache = new Map();

function getOpaqueSegments(img, width, height, axis = "h"){
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if(!ctx) return [];

  try{
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    const rawSegments = [];
    let inside = false;
    let start = 0;

    const limit = axis === "h" ? width : height;
    const secondaryLimit = axis === "h" ? height : width;

    for(let i = 0; i < limit; i++){
      let hasPixel = false;
      for(let j = 0; j < secondaryLimit; j += 2){
        const alpha = axis === "h" 
          ? data[(j * width + i) * 4 + 3]
          : data[(i * width + j) * 4 + 3];
        if(alpha > 15){ // Umbral de alpha un poco más alto
          hasPixel = true;
          break;
        }
      }

      if(hasPixel && !inside){
        start = i;
        inside = true;
      }

      if((!hasPixel || i === limit - 1) && inside){
        const end = hasPixel && i === limit - 1 ? i : i - 1;
        if (end >= start) {
          rawSegments.push({ start, end, width: end - start + 1 });
        }
        inside = false;
      }
    }

    if (rawSegments.length === 0) return [];

    // Fusionar segmentos que están muy cerca (menos de 8px de gap) 
    // para evitar que partes sueltas de una cabeza se cuenten como frames
    const merged = [];
    let current = rawSegments[0];

    for (let i = 1; i < rawSegments.length; i++) {
      const next = rawSegments[i];
      const gap = next.start - current.end;
      if (gap < 12) { // Gap pequeño: probablemente es el mismo frame (pelo, cuernos, etc)
        current.end = next.end;
        current.width = current.end - current.start + 1;
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged;
  }catch{
    return [];
  }
}



/** Obtiene info del sprite: detección inteligente de frames por transparencia. */
async function getSpriteInfo(url, category = ""){
  const cacheKey = `${category}|${url}`;
  if(spriteInfoCache.has(cacheKey)) return spriteInfoCache.get(cacheKey);

  const {img, width, height} = await new Promise((resolve,reject)=>{
    const im = new Image();
    im.onload = ()=> resolve({img: im, width: im.naturalWidth, height: im.naturalHeight});
    im.onerror = reject;
    im.src = url + `?t=${Date.now()}`;
  });

  let mode = "h", frameWidth = width, frameHeight = height, frames = 1, framePositions = null;

  // Si la imagen es muy pequeña, es un solo frame
  if (width < 20 && height < 20) {
     const info = { width, height, frameWidth, frameHeight, frameSize: height, frames: 1, mode: "h" };
     spriteInfoCache.set(cacheKey, info);
     return info;
  }

  // Detectar orientación predominante
  if (width >= height) {
    mode = "h";
    const segments = getOpaqueSegments(img, width, height, "h");
    
    // Para Avatares (no fondos), el número de frames suele ser 1, 2, 4, 6
    if (category !== "Background" && category !== "Foreground") {
      const ratio = width / height;
      const guessedFrames = Math.max(1, Math.round(ratio));
      
      // Si los segmentos coinciden con el ratio o hay una cantidad razonable de segmentos
      if (segments.length > 0 && segments.length <= guessedFrames) {
        frames = guessedFrames;
      } else {
        frames = segments.length || guessedFrames;
      }
      
      // Forzar frames estándar si estamos cerca
      if (Math.abs(frames - 4) <= 1 && width > height * 3) frames = 4;
      if (Math.abs(frames - 6) <= 1 && width > height * 5) frames = 6;
      
      frameWidth = width / frames;
      frameHeight = height;
    } else {
      // Lógica para backgrounds (mantener segmentos originales)
      if (segments.length > 1) {
        frames = segments.length;
        frameWidth = width / frames;
        frameHeight = height;
      } else {
        frames = Math.max(1, Math.round(width / height));
        frameWidth = width / frames;
        frameHeight = height;
      }
    }
  } else {
    mode = "v";
    const segments = getOpaqueSegments(img, width, height, "v");
    frames = segments.length || Math.max(1, Math.round(height / width));
    frameWidth = width;
    frameHeight = height / frames;
  }


  // Especial para Backgrounds que pueden tener frames muy anchos y gaps
  if (category === "Background" || category === "Foreground") {
     const wideSegments = getOpaqueSegments(img, width, height, "h")
      .filter(s => s.width > height * 1.2);
     if (wideSegments.length > 0) {
       frames = wideSegments.length;
       frameWidth = Math.max(...wideSegments.map(s => s.width));
       frameHeight = height;
       framePositions = wideSegments.map(s => s.start);
     }
  }

  const info = { width, height, frameWidth, frameHeight, frameSize: frameHeight, frames, mode, framePositions };
  spriteInfoCache.set(cacheKey, info);
  return info;
}


function setSpriteFrame(el, info, frame){
  const f = Math.max(0, Math.min(frame || 0, info.frames - 1));
  if(info.mode === "h"){
    const x = info.framePositions ? info.framePositions[f] : f * info.frameWidth;
    el.style.backgroundPosition = `-${x}px 0px`;
  }else{
    el.style.backgroundPosition = `0px -${f * info.frameHeight}px`;
  }
}

function isWideSprite(info){
  return info.frameWidth / info.frameHeight > 1.35;
}

/** =================== Estado =================== */
let allItems = [];              // filas crudas
let byCat = new Map();          // category => items[]
let currentCat = "Background";
let currentPage = 1;
let maxPage = 1;
let searchTerm = "";
let visiblePageItems = [];
let selectedGridIndex = 0;

const equipped = new Map();     // category => { item, url, info }

function setCurrentCategory(cat){
  if(!byCat.has(cat)) return;
  currentCat = cat;
  currentPage = 1;
  selectedGridIndex = 0;
  renderTabs();
  renderGrid();
  updatePagerInfo();
}

function playMoveSound(){
  if(!moveSoundUrl) return;
  try{
    if(!moveAudio || moveAudio.src !== new URL(moveSoundUrl, window.location.href).href){
      moveAudio = new Audio(moveSoundUrl);
      moveAudio.volume = 0.35;
    }
    moveAudio.currentTime = 0;
    const playPromise = moveAudio.play();
    if(playPromise && typeof playPromise.catch === "function") playPromise.catch(()=>{});
  }catch{}
}

function selectGridIndex(index, options = {}){
  if(!visiblePageItems.length) return;
  const next = Math.max(0, Math.min(index, visiblePageItems.length - 1));
  if(next === selectedGridIndex && !options.force) return;
  selectedGridIndex = next;

  document.querySelectorAll(".card.keyboard-selected").forEach(card => {
    card.classList.remove("keyboard-selected");
    card.setAttribute("aria-selected", "false");
  });

  const card = document.querySelector(`.card[data-grid-index="${selectedGridIndex}"]`);
  if(card){
    card.classList.add("keyboard-selected");
    card.setAttribute("aria-selected", "true");
    if(options.focus) card.focus({ preventScroll: true });
    if(options.scroll) card.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  if(options.sound) playMoveSound();
}

function getGridColumnCount(){
  const grid = $("grid");
  const firstCard = grid?.querySelector(".card");
  if(!grid || !firstCard) return 1;

  const gridWidth = grid.clientWidth;
  const cardWidth = firstCard.getBoundingClientRect().width;
  const styles = window.getComputedStyle(grid);
  const gap = parseFloat(styles.columnGap || styles.gap || "0") || 0;
  return Math.max(1, Math.floor((gridWidth + gap) / (cardWidth + gap)));
}

function moveGridSelection(delta){
  selectGridIndex(selectedGridIndex + delta, { focus: true, scroll: true, sound: true });
}

function moveCategory(delta){
  const cats = LAYER_ORDER.filter(cat => byCat.has(cat));
  const index = cats.indexOf(currentCat);
  if(index === -1 || !cats.length) return;
  const next = (index + delta + cats.length) % cats.length;
  setCurrentCategory(cats[next]);
  playMoveSound();
}

function getSelectedCardButton(){
  return document.querySelector(`.card[data-grid-index="${selectedGridIndex}"] .btn-equip`);
}

function closeModernSelects(except = null){
  document.querySelectorAll(".modern-select.open").forEach(root => {
    if(root !== except) root.classList.remove("open");
  });
}

/** syncModernSelect eliminada en favor de CustomSelect class **/


document.addEventListener("click", () => closeModernSelects());

/** =================== UI: Tabs =================== */
function renderTabs(){
  const root = $("tabs");
  root.innerHTML = "";
  for(const cat of LAYER_ORDER){
    if(!byCat.has(cat)) continue;
    const btn = document.createElement("button");
    btn.className = "tab" + (cat === currentCat ? " active":"");
    btn.textContent = cat;
    btn.onclick = ()=> setCurrentCategory(cat);
    root.appendChild(btn);
  }
}

/** =================== UI: Pager + FPS =================== */
function updatePagerInfo(){
  $("pageInfo").textContent = `Página ${currentPage}/${maxPage}`;
}
function wirePagerAndFps(){
  $("prevPage").onclick = ()=>{
    if(currentPage>1){ currentPage--; selectedGridIndex = 0; renderGrid(); updatePagerInfo(); playMoveSound(); }
  };
  $("nextPage").onclick = ()=>{
    if(currentPage<maxPage){ currentPage++; selectedGridIndex = 0; renderGrid(); updatePagerInfo(); playMoveSound(); }
  };
  const fpsInput = $("fpsGlobal");
  fpsInput.value = String(GLOBAL_FPS);
  fpsInput.oninput = ()=>{
    const v = Number(fpsInput.value);
    GLOBAL_FPS = Number.isFinite(v) && v>0 ? v : 15;
    // Reinicia animaciones
    clearPreviewAnimation(); renderPreview();
    stopGridAnim(); renderGrid();
    // Si el LAB está en Play, re-sincroniza
    if(headLab.timer) labStart();
  };

  const searchInput = $("searchInput");
  if (searchInput) {
    searchInput.oninput = () => {
      searchTerm = searchInput.value.trim().toLowerCase();
      currentPage = 1;
      selectedGridIndex = 0;
      renderGrid();
      updatePagerInfo();
    };
  }

  const soundSelect = $("moveSound");
  if(soundSelect){
    soundSelect.innerHTML = MOVE_SOUNDS
      .map(sound => `<option value="${sound.value}">${sound.label}</option>`)
      .join("");
    soundSelect.value = moveSoundUrl;
    soundSelect.addEventListener("change", () => {
      moveSoundUrl = soundSelect.value;
      moveAudio = null;
      playMoveSound();
    });
  }
}

function isTypingTarget(el){
  if(!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || el.isContentEditable;
}

function wireKeyboardNavigation(){
  document.addEventListener("keydown", (event)=>{
    if($("previewConfigDialog")?.open) return;
    const active = document.activeElement;

    if(event.key === "Tab" && !isTypingTarget(active)){
      event.preventDefault();
      moveCategory(event.shiftKey ? -1 : 1);
      return;
    }

    if(isTypingTarget(active)) return;

    const columns = getGridColumnCount();
    switch(event.key){
      case "ArrowRight":
        event.preventDefault();
        moveGridSelection(1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveGridSelection(-1);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveGridSelection(columns);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveGridSelection(-columns);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        getSelectedCardButton()?.click();
        break;
      default:
        break;
    }
  });
}

/** =================== Grid =================== */
let gridTimers = [];
function stopGridAnim(){
  for(const t of gridTimers) clearInterval(t);
  gridTimers = [];
}

async function renderGrid(){
  stopGridAnim();

  let list = byCat.get(currentCat) || [];
  
  if (searchTerm) {
    list = list.filter(it => 
      (it.name && it.name.toLowerCase().includes(searchTerm)) || 
      (it.ref && it.ref.toLowerCase().includes(searchTerm))
    );
  }

  // calcula paginación por campo "page" (si existe) o pagina a 12 por vista (4x3)
  const per = 12;
  maxPage = Math.max(1, Math.ceil(list.length / per));
  const start = (currentPage - 1) * per;
  pageItems = list.slice(start, start + per);
  visiblePageItems = pageItems;
  selectedGridIndex = Math.min(selectedGridIndex, Math.max(0, visiblePageItems.length - 1));

  const grid = $("grid");
  grid.innerHTML = "";

  for(const [index, item] of pageItems.entries()){
    const card = document.createElement("div");
    card.className = `card card-${item.category.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` + (isRare(item.name) ? " rare" : "");
    if(item.category === "Background") card.classList.add("card-horizontal");
    card.dataset.gridIndex = String(index);
    card.tabIndex = 0;
    card.setAttribute("role", "option");
    card.setAttribute("aria-selected", "false");
    
    // Persistent Selection Logic: Check if this item is currently equipped
    const currentEq = equipped.get(item.category);
    const isCurrentlyEquipped = currentEq && currentEq.item.ref === item.ref;
    if(isCurrentlyEquipped) {
      card.classList.add("equipped");
    }

    const title = document.createElement("div");
    title.className = "card-title";

    const titleText = document.createElement("span");
    titleText.className = "card-title-text";
    titleText.textContent = item.name || item.ref;
    title.appendChild(titleText);
    card.appendChild(title);

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const sprite = document.createElement("div");
    sprite.className = "sprite";
    thumb.appendChild(sprite);
    card.appendChild(thumb);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = item.name || item.ref;
    card.appendChild(name);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${item.category}${isRare(item.name) ? " · RARE" : ""}`;
    card.appendChild(meta);

    const infoPanel = document.createElement("div");
    infoPanel.className = "shop-info-panel";
    card.appendChild(infoPanel);

    const pricePanel = document.createElement("div");
    pricePanel.className = "price-panel";
    const prices = [item.cash, item.gold].filter(Boolean);
    if(prices.length){
      for(const value of prices){
        const price = document.createElement("div");
        price.className = value.toLowerCase().includes("cash") ? "price cash-price" : "price gold-price";
        price.textContent = value;
        pricePanel.appendChild(price);
      }
    }else{
      const price = document.createElement("div");
      price.className = "price gold-price";
      price.textContent = item.category;
      pricePanel.appendChild(price);
    }
    card.appendChild(pricePanel);

    const newBadge = document.createElement("div");
    newBadge.className = "new-badge";
    newBadge.textContent = "NUEVO";
    card.appendChild(newBadge);

    const actions = document.createElement("div");
    actions.className = "actions";
    const btnEq = document.createElement("button");
    btnEq.className = "btn-equip";
    btnEq.textContent = isCurrentlyEquipped ? "Quitar" : "Equipar";
    
    const toggleEquip = async()=>{
      if (isCurrentlyEquipped) {
        // Unequip
        equipped.delete(item.category);
      } else {
        // Equip
        const url = await resolveSpriteUrl(item);
        const info = await getSpriteInfo(url, item.category);
        equipped.set(item.category, {item, url, info});
      }
      
      renderEquippedList();
      await renderPreview();
      renderGrid(); // Re-render grid to update 'equipped' visual state
      if(item.category === "Head"){ await labLoadHead(item.ref); }
    };
    card.onclick = ()=>{
      selectGridIndex(index, { force: true, sound: true });
      toggleEquip();
    };
    card.onfocus = ()=> selectGridIndex(index, { force: true });
    btnEq.onclick = async(event)=>{
      event.stopPropagation();
      await toggleEquip();
    };
    actions.appendChild(btnEq);

    if(item.category === "Head"){
      const btnTest = document.createElement("button");
      btnTest.className = "btn-test";
      btnTest.textContent = "Test";
      btnTest.onclick = (event)=>{ event.stopPropagation(); labLoadHead(item.ref); };
      actions.appendChild(btnTest);
    }

    card.appendChild(actions);
    grid.appendChild(card);

    // prepara miniatura + animación
    (async()=>{
      const url = await resolveSpriteUrl(item);
      const info = await getSpriteInfo(url, item.category);
      const thumbRect = thumb.getBoundingClientRect();
      const thumbW = Math.max(1, thumbRect.width || 250);
      const thumbH = Math.max(1, thumbRect.height || 92);
      const padding = isWideSprite(info) ? 0 : 18;
      const scale = Math.min(
        (thumbW - padding) / info.frameWidth,
        (thumbH - padding) / info.frameHeight
      );

      sprite.style.width = `${info.frameWidth}px`;
      sprite.style.height = `${info.frameHeight}px`;
      sprite.style.transform = `translate(-50%, -50%) scale(${Math.max(0.1, scale)})`;
      sprite.style.backgroundImage = `url("${url}")`;
      sprite.style.backgroundPosition = "0 0";
      sprite.classList.toggle("sprite-wide", isWideSprite(info));

      // animación por tarjeta (solo página visible) con efecto Boomerang
      let tickCount = 0;
      const tick = ()=>{
        tickCount++;
        // Cálculo de frame estilo ping-pong (boomerang)
        let f = 0;
        if (info.frames > 1) {
          const cycle = 2 * (info.frames - 1);
          const pos = tickCount % cycle;
          f = pos < info.frames ? pos : cycle - pos;
        }

        setSpriteFrame(sprite, info, f);
      };
      // arranque inmediato
      tick();
      const t = setInterval(tick, fpsMs());
      gridTimers.push(t);
    })();
  }
  selectGridIndex(selectedGridIndex, { force: true });
}

/** =================== Equipado (lista) =================== */
function renderEquippedList(){
  const targets = [
    { ul: $("equippedList"), btn: null },
    { ul: $("mobileEquippedList"), btn: null }
  ];

  for(const target of targets){
    if(!target.ul) continue;
    target.ul.innerHTML = "";
    for(const cat of LAYER_ORDER){
      const li = document.createElement("li");
      const eq = equipped.get(cat);
      
      const catLabel = document.createElement("span");
      catLabel.className = "cat-label";
      catLabel.textContent = cat;
      li.appendChild(catLabel);

      const itemName = document.createElement("span");
      itemName.className = "item-name";
      itemName.textContent = eq ? (eq.item.name || eq.item.ref) : "—";
      li.appendChild(itemName);

      target.ul.appendChild(li);
    }
  }
}

/** =================== Preview (capas + animación) =================== */
let previewTimer = null;
function clearPreviewAnimation(){
  if(previewTimer){ clearInterval(previewTimer); previewTimer = null; }
}

function parseShopAmount(value){
  if(!value) return 0;
  const digits = String(value).replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}

function formatShopAmount(value){
  return Math.max(0, value).toLocaleString("en-US");
}

function getEquippedTotals(){
  let cash = 0;
  let gold = 0;

  for(const {item} of equipped.values()){
    cash += parseShopAmount(item.cash);
    gold += parseShopAmount(item.gold);
  }

  return {cash, gold};
}

function createPreviewInfoPanel(){
  const panel = document.createElement("div");
  panel.className = "preview-info-panel";

  const stats = document.createElement("div");
  stats.className = "preview-stats";
  const statValues = ["20", "09", "03", "00", "30", "20", "00", "14"];

  for(const [index, value] of statValues.entries()){
    const stat = document.createElement("div");
    stat.className = "preview-stat";

    const icon = document.createElement("span");
    icon.className = `preview-stat-icon preview-stat-icon-${index + 1}`;
    stat.appendChild(icon);

    const text = document.createElement("span");
    text.textContent = value;
    stat.appendChild(text);
    stats.appendChild(stat);
  }

  const totals = getEquippedTotals();
  const prices = document.createElement("div");
  prices.className = "preview-totals";

  const cash = document.createElement("div");
  cash.className = "preview-total preview-total-cash";
  cash.textContent = `${formatShopAmount(totals.cash)} Cash`;
  prices.appendChild(cash);

  const gold = document.createElement("div");
  gold.className = "preview-total preview-total-gold";
  gold.textContent = `${formatShopAmount(totals.gold)} Gold`;
  prices.appendChild(gold);

  panel.appendChild(stats);
  panel.appendChild(prices);
  return panel;
}

function getBoomerangFrame(frames, tickCount){
  if(frames <= 1) return 0;
  const cycle = 2 * (frames - 1);
  const pos = tickCount % cycle;
  return pos < frames ? pos : cycle - pos;
}

function projectSynchronizedFrame(sharedFrame, sharedFrames, targetFrames){
  if(targetFrames <= 1) return 0;
  if(sharedFrames <= 1) return 0;
  return Math.min(targetFrames - 1, Math.round((sharedFrame / (sharedFrames - 1)) * (targetFrames - 1)));
}

async function renderPreview(root = $("preview"), options = {}){
  const isMainPreview = root && root.id === "preview";
  if(isMainPreview) clearPreviewAnimation();
  if(!root) return;
  root.innerHTML = "";
  root.classList.remove("preview-separated");
  root.classList.add("preview-composite");
  root.classList.toggle("config-preview-active", !!options.interactive);

  // Fondo base del cuadro, aunque no haya Background equipado.
  const defaultBg = document.createElement("div");
  defaultBg.className = "preview-default-bg";
  root.appendChild(defaultBg);

  const stage = document.createElement("div");
  stage.className = "preview-avatar-stage";
  root.appendChild(stage);

  root.appendChild(createPreviewInfoPanel());

  const layers = [];

  for(const cat of PREVIEW_LAYER_ORDER){
    const eq = equipped.get(cat);
    if(!eq) continue;

    const {url, info} = eq;
    const cfg = PREVIEW_COMPOSITE_CONFIG[cat] || { x: 50, y: 50, size: TARGET_PREVIEW_FRAME, z: 30 };

    // Background se renderiza como banner superior dentro de la tarjeta.
    if(cfg.mode === "background"){
      defaultBg.innerHTML = "";
      defaultBg.classList.add("has-equipped-bg");
      const bgFrame = document.createElement("div");
      bgFrame.className = "preview-bg-frame";
      const bgRect = defaultBg.getBoundingClientRect();
      const bgW = Math.max(1, bgRect.width || 312);
      const bgH = Math.max(1, bgRect.height || 132);
      const scale = Math.min(
        Math.max(bgW / info.frameWidth, bgH / info.frameHeight),
        3
      );
      bgFrame.style.width = `${info.frameWidth}px`;
      bgFrame.style.height = `${info.frameHeight}px`;
      bgFrame.style.transform = `translate(-50%, -50%) scale(${Math.max(0.1, scale)})`;
      bgFrame.style.backgroundImage = `url("${url}")`;
      setSpriteFrame(bgFrame, info, 0);
      defaultBg.appendChild(bgFrame);
      layers.push({div: bgFrame, info, cat});
      continue;
    }

    const div = document.createElement("div");
    div.className = `preview-layer preview-layer-${cat.toLowerCase()}`;
    div.dataset.previewLayer = cat;

    const scale = cfg.size / Math.max(info.frameWidth, info.frameHeight);
    div.style.width  = `${info.frameWidth}px`;
    div.style.height = `${info.frameHeight}px`;
    div.style.left = `${cfg.x}%`;
    div.style.top = `${cfg.y}%`;
    div.style.zIndex = String(cfg.z);
    div.style.transform = `translate(-50%, -50%) scale(${scale})`;
    div.style.backgroundImage = `url("${url}")`;
    setSpriteFrame(div, info, 0);

    stage.appendChild(div);
    if(options.interactive) wireConfigLayerDrag(div, stage, cat);
    layers.push({div, info, cat});
  }

  if(!layers.length) return;

  let tickCount = 0;
  const syncedLayers = layers.filter(layer => layer.cat !== "Background");
  const syncFrames = Math.max(1, ...syncedLayers.map(layer => layer.info.frames));
  const tick = ()=>{
    tickCount++;
    const sharedFrame = getBoomerangFrame(syncFrames, tickCount);
    for(const {div, info, cat} of layers){
      const f = cat === "Background"
        ? getBoomerangFrame(info.frames, tickCount)
        : projectSynchronizedFrame(sharedFrame, syncFrames, info.frames);
      setSpriteFrame(div, info, f);
    }
  };
  tick();
  if(isMainPreview) previewTimer = setInterval(tick, fpsMs());
}

const CONFIG_EDIT_LAYERS = ["Flag", "Body", "Head", "Glass", "Foreground"];
let selectedConfigLayer = "Body";
let configDialogWired = false;

function roundConfigValue(value){
  return Math.round(value * 10) / 10;
}

function updateConfigInputs(){
  const cfg = PREVIEW_COMPOSITE_CONFIG[selectedConfigLayer];
  if(!cfg) return;
  for(const key of ["x", "y", "size", "z"]){
    const input = document.querySelector(`.config-number-input[data-config-key="${key}"]`);
    if(input) input.value = String(cfg[key] ?? 0);
  }
}

function markConfigLayer(){
  document.querySelectorAll(".config-layer-selected").forEach(layer => {
    layer.classList.remove("config-layer-selected");
  });
  const layer = document.querySelector(`#configPreview [data-preview-layer="${selectedConfigLayer}"]`);
  if(layer) layer.classList.add("config-layer-selected");
}

function renderConfigControls(){
  const select = $("configLayerSelect");
  const controls = $("configLayerControls");
  if(!select || !controls) return;

  select.innerHTML = CONFIG_EDIT_LAYERS
    .map(layer => `<option value="${layer}">${layer}</option>`)
    .join("");
  select.value = selectedConfigLayer;
  select.addEventListener("change", () => {
    selectedConfigLayer = select.value;
    renderConfigControls();
    renderConfigPreview();
  });
  // syncModernSelect eliminada


  const cfg = PREVIEW_COMPOSITE_CONFIG[selectedConfigLayer];
  controls.innerHTML = ["x", "y", "size", "z"].map(key => `
    <label class="config-number-field">
      <span>${key.toUpperCase()}</span>
      <input class="config-number-input" data-config-key="${key}" type="number" step="1" value="${cfg[key] ?? 0}">
    </label>
  `).join("");

  controls.querySelectorAll(".config-number-input").forEach(input => {
    input.oninput = () => {
      const key = input.dataset.configKey;
      const value = Number(input.value);
      if(!Number.isFinite(value)) return;
      PREVIEW_COMPOSITE_CONFIG[selectedConfigLayer][key] = value;
      renderPreview();
      renderConfigPreview();
    };
  });
}

async function renderConfigPreview(){
  const root = $("configPreview");
  if(!root) return;
  await renderPreview(root, { interactive: true });
  markConfigLayer();
}

async function moveSelectedConfigLayerBy(dx, dy){
  const cfg = PREVIEW_COMPOSITE_CONFIG[selectedConfigLayer];
  if(!cfg) return;
  cfg.x = roundConfigValue((Number(cfg.x) || 0) + dx);
  cfg.y = roundConfigValue((Number(cfg.y) || 0) + dy);
  updateConfigInputs();
  await renderPreview();
  await renderConfigPreview();
}

function wireConfigLayerDrag(div, stage, cat){
  div.addEventListener("pointerdown", (event)=>{
    if(cat !== selectedConfigLayer){
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.preventDefault();
    updateConfigInputs();
    markConfigLayer();

    const stageRect = stage.getBoundingClientRect();
    const cfg = PREVIEW_COMPOSITE_CONFIG[cat];
    div.setPointerCapture(event.pointerId);

    const move = (moveEvent)=>{
      const x = ((moveEvent.clientX - stageRect.left) / stageRect.width) * 100;
      const y = ((moveEvent.clientY - stageRect.top) / stageRect.height) * 100;
      cfg.x = roundConfigValue(x);
      cfg.y = roundConfigValue(y);
      div.style.left = `${cfg.x}%`;
      div.style.top = `${cfg.y}%`;
      updateConfigInputs();
    };

    const up = ()=>{
      div.removeEventListener("pointermove", move);
      div.removeEventListener("pointerup", up);
      div.removeEventListener("pointercancel", up);
      renderPreview();
      renderConfigPreview();
    };

    div.addEventListener("pointermove", move);
    div.addEventListener("pointerup", up);
    div.addEventListener("pointercancel", up);
  });
}

function wirePreviewConfigDialog(){
  if(configDialogWired) return;
  configDialogWired = true;

  const dialog = $("previewConfigDialog");
  const openBtn = $("previewConfigBtn");
  const closeBtn = $("configCloseBtn");
  const saveBtn = $("configSaveBtn");
  const resetBtn = $("configResetBtn");
  if(!dialog || !openBtn) return;

  openBtn.onclick = async () => {
    renderConfigControls();
    await renderConfigPreview();
    dialog.showModal();
  };

  closeBtn.onclick = () => dialog.close();
  dialog.addEventListener("click", (event)=>{
    if(event.target === dialog) dialog.close();
  });
  dialog.addEventListener("keydown", async (event)=>{
    if(!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if(isTypingTarget(event.target)) return;

    event.preventDefault();
    const step = event.shiftKey ? 5 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    await moveSelectedConfigLayerBy(dx, dy);
  });
  document.addEventListener("keydown", async (event)=>{
    if(!dialog.open) return;
    if(!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    if(isTypingTarget(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 5 : 1;
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
    await moveSelectedConfigLayerBy(dx, dy);
  }, true);

  resetBtn.onclick = async () => {
    applyPreviewConfig(DEFAULT_PREVIEW_COMPOSITE_CONFIG);
    renderConfigControls();
    await renderPreview();
    await renderConfigPreview();
  };

  const downloadBtn = $("configDownloadBtn");
  if(downloadBtn){
    downloadBtn.onclick = () => {
      const configData = {
        previewCompositeConfig: PREVIEW_COMPOSITE_CONFIG,
        loaderDurationSeconds: LOADER_CONFIG.duration,
        loaderHeadSprite: LOADER_CONFIG.headSprite
      };
      const blob = new Blob([JSON.stringify(configData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "config.json";
      a.click();
      URL.revokeObjectURL(url);
    };
  }


  saveBtn.onclick = async () => {
    saveBtn.disabled = true;
    try{
      await saveAppConfig();
      setStatus("Configuracion guardada en config.json");
      dialog.close();
      setTimeout(()=> setStatus(""), 1800);
    }catch(err){
      console.error(err);
      setStatus("No se pudo guardar config.json");
    }finally{
      saveBtn.disabled = false;
    }
  };
}

/** =================== LAB: Heads (tester de frames) =================== */
const headLab = { sprite:null, url:null, info:null, frame:0, timer:null, fps:GLOBAL_FPS };

function labStop(){
  if(headLab.timer){ 
    clearInterval(headLab.timer); 
    headLab.timer=null; 
    const btn = $("headPlay");
    if(btn) btn.textContent="Play"; 
  }
}
function labStep(d){
  if(!headLab.info) return;
  headLab.frame = (headLab.frame + d + headLab.info.frames) % headLab.info.frames;
  setSpriteFrame(headLab.sprite, headLab.info, headLab.frame);
  const frameEl = $("headFrame");
  if(frameEl) frameEl.textContent = String(headLab.frame + 1);
}
function labStart(){
  labStop();
  const stepMs = Math.max(16, Math.floor(1000 / Math.max(1, headLab.fps)));
  headLab.timer = setInterval(()=> labStep(1), stepMs);
  const btn = $("headPlay");
  if(btn) btn.textContent = "Pause";
}
async function labLoadHead(ref){
  labStop();
  const item = (byCat.get("Head")||[]).find(i=>i.ref===ref);
  if(!item) return;

  const url  = await resolveSpriteUrl(item);
  const info = await getSpriteInfo(url, item.category);
  headLab.url = url; headLab.info = info; headLab.frame = 0;

  const s = Math.max(info.frameWidth, info.frameHeight);
  const scale = TARGET_PREVIEW_FRAME / s;

  const canvas = $("headCanvas");
  if(!canvas) return; // Salir si el elemento no existe

  canvas.innerHTML = "";
  const el = document.createElement("div");
  el.className = "lab-sprite";
  el.style.width  = info.frameWidth + "px";
  el.style.height = info.frameHeight + "px";
  el.style.transform = `scale(${scale})`;
  el.style.backgroundImage = `url("${url}")`;
  setSpriteFrame(el, info, 0);
  canvas.appendChild(el);
  headLab.sprite = el;

  $("headTotal").textContent = String(info.frames);
  $("headFrame").textContent = "1";
  $("headMeta").textContent  = `frame=${info.frameWidth}x${info.frameHeight}px, frames=${info.frames}, mode=${info.mode}`;

  // sincroniza slider del LAB con FPS global actual si no lo tocaste aún
  const labFps = $("headFps");
  if(!labFps.dataset.touched){
    labFps.value = String(GLOBAL_FPS);
    headLab.fps = GLOBAL_FPS;
  }
}
/** =================== Custom Select UI Component =================== */
class CustomSelect {
  constructor(selectId) {
    this.select = document.getElementById(selectId);
    if (!this.select) return;
    this.id = selectId;
    this.container = null;
    this.trigger = null;
    this.optionsList = null;
    this.searchInput = null;
    this.init();
  }

  init() {
    // Evitar doble inicialización si el select ya está dentro de un contenedor custom
    const existingContainer = this.select.closest('.custom-select-container');
    
    if (existingContainer) {
      this.container = existingContainer;
      this.trigger = this.container.querySelector('.custom-select-trigger');
      this.optionsList = this.container.querySelector('.custom-select-options');
    }

    if (!this.container) {
      this.container = document.createElement('div');
      this.container.className = 'custom-select-container';
      this.select.parentNode.insertBefore(this.container, this.select);
      this.container.appendChild(this.select);
    }
    
    this.select.classList.add('native-select-hidden');

    if (!this.trigger) {
      this.trigger = document.createElement('div');
      this.trigger.className = 'custom-select-trigger';
      this.container.appendChild(this.trigger);
    }

    if (!this.optionsList) {
      this.optionsList = document.createElement('div');
      this.optionsList.className = 'custom-select-options';
      this.container.appendChild(this.optionsList);
    }

    this.update();
    this.bindEvents();
  }

  update() {
    const selected = this.select.options[this.select.selectedIndex];
    this.trigger.innerHTML = `<span>${selected ? selected.textContent : 'Seleccionar...'}</span><span class="arrow">▼</span>`;
    this.renderOptions();
  }

  renderOptions() {
    this.optionsList.innerHTML = '';
    
    // Search bar
    const searchContainer = document.createElement('div');
    searchContainer.className = 'custom-select-search';
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = 'Buscar item...';
    this.searchInput.onclick = e => e.stopPropagation();
    this.searchInput.oninput = e => this.filterOptions(e.target.value);
    searchContainer.appendChild(this.searchInput);
    this.optionsList.appendChild(searchContainer);

    // Options
    Array.from(this.select.options).forEach((opt, index) => {
      const div = document.createElement('div');
      div.className = 'custom-option';
      if (index === this.select.selectedIndex) div.classList.add('selected');
      div.textContent = opt.textContent;
      div.onclick = e => {
        e.stopPropagation();
        this.select.selectedIndex = index;
        this.select.dispatchEvent(new Event('change'));
        this.update();
        this.close();
      };
      this.optionsList.appendChild(div);
    });
  }

  filterOptions(q) {
    const query = q.toLowerCase();
    const options = this.optionsList.querySelectorAll('.custom-option');
    options.forEach(opt => {
      const text = opt.textContent.toLowerCase();
      opt.classList.toggle('hidden', !text.includes(query));
    });
  }

  bindEvents() {
    // Clonar para limpiar listeners previos si re-inicializamos
    const newTrigger = this.trigger.cloneNode(true);
    this.trigger.parentNode.replaceChild(newTrigger, this.trigger);
    this.trigger = newTrigger;

    this.trigger.addEventListener('click', e => {
      e.stopPropagation();
      // Cerrar otros selects abiertos
      document.querySelectorAll('.custom-select-options.show').forEach(el => {
        if (el !== this.optionsList) {
          el.classList.remove('show');
          const trigger = el.parentNode.querySelector('.custom-select-trigger');
          if(trigger) trigger.classList.remove('active');
          el.parentNode.style.zIndex = "";
        }
      });
      this.toggle();
    });
    
    // Cerrar al hacer clic fuera
    document.addEventListener('click', (e) => {
      if (!this.container.contains(e.target)) {
        this.close();
      }
    });
  }

  toggle() {
    if (this.optionsList.classList.contains('show')) this.close(); else this.open();
  }

  open() {
    this.optionsList.classList.add('show');
    this.trigger.classList.add('active');
    this.container.style.zIndex = "10001"; // Prioridad visual
    if (this.searchInput) setTimeout(() => this.searchInput.focus(), 100);
  }

  close() {
    this.optionsList.classList.remove('show');
    this.trigger.classList.remove('active');
    this.container.style.zIndex = "";
  }
}


let headCustomSelect = null;

function buildHeadLab(){
  const sel = $("headSelect");
  const heads = (byCat.get("Head") || []);
  sel.innerHTML = heads.map(h=>`<option value="${h.ref}">${h.ref} — ${(h.name||"").replace(/\s*\(RARE\)\s*/i,"")}</option>`).join("");

  // Initialize or Update custom select
  if(!headCustomSelect) {
    headCustomSelect = new CustomSelect("headSelect");
  } else {
    headCustomSelect.update();
  }

  sel.onchange = ()=> {
    labLoadHead(sel.value);
    if(headCustomSelect) headCustomSelect.update();
  };
  $("headPrev").onclick = ()=> labStep(-1);
  $("headNext").onclick = ()=> labStep(1);
  $("headPlay").onclick = ()=> headLab.timer ? labStop() : labStart();

  const labFps = $("headFps");
  labFps.oninput  = e => { headLab.fps = Number(e.target.value)||6; labFps.dataset.touched="1"; if(headLab.timer) labStart(); };

  if(heads[0]) labLoadHead(heads[0].ref);
}

/** =================== BGM Logic =================== */
let bgmAudio = new Audio();
bgmAudio.loop = true;
let bgmInitialized = false;

function initBgm(){
  const select = $("bgmSelect");
  const volume = $("bgmVolume");
  const toggle = $("bgmToggle");
  if(!select || !volume || !toggle) return;

  const startBgm = () => {
    if(select.value && !bgmInitialized){
      bgmAudio.src = select.value;
      bgmAudio.volume = volume.value;
      bgmAudio.muted = false; // Asegurar que no esté silenciado
      bgmAudio.play()
        .then(() => { 
          bgmInitialized = true; 
          toggle.textContent = "🔊"; 
        })
        .catch(e => {
          console.log("Auto-play blocked, waiting for interaction.");
          toggle.textContent = "🔊"; // Mantener ícono de activo para esperar el primer clic
        });
    }
  };


  // Intentar sonar inmediatamente (si el navegador lo permite)
  startBgm();


  const updateBgm = () => {
    if(select.value){
      bgmAudio.src = select.value;
      bgmAudio.volume = volume.value;
      bgmAudio.play().catch(e => console.error("Error playing BGM:", e));
      toggle.textContent = "🔊";
      bgmInitialized = true;
    } else {
      bgmAudio.pause();
      toggle.textContent = "🔇";
    }
  };

  select.addEventListener("change", () => {
    updateBgm();
  });

  volume.addEventListener("input", () => {
    bgmAudio.volume = volume.value;
    if(volume.value > 0 && bgmAudio.paused && select.value){
      bgmAudio.play().catch(() => {});
      toggle.textContent = "🔊";
    }
  });

  toggle.onclick = (e) => {
    e.preventDefault();
    if(bgmAudio.paused && select.value){
      bgmAudio.play().catch(() => {});
      toggle.textContent = "🔊";
    } else {
      bgmAudio.pause();
      toggle.textContent = "🔇";
    }
  };

  // Initialize Custom UI after events are bound
  new CustomSelect("bgmSelect");
  new CustomSelect("moveSound");

  // First interaction trigger
  document.addEventListener("click", startBgm, { once: true });
}

function createWatermarks(container, customStep) {
  if (!container) return;
  const icons = [
    "./img/svg.svg",
    "./img/svg.svg"
  ];
  const step = customStep || 300;
  const rows = Math.ceil(container.offsetHeight / step) + 2;
  const cols = Math.ceil(container.offsetWidth / step) + 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const iconDiv = document.createElement("div");
      iconDiv.className = "loader-watermark-icon";
      const isFavicon = (r + c) % 2 === 1;
      iconDiv.style.backgroundImage = `url("${icons[isFavicon ? 1 : 0]}")`;
      iconDiv.style.left = `${c * step + (r % 2 === 0 ? 0 : step / 2) - step/4}px`;
      iconDiv.style.top = `${r * step - step/4}px`;
      
      if (isFavicon) {
        iconDiv.style.opacity = "1";
        iconDiv.style.filter = "none";
      } else {
        iconDiv.style.opacity = "0.7";
      }

      iconDiv.style.animationDelay = `${(r + c) * 0.2}s`;
      container.appendChild(iconDiv);
    }
  }
}


async function startPreloader() {
  const overlay = $("preloader");
  const pattern = overlay?.querySelector(".loader-background-pattern");
  if (pattern) createWatermarks(pattern);

  const bar = $("loader-bar");

  const avatar = $("loader-avatar");
  const text = $("loader-text");
  if (!overlay || !bar || !avatar || !text) return;

  const spriteUrl = LOADER_CONFIG.headSprite;

  
  // Use existing sprite info logic
  let info;
  try {
    info = await getSpriteInfo(spriteUrl, "Head");
  } catch (e) {
    info = { frames: 1, mode: "h", frameWidth: 80, frameHeight: 80 };
  }

  avatar.style.backgroundImage = `url("${spriteUrl}")`;
  avatar.style.width = `${info.frameWidth}px`;
  avatar.style.height = `${info.frameHeight}px`;

  let progress = 0;
  let tickCount = 0;
  const fps = 25;
  const interval = 1000 / fps;

  return new Promise(resolve => {
    const timer = setInterval(() => {
      tickCount++;
      
      // Update progress
      const step = 100 / (LOADER_CONFIG.duration * fps);
      progress += step; 
      if (progress > 100) progress = 100;



      // Update UI
      bar.style.width = `${progress}%`;
      avatar.style.left = `${progress}%`;
      text.textContent = `CARGANDO... ${Math.floor(progress)}%`;

      // Animate Sprite (Boomerang/Ping-pong)
      let f = 0;
      if (info.frames > 1) {
        const cycle = 2 * (info.frames - 1);
        const pos = tickCount % cycle;
        f = pos < info.frames ? pos : cycle - pos;
      }
      setSpriteFrame(avatar, info, f);

      if (progress >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          overlay.classList.add("fade-out");
          setTimeout(() => {
            overlay.remove();
            resolve();
          }, 600);
        }, 400);
      }
    }, interval);
  });
}

(async function init(){
  try{
    await loadAppConfig();

    // Inicializar marcas de agua en la página principal y vista previa
    createWatermarks($("main-watermark"));
    const previewPattern = $("preview")?.querySelector(".loader-background-pattern");
    if (previewPattern) createWatermarks(previewPattern, 120); // Más denso para el preview

    // Inicializar BGM lo antes posible para capturar el primer clic en la pantalla de carga

    initBgm();

    // Iniciamos el preloader pero NO lo esperamos aún para que la app cargue en paralelo
    const preloaderTask = startPreloader();

    setStatus("Cargando items…");

    allItems = await loadAllRows();

    // Agrupa por categoría y ordena
    byCat = new Map();
    for(const row of allItems){
      if(!row || !row.category) continue;
      if(!byCat.has(row.category)) byCat.set(row.category, []);
      byCat.get(row.category).push(row);
    }
    for(const [cat, arr] of byCat){
      arr.sort((a,b)=>{
        const pa = a.page ?? 1, pb = b.page ?? 1;
        if(pa !== pb) return pa - pb;
        const ra = String(a.ref||""), rb = String(b.ref||"");
        return ra.localeCompare(rb);
      });
      byCat.set(cat, arr);
    }

    currentCat = LAYER_ORDER.find(c=>byCat.has(c)) || "Head";

    // Renderizado en segundo plano mientras avanza el preloader
    renderTabs();
    wirePagerAndFps();
    wireKeyboardNavigation();
    wirePreviewConfigDialog();
    await renderGrid();
    updatePagerInfo();
    await renderPreview();
    renderEquippedList();


    // Esperamos a que el preloader termine su tiempo mínimo (configurado en JSON)
    await preloaderTask;

    // Mostrar marcas de agua en la página principal tras la carga
    const mainW = $("main-watermark");
    if (mainW) {
      mainW.style.transition = "opacity 2s ease";
      mainW.style.opacity = "0.08";
    }

    // Mobile Equipped Dialog
    const mobileEqBtn = $("mobileEquippedBtn");
    const mobileEqDialog = $("equippedDialog");
    const mobileEqClose = $("equippedDialogClose");
    if(mobileEqBtn && mobileEqDialog){
      mobileEqBtn.onclick = () => {
        renderEquippedList();
        mobileEqDialog.showModal();
      };
      if(mobileEqClose) mobileEqClose.onclick = () => mobileEqDialog.close();
      mobileEqDialog.onclick = (e) => { if(e.target === mobileEqDialog) mobileEqDialog.close(); };
    }

    setStatus("");
  }catch(err){
    console.error(err);
    setStatus("Error cargando tienda.");
  }
})();


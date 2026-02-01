const API_BASE = "http://localhost:3001";
const canvas = document.getElementById("preview");
const ctx = canvas.getContext("2d");

const csvFileInput = document.getElementById("csvFile");
const loadDefaultCsvBtn = document.getElementById("loadDefaultCsv");
const rowSelect = document.getElementById("rowSelect");
const rowMeta = document.getElementById("rowMeta");
const columnList = document.getElementById("columnList");
const csvStatus = document.getElementById("csvStatus");
const layoutSelect = document.getElementById("layoutSelect");
const toggleGuides = document.getElementById("toggleGuides");
const resetPlacement = document.getElementById("resetPlacement");
const addImageBtn = document.getElementById("addImage");
const addTextBtn = document.getElementById("addText");
const addShapeBtn = document.getElementById("addShape");
const layersList = document.getElementById("layersList");
const inspector = document.getElementById("inspector");
const exportSheetBtn = document.getElementById("exportSheet");
const copyTemplateBtn = document.getElementById("copyTemplate");
const saveTemplateBtn = document.getElementById("saveTemplate");
const loadTemplateBtn = document.getElementById("loadTemplate");

const dataSourceRadios = document.querySelectorAll("input[name='dataSource']");
const csvControls = document.getElementById("csvControls");
const sheetsControls = document.getElementById("sheetsControls");
const sheetIdInput = document.getElementById("sheetId");
const sheetTabSelect = document.getElementById("sheetTab");
const connectSheetBtn = document.getElementById("connectSheet");
const refreshSheetBtn = document.getElementById("refreshSheet");
const sheetStatus = document.getElementById("sheetStatus");

const urlColumnSelect = document.getElementById("urlColumnSelect");
const urlColumnCustom = document.getElementById("urlColumnCustom");

const previewGallery = document.getElementById("previewGallery");
const previewStartRowInput = document.getElementById("previewStartRow");
const previewEndRowInput = document.getElementById("previewEndRow");
const preview20Btn = document.getElementById("preview20");
const preview50Btn = document.getElementById("preview50");
const generatePreviewBtn = document.getElementById("generatePreview");
const clearPreviewBtn = document.getElementById("clearPreview");
const previewStatus = document.getElementById("previewStatus");

const bulkStartRowInput = document.getElementById("bulkStartRow");
const bulkEndRowInput = document.getElementById("bulkEndRow");
const bulkAllRowsBtn = document.getElementById("bulkAllRows");
const bulkExportBtn = document.getElementById("bulkExport");
const bulkStatus = document.getElementById("bulkStatus");

const FONT_OPTIONS = [
  "Playfair Display",
  "Merriweather",
  "Montserrat",
  "Lora",
  "Libre Baskerville",
  "Cormorant Garamond",
  "Bodoni Moda",
  "Spectral",
  "EB Garamond",
  "Prata",
  "Old Standard TT",
  "Poppins",
  "Raleway",
  "Work Sans",
  "Source Sans 3",
  "Space Grotesk",
  "Archivo",
  "Nunito Sans",
  "DM Sans",
  "Oswald",
  "Bebas Neue",
];

const PRESETS = {
  leftSquareRightFull: {
    label: "Left Square + Right Full",
    build: () => [
      createImageLayer("Left Image", 0, 0, 540, 540),
      createImageLayer("Right Image", 540, 0, 540, 1080),
      createTextLayer("Non-Dynamic Text", 140, 640, 400),
      createTextLayer("{title}", 140, 720, 420, {
        fontFamily: "Cormorant Garamond",
        fontSize: 36,
        fontWeight: 400,
      }),
      createTextLayer("{price}", 140, 790, 420, {
        fontFamily: "Space Grotesk",
        fontSize: 28,
        fontWeight: 600,
      }),
    ],
  },
  twoSquaresText: {
    label: "Two Squares + Text",
    build: () => [
      createImageLayer("Left Image", 0, 0, 540, 540),
      createImageLayer("Right Image", 540, 0, 540, 540),
      createTextLayer("{title}", 140, 660, 420),
      createTextLayer("{price}", 140, 730, 420, {
        fontFamily: "Space Grotesk",
        fontSize: 28,
        fontWeight: 600,
      }),
    ],
  },
  sideBySide: {
    label: "Side-by-side Full Height",
    build: () => [
      createImageLayer("Left Image", 0, 0, 540, 1080),
      createImageLayer("Right Image", 540, 0, 540, 1080),
    ],
  },
  blank: {
    label: "Blank Canvas",
    build: () => [createImageLayer("Image", 120, 120, 420, 420)],
  },
};

const state = {
  rows: [],
  columns: [],
  columnMap: new Map(),
  currentRowIndex: 0,
  imageCache: new Map(),
  layers: [],
  selectedLayerId: null,
  rowVersion: 0,
  showGuides: false,
  dragging: null,
  dataSource: "csv",
  sheetId: "",
  sheetTab: "",
};

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createImageLayer(name, x, y, w, h) {
  return {
    id: createId("img"),
    type: "image",
    name,
    x,
    y,
    w,
    h,
    visible: true,
    column: "",
    fallbackColumn: "",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
    image: null,
    url: "",
  };
}

function createTextLayer(template, x, y, maxWidth, overrides = {}) {
  return {
    id: createId("text"),
    type: "text",
    name: "Text",
    x,
    y,
    visible: true,
    template,
    fallbackColumn: "",
    fontFamily: "Playfair Display",
    fontSize: 32,
    fontWeight: 600,
    color: "#111111",
    align: "left",
    maxWidth,
    lineHeight: 1.2,
    ...overrides,
  };
}

function createShapeLayer(name, x, y, w, h) {
  return {
    id: createId("shape"),
    type: "shape",
    name,
    x,
    y,
    w,
    h,
    visible: true,
    fill: "#f1ede7",
    stroke: "#9b8a7b",
    strokeWidth: 2,
    radius: 16,
  };
}

function setStatus(message) {
  csvStatus.textContent = message;
}

let autoSaveTimer = null;

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    const template = serializeTemplate();
    localStorage.setItem("scaled-image-edit-template", JSON.stringify(template));
  }, 500);
}

function showToast(message, tone = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("toast-hide");
    setTimeout(() => toast.remove(), 400);
  }, 2200);
}

function setSheetStatus(message) {
  sheetStatus.textContent = message;
}

function setBulkStatus(message) {
  if (!bulkStatus) return;
  bulkStatus.textContent = message;
}

function setPreviewStatus(message) {
  if (!previewStatus) return;
  previewStatus.textContent = message;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) {
    rows.push(row);
  }
  return rows;
}

function loadRows(columns, rows) {
  state.columns = columns;
  state.columnMap = new Map(columns.map((h) => [h.toLowerCase(), h]));
  state.rows = rows.map((row) => {
    const record = {};
    columns.forEach((key, index) => {
      record[key] = row[index] ?? "";
    });
    return record;
  });
  state.currentRowIndex = 0;

  updateColumnList();
  populateRowSelect();
  ensureDefaultColumns();
  populateOutputColumnSelects();
  if (bulkStartRowInput) {
    bulkStartRowInput.value = bulkStartRowInput.value || 2;
  }
  if (bulkEndRowInput) {
    bulkEndRowInput.value = state.rows.length + 1;
  }
  if (previewStartRowInput) {
    previewStartRowInput.value = previewStartRowInput.value || 2;
  }
  if (previewEndRowInput) {
    previewEndRowInput.value = Math.min(state.rows.length + 1, 21);
  }
  refreshLayerImages();
  render();
}

function loadCSVText(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    setStatus("CSV loaded but no data rows found.");
    return;
  }

  loadRows(rows[0].map((h) => h.trim()), rows.slice(1));
  setStatus(`Loaded ${state.rows.length} rows.`);
}

function updateColumnList() {
  columnList.innerHTML = "";
  state.columns.slice(0, 10).forEach((col) => {
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = col;
    columnList.appendChild(pill);
  });
  if (state.columns.length > 10) {
    const more = document.createElement("span");
    more.className = "pill";
    more.textContent = `+${state.columns.length - 10} more`;
    columnList.appendChild(more);
  }
}

function populateRowSelect() {
  rowSelect.innerHTML = "";
  state.rows.forEach((row, index) => {
    const option = document.createElement("option");
    const title = row.title || row["title"] || row["Title"] || "Untitled";
    option.value = index;
    const sheetRow = index + 2;
    option.textContent = `${sheetRow}. ${title}`;
    rowSelect.appendChild(option);
  });
  rowSelect.value = state.currentRowIndex;
  updateRowMeta();
}

function updateRowMeta() {
  const row = state.rows[state.currentRowIndex];
  if (!row) {
    rowMeta.textContent = "No row selected.";
    return;
  }
  const id = row.id || row["id"] || row["old id"] || "";
  const price = row.price || row["price"] || "";
  const sheetRow = state.currentRowIndex + 2;
  rowMeta.textContent = `Sheet row: ${sheetRow} | ID: ${id || "n/a"} | Price: ${price || "n/a"}`;
}

function guessColumn(nameIncludes, fallback) {
  const match = state.columns.find((col) => col.toLowerCase().includes(nameIncludes));
  return match || fallback || state.columns[0] || "";
}

function ensureDefaultColumns() {
  const leftGuess =
    state.columns.find((col) => col.toLowerCase() === "image link") ||
    guessColumn("image link", guessColumn("image"));
  const rightGuess =
    state.columns.find((col) => col.toLowerCase() === "additional image link") ||
    state.columns.find((col) => col.toLowerCase() === "old additional image link") ||
    guessColumn("additional", guessColumn("image"));

  const imageLayers = state.layers.filter((layer) => layer.type === "image");
  if (imageLayers[0] && !imageLayers[0].column) imageLayers[0].column = leftGuess;
  if (imageLayers[1] && !imageLayers[1].column) imageLayers[1].column = rightGuess;

  renderInspector();
}

function applyPreset(key) {
  const preset = PRESETS[key];
  if (!preset) return;
  state.layers = preset.build();
  state.selectedLayerId = state.layers[0]?.id || null;
  ensureDefaultColumns();
  refreshLayerImages();
  renderLayersList();
  renderInspector();
  render();
}

function refreshLayerImages(rowIndex = state.currentRowIndex, version = state.rowVersion) {
  const promises = state.layers.map((layer) => {
    if (layer.type !== "image") return Promise.resolve(false);
    return loadImageForLayer(layer, rowIndex, version);
  });
  return Promise.all(promises);
}

function getImageSourceUrl(url) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return `${API_BASE}/api/image?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function pickImageUrl(value) {
  if (!value) return "";
  if (value.includes(",")) {
    return value.split(",")[0].trim();
  }
  return value.trim();
}

function loadImageForLayer(layer, rowIndex = state.currentRowIndex, version = state.rowVersion) {
  const row = state.rows[rowIndex];
  if (!row || !layer.column) {
    layer.image = null;
    layer.url = "";
    render();
    return Promise.resolve(false);
  }

  const primaryValue = row[layer.column] || "";
  const primaryUrl = pickImageUrl(primaryValue);
  const fallbackValue = layer.fallbackColumn ? row[layer.fallbackColumn] || "" : "";
  const fallbackUrl = pickImageUrl(fallbackValue);

  let url = primaryUrl || fallbackUrl;
  layer.url = url;

  if (!url) {
    layer.image = null;
    render();
    return Promise.resolve(false);
  }

  if (state.imageCache.has(url)) {
    layer.image = state.imageCache.get(url);
    render();
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const attemptLoad = (urlToLoad, usedFallback) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (version !== state.rowVersion || rowIndex !== state.currentRowIndex) {
          resolve(false);
          return;
        }
        state.imageCache.set(urlToLoad, img);
        layer.image = img;
        layer.url = urlToLoad;
        clampImageOffset(layer);
        render();
        resolve(true);
      };
      img.onerror = () => {
        if (!usedFallback && fallbackUrl && fallbackUrl !== urlToLoad) {
          attemptLoad(fallbackUrl, true);
          return;
        }
        if (version !== state.rowVersion || rowIndex !== state.currentRowIndex) {
          resolve(false);
          return;
        }
        layer.image = null;
        render();
        resolve(false);
      };
      img.src = getImageSourceUrl(urlToLoad);
    };

    attemptLoad(url, false);
  });
}

function clampImageOffset(layer) {
  if (!layer.image) return;
  const img = layer.image;
  const frame = layer;

  const baseScale = Math.max(frame.w / img.width, frame.h / img.height);
  const drawW = img.width * baseScale * layer.zoom;
  const drawH = img.height * baseScale * layer.zoom;
  const maxShiftX = Math.abs(drawW - frame.w) / 2;
  const maxShiftY = Math.abs(drawH - frame.h) / 2;

  layer.offsetX = Math.min(maxShiftX, Math.max(-maxShiftX, layer.offsetX));
  layer.offsetY = Math.min(maxShiftY, Math.max(-maxShiftY, layer.offsetY));
}

function resolveTemplate(layer, row) {
  const template = layer.template || "";
  const resolved = template.replace(/\{([^}]+)\}/g, (match, key) => {
    const normalized = key.trim().toLowerCase();
    const actualKey = state.columnMap.get(normalized);
    if (!actualKey) return "";
    return row[actualKey] ?? "";
  });
  if (layer.fallbackColumn && resolved.trim() === "") {
    return row[layer.fallbackColumn] ?? "";
  }
  return resolved;
}

function wrapText(text, font, maxWidth) {
  if (!maxWidth || maxWidth <= 0) return [text];
  ctx.font = font;
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";

  words.forEach((word) => {
    const test = line ? `${line} ${word}` : word;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function measureText(layer, row) {
  const text = resolveTemplate(layer, row);
  const font = `${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
  const lines = wrapText(text, font, layer.maxWidth);
  const lineHeight = layer.fontSize * (layer.lineHeight || 1.2);
  const widths = lines.map((line) => ctx.measureText(line).width);
  const width = widths.length ? Math.max(...widths) : 0;
  const height = lines.length * lineHeight;
  return { text, lines, lineHeight, width, height, font };
}

function getTextBounds(layer, row) {
  const measurement = measureText(layer, row);
  let x = layer.x;
  if (layer.align === "center") {
    x -= measurement.width / 2;
  } else if (layer.align === "right") {
    x -= measurement.width;
  }
  return {
    ...measurement,
    x,
    y: layer.y,
  };
}

function render() {
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const row = state.rows[state.currentRowIndex] || {};

  state.layers.forEach((layer) => {
    if (!layer.visible) return;
    if (layer.type === "image") {
      drawImageLayer(layer);
    } else if (layer.type === "text") {
      drawTextLayer(layer, row);
    } else if (layer.type === "shape") {
      drawShapeLayer(layer);
    }
  });

  if (state.showGuides) {
    drawGuides(row);
  }
  scheduleAutoSave();
}

function drawImageLayer(layer) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(layer.x, layer.y, layer.w, layer.h);
  ctx.clip();

  if (layer.image) {
    const img = layer.image;
    const baseScale = Math.max(layer.w / img.width, layer.h / img.height);
    const drawW = img.width * baseScale * layer.zoom;
    const drawH = img.height * baseScale * layer.zoom;
    const centerX = layer.x + layer.w / 2 + layer.offsetX;
    const centerY = layer.y + layer.h / 2 + layer.offsetY;
    const dx = centerX - drawW / 2;
    const dy = centerY - drawH / 2;
    ctx.drawImage(img, dx, dy, drawW, drawH);
  } else {
    ctx.fillStyle = "#f1ede7";
    ctx.fillRect(layer.x, layer.y, layer.w, layer.h);
    ctx.fillStyle = "#9b8a7b";
    ctx.font = "14px Space Grotesk";
    ctx.textAlign = "center";
    ctx.fillText("No image", layer.x + layer.w / 2, layer.y + layer.h / 2);
  }
  ctx.restore();
}

function drawTextLayer(layer, row) {
  const measurement = measureText(layer, row);
  ctx.font = measurement.font;
  ctx.fillStyle = layer.color || "#111";
  ctx.textAlign = layer.align || "left";
  ctx.textBaseline = "top";

  measurement.lines.forEach((line, index) => {
    ctx.fillText(line, layer.x, layer.y + index * measurement.lineHeight);
  });
}

function drawShapeLayer(layer) {
  const radius = Math.min(layer.radius || 0, layer.w / 2, layer.h / 2);
  ctx.save();
  ctx.beginPath();
  roundedRectPath(layer.x, layer.y, layer.w, layer.h, radius);
  ctx.fillStyle = layer.fill || "#f1ede7";
  ctx.fill();
  if (layer.strokeWidth > 0) {
    ctx.strokeStyle = layer.stroke || "#9b8a7b";
    ctx.lineWidth = layer.strokeWidth;
    ctx.stroke();
  }
  ctx.restore();
}

function roundedRectPath(x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawGuides(row) {
  state.layers.forEach((layer) => {
    if (!layer.visible) return;
    if (layer.type === "image" || layer.type === "shape") {
      ctx.strokeStyle = layer.id === state.selectedLayerId ? "rgba(208, 122, 74, 0.8)" : "rgba(208, 122, 74, 0.4)";
      ctx.lineWidth = layer.id === state.selectedLayerId ? 2 : 1;
      ctx.strokeRect(layer.x + 1, layer.y + 1, layer.w - 2, layer.h - 2);
      if (layer.id === state.selectedLayerId) {
        drawHandles(layer);
      }
    }
    if (layer.type === "text" && layer.id === state.selectedLayerId) {
      const bounds = getTextBounds(layer, row);
      ctx.strokeStyle = "rgba(75, 50, 30, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bounds.x - 4, bounds.y - 4, bounds.width + 8, bounds.height + 8);
    }
  });
}

function drawHandles(layer) {
  const handles = getHandlePoints(layer);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#d07a4a";
  ctx.lineWidth = 2;
  handles.forEach((pt) => {
    ctx.beginPath();
    ctx.rect(pt.x - 5, pt.y - 5, 10, 10);
    ctx.fill();
    ctx.stroke();
  });
}

function getHandlePoints(layer) {
  return [
    { x: layer.x, y: layer.y, key: "nw" },
    { x: layer.x + layer.w, y: layer.y, key: "ne" },
    { x: layer.x, y: layer.y + layer.h, key: "sw" },
    { x: layer.x + layer.w, y: layer.y + layer.h, key: "se" },
  ];
}

function hitTestLayer(x, y) {
  const row = state.rows[state.currentRowIndex] || {};
  for (let i = state.layers.length - 1; i >= 0; i -= 1) {
    const layer = state.layers[i];
    if (!layer.visible) continue;
    if (layer.type === "text") {
      const bounds = getTextBounds(layer, row);
      if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
        return layer;
      }
    } else {
      if (x >= layer.x && x <= layer.x + layer.w && y >= layer.y && y <= layer.y + layer.h) {
        return layer;
      }
    }
  }
  return null;
}

function hitTestHandle(layer, x, y) {
  const handles = getHandlePoints(layer);
  return handles.find((pt) => Math.abs(pt.x - x) <= 8 && Math.abs(pt.y - y) <= 8);
}

function selectLayer(id) {
  state.selectedLayerId = id;
  renderLayersList();
  renderInspector();
  render();
}

function getSelectedLayer() {
  return state.layers.find((layer) => layer.id === state.selectedLayerId) || null;
}

function renderLayersList() {
  layersList.innerHTML = "";
  state.layers.forEach((layer, index) => {
    const item = document.createElement("div");
    item.className = "layer-item";

    const header = document.createElement("div");
    header.className = "layer-header";

    const title = document.createElement("div");
    title.className = "layer-title";
    title.textContent = `${layer.name} (${layer.type})`;
    header.appendChild(title);

    const selectBtn = document.createElement("button");
    selectBtn.className = layer.id === state.selectedLayerId ? "tiny" : "ghost tiny";
    selectBtn.textContent = layer.id === state.selectedLayerId ? "Selected" : "Select";
    selectBtn.addEventListener("click", () => selectLayer(layer.id));
    header.appendChild(selectBtn);

    item.appendChild(header);

    const actions = document.createElement("div");
    actions.className = "layer-actions";

    const upBtn = document.createElement("button");
    upBtn.className = "ghost tiny";
    upBtn.textContent = "Up";
    upBtn.disabled = index === state.layers.length - 1;
    upBtn.addEventListener("click", () => moveLayer(index, index + 1));

    const downBtn = document.createElement("button");
    downBtn.className = "ghost tiny";
    downBtn.textContent = "Down";
    downBtn.disabled = index === 0;
    downBtn.addEventListener("click", () => moveLayer(index, index - 1));

    const visBtn = document.createElement("button");
    visBtn.className = "ghost tiny";
    visBtn.textContent = layer.visible ? "Hide" : "Show";
    visBtn.addEventListener("click", () => {
      layer.visible = !layer.visible;
      renderLayersList();
      render();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "ghost tiny";
    deleteBtn.textContent = "Delete";
    deleteBtn.addEventListener("click", () => {
      state.layers = state.layers.filter((itemLayer) => itemLayer.id !== layer.id);
      if (state.selectedLayerId === layer.id) {
        state.selectedLayerId = state.layers[0]?.id || null;
      }
      renderLayersList();
      renderInspector();
      render();
    });

    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(visBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(actions);
    layersList.appendChild(item);
  });
}

function moveLayer(fromIndex, toIndex) {
  if (toIndex < 0 || toIndex >= state.layers.length) return;
  const layers = [...state.layers];
  const [moved] = layers.splice(fromIndex, 1);
  layers.splice(toIndex, 0, moved);
  state.layers = layers;
  renderLayersList();
  render();
}

function renderInspector() {
  inspector.innerHTML = "";
  const layer = getSelectedLayer();
  if (!layer) {
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Select a layer to edit its settings.";
    inspector.appendChild(hint);
    return;
  }

  const nameRow = makeInputRow("Name", layer, "name", "text", (value) => {
    layer.name = value;
    renderLayersList();
  });
  inspector.appendChild(nameRow);

  if (layer.type === "image") {
    inspector.appendChild(makeSelectRow("Column", layer, "column", state.columns, (value) => {
      layer.column = value;
      loadImageForLayer(layer);
    }));

    inspector.appendChild(makeSelectRowWithNone("Backup column", layer, "fallbackColumn", state.columns, (value) => {
      layer.fallbackColumn = value;
      loadImageForLayer(layer);
    }));

    inspector.appendChild(makeRangeRow("Zoom", layer, "zoom", 0.3, 4, 0.01, (value) => {
      layer.zoom = value;
      clampImageOffset(layer);
      render();
    }));

    inspector.appendChild(makeInputRow("X", layer, "x", "number", (value) => {
      layer.x = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Y", layer, "y", "number", (value) => {
      layer.y = value;
      render();
    }));
    inspector.appendChild(makeInputRow("W", layer, "w", "number", (value) => {
      layer.w = value;
      render();
    }));
    inspector.appendChild(makeInputRow("H", layer, "h", "number", (value) => {
      layer.h = value;
      render();
    }));

    const actions = document.createElement("div");
    actions.className = "row inline";
    const centerBtn = document.createElement("button");
    centerBtn.className = "ghost";
    centerBtn.textContent = "Center image";
    centerBtn.addEventListener("click", () => {
      layer.offsetX = 0;
      layer.offsetY = 0;
      render();
    });
    const fitBtn = document.createElement("button");
    fitBtn.className = "ghost";
    fitBtn.textContent = "Fit";
    fitBtn.addEventListener("click", () => {
      layer.zoom = 1;
      layer.offsetX = 0;
      layer.offsetY = 0;
      renderInspector();
      render();
    });
    actions.appendChild(centerBtn);
    actions.appendChild(fitBtn);
    inspector.appendChild(actions);
  }

  if (layer.type === "text") {
    inspector.appendChild(makeInputRow("Template", layer, "template", "text", (value) => {
      layer.template = value;
      render();
    }));

    inspector.appendChild(makeSelectRowWithNone("Backup column", layer, "fallbackColumn", state.columns, (value) => {
      layer.fallbackColumn = value;
      render();
    }));
    inspector.appendChild(makeSelectRow("Font", layer, "fontFamily", FONT_OPTIONS, (value) => {
      layer.fontFamily = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Size", layer, "fontSize", "number", (value) => {
      layer.fontSize = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Weight", layer, "fontWeight", "number", (value) => {
      layer.fontWeight = value;
      render();
    }));
    inspector.appendChild(makeSelectRow("Align", layer, "align", ["left", "center", "right"], (value) => {
      layer.align = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Color", layer, "color", "color", (value) => {
      layer.color = value;
      render();
    }));
    inspector.appendChild(makeInputRow("X", layer, "x", "number", (value) => {
      layer.x = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Y", layer, "y", "number", (value) => {
      layer.y = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Max width", layer, "maxWidth", "number", (value) => {
      layer.maxWidth = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Line height", layer, "lineHeight", "number", (value) => {
      layer.lineHeight = value;
      render();
    }, 0.1));

    const insertRow = document.createElement("div");
    insertRow.className = "row inline";
    const columnSelect = document.createElement("select");
    state.columns.forEach((col) => {
      const option = document.createElement("option");
      option.value = col;
      option.textContent = col;
      columnSelect.appendChild(option);
    });
    const insertBtn = document.createElement("button");
    insertBtn.className = "ghost";
    insertBtn.textContent = "Insert column token";
    insertBtn.addEventListener("click", () => {
      layer.template = `${layer.template} {${columnSelect.value}}`;
      renderInspector();
      render();
    });
    insertRow.appendChild(columnSelect);
    insertRow.appendChild(insertBtn);
    inspector.appendChild(insertRow);
  }

  if (layer.type === "shape") {
    inspector.appendChild(makeInputRow("X", layer, "x", "number", (value) => {
      layer.x = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Y", layer, "y", "number", (value) => {
      layer.y = value;
      render();
    }));
    inspector.appendChild(makeInputRow("W", layer, "w", "number", (value) => {
      layer.w = value;
      render();
    }));
    inspector.appendChild(makeInputRow("H", layer, "h", "number", (value) => {
      layer.h = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Fill", layer, "fill", "color", (value) => {
      layer.fill = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Stroke", layer, "stroke", "color", (value) => {
      layer.stroke = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Stroke width", layer, "strokeWidth", "number", (value) => {
      layer.strokeWidth = value;
      render();
    }));
    inspector.appendChild(makeInputRow("Corner radius", layer, "radius", "number", (value) => {
      layer.radius = value;
      render();
    }));
  }
}

function makeInputRow(labelText, layer, field, type, onChange, step = null) {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  input.value = layer[field] ?? "";
  if (step !== null) input.step = step;
  input.addEventListener("input", () => {
    const value = type === "number" ? Number(input.value) : input.value;
    layer[field] = value;
    onChange?.(value);
  });
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  return wrapper;
}

function makeSelectRowWithNone(labelText, layer, field, options, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  const noneOption = document.createElement("option");
  noneOption.value = "";
  noneOption.textContent = "None";
  select.appendChild(noneOption);
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });
  select.value = layer[field] ?? "";
  select.addEventListener("change", () => {
    layer[field] = select.value;
    onChange?.(select.value);
  });
  wrapper.appendChild(label);
  wrapper.appendChild(select);
  return wrapper;
}

function makeSelectRow(labelText, layer, field, options, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  const label = document.createElement("label");
  label.textContent = labelText;
  const select = document.createElement("select");
  options.forEach((opt) => {
    const option = document.createElement("option");
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });
  select.value = layer[field] ?? "";
  select.addEventListener("change", () => {
    layer[field] = select.value;
    onChange?.(select.value);
  });
  wrapper.appendChild(label);
  wrapper.appendChild(select);
  return wrapper;
}

function makeRangeRow(labelText, layer, field, min, max, step, onChange) {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "range";
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = layer[field] ?? 1;
  const value = document.createElement("span");
  value.className = "value";
  value.textContent = Number(input.value).toFixed(2);
  input.addEventListener("input", () => {
    const num = Number(input.value);
    layer[field] = num;
    value.textContent = num.toFixed(2);
    onChange?.(num);
  });
  wrapper.appendChild(label);
  wrapper.appendChild(input);
  wrapper.appendChild(value);
  return wrapper;
}

function addLayer(type) {
  let layer = null;
  if (type === "image") {
    layer = createImageLayer("Image", 120, 120, 420, 420);
    layer.column = guessColumn("image link", guessColumn("image"));
    loadImageForLayer(layer);
  }
  if (type === "text") {
    layer = createTextLayer("{title}", 140, 860, 420, {
      fontSize: 28,
      fontWeight: 400,
    });
  }
  if (type === "shape") {
    layer = createShapeLayer("Shape", 200, 200, 300, 200);
  }
  if (!layer) return;
  state.layers.push(layer);
  selectLayer(layer.id);
  renderLayersList();
  renderInspector();
  render();
}

function getCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  const scale = canvas.width / rect.width;
  return {
    x: (event.clientX - rect.left) * scale,
    y: (event.clientY - rect.top) * scale,
  };
}

canvas.addEventListener("pointerdown", (event) => {
  const { x, y } = getCanvasCoordinates(event);
  const selectedLayer = getSelectedLayer();

  if (selectedLayer && (selectedLayer.type === "image" || selectedLayer.type === "shape")) {
    const handle = hitTestHandle(selectedLayer, x, y);
    if (handle) {
      state.dragging = {
        type: "resize",
        layerId: selectedLayer.id,
        handle: handle.key,
        startX: x,
        startY: y,
        base: { ...selectedLayer },
      };
      canvas.setPointerCapture(event.pointerId);
      return;
    }
  }

  const hitLayer = hitTestLayer(x, y);
  if (hitLayer) {
    selectLayer(hitLayer.id);
    if (hitLayer.type === "image") {
      const moveFrame = event.shiftKey;
      state.dragging = {
        type: moveFrame ? "move-frame" : "move-image",
        layerId: hitLayer.id,
        startX: x,
        startY: y,
        base: { ...hitLayer },
      };
    } else {
      state.dragging = {
        type: "move",
        layerId: hitLayer.id,
        startX: x,
        startY: y,
        base: { ...hitLayer },
      };
    }
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  selectLayer(null);
});

canvas.addEventListener("pointermove", (event) => {
  if (!state.dragging) return;
  const { x, y } = getCanvasCoordinates(event);
  const layer = state.layers.find((item) => item.id === state.dragging.layerId);
  if (!layer) return;

  if (state.dragging.type === "move") {
    layer.x = state.dragging.base.x + (x - state.dragging.startX);
    layer.y = state.dragging.base.y + (y - state.dragging.startY);
  }

  if (state.dragging.type === "move-frame") {
    layer.x = state.dragging.base.x + (x - state.dragging.startX);
    layer.y = state.dragging.base.y + (y - state.dragging.startY);
  }

  if (state.dragging.type === "move-image") {
    layer.offsetX = state.dragging.base.offsetX + (x - state.dragging.startX);
    layer.offsetY = state.dragging.base.offsetY + (y - state.dragging.startY);
    clampImageOffset(layer);
  }

  if (state.dragging.type === "resize") {
    const base = state.dragging.base;
    const dx = x - state.dragging.startX;
    const dy = y - state.dragging.startY;
    if (state.dragging.handle === "nw") {
      layer.x = base.x + dx;
      layer.y = base.y + dy;
      layer.w = Math.max(20, base.w - dx);
      layer.h = Math.max(20, base.h - dy);
    }
    if (state.dragging.handle === "ne") {
      layer.y = base.y + dy;
      layer.w = Math.max(20, base.w + dx);
      layer.h = Math.max(20, base.h - dy);
    }
    if (state.dragging.handle === "sw") {
      layer.x = base.x + dx;
      layer.w = Math.max(20, base.w - dx);
      layer.h = Math.max(20, base.h + dy);
    }
    if (state.dragging.handle === "se") {
      layer.w = Math.max(20, base.w + dx);
      layer.h = Math.max(20, base.h + dy);
    }
  }

  renderInspector();
  render();
});

canvas.addEventListener("pointerup", (event) => {
  if (state.dragging) {
    state.dragging = null;
  }
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("wheel", (event) => {
  const { x, y } = getCanvasCoordinates(event);
  const layer = hitTestLayer(x, y);
  if (!layer || layer.type !== "image") return;
  event.preventDefault();
  const delta = event.deltaY < 0 ? 0.05 : -0.05;
  layer.zoom = Math.min(4, Math.max(0.3, layer.zoom + delta));
  clampImageOffset(layer);
  renderInspector();
  render();
});

rowSelect.addEventListener("change", async (event) => {
  await ensureRowReady(Number(event.target.value));
});

layoutSelect.addEventListener("change", (event) => {
  applyPreset(event.target.value);
});

toggleGuides.addEventListener("change", (event) => {
  state.showGuides = event.target.checked;
  render();
});

resetPlacement.addEventListener("click", () => {
  state.layers.forEach((layer) => {
    if (layer.type === "image") {
      layer.zoom = 1;
      layer.offsetX = 0;
      layer.offsetY = 0;
    }
  });
  renderInspector();
  render();
});

csvFileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadCSVText(reader.result);
  reader.readAsText(file);
});

loadDefaultCsvBtn.addEventListener("click", async () => {
  try {
    const response = await fetch("Supplemental Feed Meta _ 1_26_26 - test.csv");
    if (!response.ok) throw new Error("Failed to load default CSV.");
    const text = await response.text();
    loadCSVText(text);
  } catch (error) {
    setStatus("Unable to load default CSV. Use the file picker instead.");
  }
});

addImageBtn.addEventListener("click", () => addLayer("image"));
addTextBtn.addEventListener("click", () => addLayer("text"));
addShapeBtn.addEventListener("click", () => addLayer("shape"));

exportSheetBtn.addEventListener("click", async () => {
  if (state.dataSource !== "sheets") {
    alert("Switch to Google Sheets to export to the sheet.");
    return;
  }
  const urlColumn = getSelectedOutputColumn();
  if (!urlColumn) {
    alert("Select an output column before exporting.");
    return;
  }
  setSheetStatus("Uploading to GCS and updating the sheet...");
  try {
    await ensureRowReady(state.currentRowIndex);
    const dataUrl = getExportDataUrl();
    const data = await uploadRowToSheet(state.currentRowIndex, urlColumn, dataUrl);
    const message = `Updated row ${data.sheetRow}`;
    setSheetStatus(`${message} → ${data.url}`);
    showToast(message, "success");
  } catch (error) {
    console.error(error);
    setSheetStatus("Upload failed. Check server logs.");
    showToast("Export failed", "error");
  }
});

if (bulkAllRowsBtn) {
  bulkAllRowsBtn.addEventListener("click", () => {
    if (bulkStartRowInput) bulkStartRowInput.value = 2;
    if (bulkEndRowInput) bulkEndRowInput.value = state.rows.length + 1;
  });
}

if (bulkExportBtn) {
  bulkExportBtn.addEventListener("click", async () => {
    if (state.dataSource !== "sheets") {
      alert("Switch to Google Sheets to export to the sheet.");
      return;
    }
    const urlColumn = getSelectedOutputColumn();
    if (!urlColumn) {
      alert("Select an output column before exporting.");
      return;
    }
    const startSheet = Math.max(2, Number(bulkStartRowInput?.value || 2));
    const endSheet = Math.min(state.rows.length + 1, Number(bulkEndRowInput?.value || 2));
    if (!Number.isFinite(startSheet) || !Number.isFinite(endSheet) || startSheet > endSheet) {
      alert("Enter a valid start/end sheet row (>= 2).");
      return;
    }
    const total = endSheet - startSheet + 1;
    let completed = 0;
    setBulkStatus(`Exporting ${total} rows...`);
    exportSheetBtn.disabled = true;
    bulkExportBtn.disabled = true;
    try {
      for (let sheetRow = startSheet; sheetRow <= endSheet; sheetRow += 1) {
        const rowIndex = sheetRow - 2;
        setBulkStatus(`Exporting sheet row ${sheetRow} (${sheetRow - startSheet + 1}/${total})`);
        await ensureRowReady(rowIndex);
        const dataUrl = getExportDataUrl();
        await uploadRowToSheet(rowIndex, urlColumn, dataUrl);
        completed += 1;
      }
      setBulkStatus(`Exported ${completed} rows.`);
      showToast(`Bulk export complete (${completed})`, "success");
    } catch (error) {
      console.error(error);
      setBulkStatus(`Bulk export failed after ${completed} rows.`);
      showToast("Bulk export failed", "error");
    } finally {
      exportSheetBtn.disabled = false;
      bulkExportBtn.disabled = false;
    }
  });
}

if (preview20Btn) {
  preview20Btn.addEventListener("click", () => {
    if (previewStartRowInput) previewStartRowInput.value = 2;
    if (previewEndRowInput) previewEndRowInput.value = Math.min(state.rows.length + 1, 21);
  });
}

if (preview50Btn) {
  preview50Btn.addEventListener("click", () => {
    if (previewStartRowInput) previewStartRowInput.value = 2;
    if (previewEndRowInput) previewEndRowInput.value = Math.min(state.rows.length + 1, 51);
  });
}

if (generatePreviewBtn) {
  generatePreviewBtn.addEventListener("click", async () => {
    const startSheet = Math.max(2, Number(previewStartRowInput?.value || 2));
    const endSheet = Math.min(state.rows.length + 1, Number(previewEndRowInput?.value || 2));
    if (!Number.isFinite(startSheet) || !Number.isFinite(endSheet) || startSheet > endSheet) {
      alert("Enter a valid preview range (>= 2).");
      return;
    }
    await generatePreviews(startSheet, endSheet);
  });
}

if (clearPreviewBtn) {
  clearPreviewBtn.addEventListener("click", () => {
    if (previewGallery) previewGallery.innerHTML = "";
    setPreviewStatus("");
  });
}

copyTemplateBtn.addEventListener("click", async () => {
  const template = serializeTemplate();
  try {
    await navigator.clipboard.writeText(JSON.stringify(template, null, 2));
  } catch (error) {
    console.warn("Clipboard not available.");
  }
});

saveTemplateBtn.addEventListener("click", () => {
  localStorage.setItem("scaled-image-edit-template", JSON.stringify(serializeTemplate()));
});

loadTemplateBtn.addEventListener("click", () => {
  const raw = localStorage.getItem("scaled-image-edit-template");
  if (!raw) return;
  try {
    applyTemplate(JSON.parse(raw));
  } catch (error) {
    console.warn("Failed to load template", error);
  }
});


function serializeTemplate() {
  return {
    layers: state.layers.map((layer) => {
      const base = { ...layer };
      delete base.image;
      return base;
    }),
  };
}

function applyTemplate(template) {
  if (!template || !Array.isArray(template.layers)) return;
  state.layers = template.layers.map((layer) => ({
    ...layer,
    image: null,
  }));
  state.selectedLayerId = state.layers[0]?.id || null;
  ensureDefaultColumns();
  refreshLayerImages();
  renderLayersList();
  renderInspector();
  render();
}

function populateOutputColumnSelects() {
  const selects = [
    { select: urlColumnSelect, custom: urlColumnCustom, defaultName: "gen image" },
  ];

  selects.forEach(({ select, custom, defaultName }) => {
    if (!select) return;
    select.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Select column";
    select.appendChild(empty);

    state.columns.forEach((col) => {
      const option = document.createElement("option");
      option.value = col;
      option.textContent = col;
      select.appendChild(option);
    });

    const customOption = document.createElement("option");
    customOption.value = "__custom__";
    customOption.textContent = "+ New column...";
    select.appendChild(customOption);

    if (state.columns.includes(defaultName)) {
      select.value = defaultName;
      custom.hidden = true;
    } else {
      select.value = "__custom__";
      custom.hidden = false;
      if (!custom.value) custom.value = defaultName;
    }
  });
}

function getOutputColumn(selectEl, customEl) {
  if (!selectEl) return "";
  const value = selectEl.value;
  if (value === "__custom__") {
    return customEl.value.trim();
  }
  return value;
}

function wireOutputColumnSelect(selectEl, customEl) {
  if (!selectEl) return;
  selectEl.addEventListener("change", () => {
    const isCustom = selectEl.value === "__custom__";
    customEl.hidden = !isCustom;
  });
}

function initLayoutSelect() {
  layoutSelect.innerHTML = "";
  Object.entries(PRESETS).forEach(([key, layout]) => {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = layout.label;
    layoutSelect.appendChild(option);
  });
  layoutSelect.value = "leftSquareRightFull";
}

function bumpRowVersion() {
  state.rowVersion += 1;
  return state.rowVersion;
}

function getSelectedOutputColumn() {
  return getOutputColumn(urlColumnSelect, urlColumnCustom);
}

async function ensureRowReady(rowIndex) {
  const version = bumpRowVersion();
  state.currentRowIndex = rowIndex;
  if (rowSelect) {
    rowSelect.value = rowIndex;
  }
  updateRowMeta();
  await refreshLayerImages(rowIndex, version);
  render();
}

async function generatePreviews(startSheetRow, endSheetRow) {
  if (!previewGallery) return;
  const total = endSheetRow - startSheetRow + 1;
  const previousRow = state.currentRowIndex;
  previewGallery.innerHTML = "";
  setPreviewStatus(`Generating ${total} previews (sheet rows)...`);
  for (let sheetRow = startSheetRow; sheetRow <= endSheetRow; sheetRow += 1) {
    const rowIndex = sheetRow - 2;
    await ensureRowReady(rowIndex);
    const dataUrl = getPreviewDataUrl();
    const card = document.createElement("div");
    card.className = "preview-thumb";
    const img = document.createElement("img");
    img.src = dataUrl;
    const label = document.createElement("span");
    label.textContent = `Row ${sheetRow}`;
    card.appendChild(img);
    card.appendChild(label);
    previewGallery.appendChild(card);
  }
  await ensureRowReady(previousRow);
  setPreviewStatus(`Generated ${total} previews.`);
}

async function uploadRowToSheet(rowIndex, urlColumn, dataUrl) {
  const response = await fetch(`${API_BASE}/api/upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sheet_id: state.sheetId,
      tab: state.sheetTab,
      row_index: rowIndex,
      output_columns: {
        url: urlColumn,
      },
      data_url: dataUrl,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Upload failed");
  }
  return response.json();
}

function getPreviewDataUrl() {
  const prevGuides = state.showGuides;
  const prevSelected = state.selectedLayerId;
  state.showGuides = false;
  state.selectedLayerId = null;
  render();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
  state.showGuides = prevGuides;
  state.selectedLayerId = prevSelected;
  render();
  return dataUrl;
}

function getExportDataUrl() {
  const prevGuides = state.showGuides;
  const prevSelected = state.selectedLayerId;
  state.showGuides = false;
  state.selectedLayerId = null;
  render();
  const dataUrl = canvas.toDataURL("image/png");
  state.showGuides = prevGuides;
  state.selectedLayerId = prevSelected;
  render();
  return dataUrl;
}

function setDataSource(source) {
  state.dataSource = source;
  csvControls.hidden = source !== "csv";
  sheetsControls.hidden = source !== "sheets";
  if (source === "sheets" && sheetIdInput.value.trim()) {
    connectSheet();
  }
}

async function fetchConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    if (!response.ok) return;
    const data = await response.json();
    if (data.sheetId) {
      sheetIdInput.value = data.sheetId;
      state.sheetId = data.sheetId;
    }
    if (data.defaultTab) {
      state.sheetTab = data.defaultTab;
      sheetTabSelect.value = data.defaultTab;
    }
  } catch (error) {
    console.warn("Config not loaded", error);
  }
}

async function connectSheet() {
  const sheetId = sheetIdInput.value.trim();
  if (!sheetId) {
    setSheetStatus("Sheet ID required.");
    return;
  }
  setSheetStatus("Connecting...");
  try {
    const response = await fetch(
      `${API_BASE}/api/sheets?sheet_id=${encodeURIComponent(sheetId)}`
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Unable to load sheet tabs");
    }
    const data = await response.json();
    sheetTabSelect.innerHTML = "";
    data.tabs.forEach((tab) => {
      const option = document.createElement("option");
      option.value = tab;
      option.textContent = tab;
      sheetTabSelect.appendChild(option);
    });
    const defaultTab = state.sheetTab || data.tabs[0];
    if (defaultTab) sheetTabSelect.value = defaultTab;
    state.sheetId = sheetId;
    state.sheetTab = sheetTabSelect.value;
    setSheetStatus(`Connected to ${sheetId}.`);
    await loadSheetRows();
  } catch (error) {
    console.error(error);
    setSheetStatus("Connection failed. Check server.");
  }
}

async function loadSheetRows() {
  if (!state.sheetId) return;
  const tab = sheetTabSelect.value;
  if (!tab) return;
  const headerRow = state.headerRow || 1;
  setSheetStatus("Loading rows...");
  try {
    const response = await fetch(
      `http://localhost:3001/api/rows?sheet_id=${encodeURIComponent(
        state.sheetId
      )}&tab=${encodeURIComponent(tab)}&limit=500&header_row=${headerRow}`
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Unable to load rows");
    }
    const data = await response.json();
    state.sheetTab = tab;
    loadRows(data.columns || [], data.rows || []);
    setSheetStatus(`Loaded ${state.rows.length} rows.`);
  } catch (error) {
    console.error(error);
    setSheetStatus("Row load failed.");
  }
}

dataSourceRadios.forEach((radio) => {
  radio.addEventListener("change", (event) => {
    setDataSource(event.target.value);
  });
});

connectSheetBtn.addEventListener("click", connectSheet);
refreshSheetBtn.addEventListener("click", loadSheetRows);

sheetTabSelect.addEventListener("change", () => {
  loadSheetRows();
});

function boot() {
  initLayoutSelect();
  const savedTemplate = localStorage.getItem("scaled-image-edit-template");
  if (savedTemplate) {
    try {
      applyTemplate(JSON.parse(savedTemplate));
    } catch (error) {
      applyPreset("leftSquareRightFull");
    }
  } else {
    applyPreset("leftSquareRightFull");
  }
  renderLayersList();
  renderInspector();
  render();

  fetchConfig();
  wireOutputColumnSelect(urlColumnSelect, urlColumnCustom);

  fetch("Supplemental Feed Meta _ 1_26_26 - test.csv")
    .then((response) => {
      if (!response.ok) throw new Error("default csv missing");
      return response.text();
    })
    .then((text) => loadCSVText(text))
    .catch(() => {
      setStatus("Ready. Load a CSV to start.");
    });
}

boot();

const gallery = document.querySelector("#gallery");
const resultCount = document.querySelector("#resultCount");
const clearFiltersButton = document.querySelector("#clearFilters");
const viewer = document.querySelector("#viewer");
const closePanelButton = document.querySelector("#closePanel");
const prevPhotoButton = document.querySelector("#prevPhoto");
const nextPhotoButton = document.querySelector("#nextPhoto");
const ambientImage = document.querySelector("#ambientImage");
const ambientTitle = document.querySelector("#ambientTitle");
const ambientMeta = document.querySelector("#ambientMeta");
const detailImage = document.querySelector("#detailImage");
const detailTitle = document.querySelector("#detailTitle");
const detailMeta = document.querySelector("#detailMeta");
const detailDescription = document.querySelector("#detailDescription");

const filters = {
  month: document.querySelector("#monthFilter"),
  prefecture: document.querySelector("#prefectureFilter"),
  region: document.querySelector("#regionFilter"),
  genre: document.querySelector("#genreFilter")
};

let photos = [];
let visiblePhotos = [];
let photoCards = [];
let ambientIndex = 0;
let viewerIndex = 0;
let ambientMap;
let ambientRouteLine;
let ambientMarkers = [];
let viewerMap;
let viewerRouteLine;
let viewerMarkers = [];
let ambientTimer;
let viewerTimer;
let ambientPauseTimer;

const tileUrl = "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png";
const tileAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';
const ambientInterval = 4600;
const viewerInterval = 7800;
const ambientPauseAfterTouch = 16000;

fetch("photos.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error("photos.json could not be loaded");
    }
    return response.json();
  })
  .then((data) => {
    photos = Array.isArray(data.photos) ? data.photos.map(normalizePhoto).filter(Boolean) : [];

    if (photos.length === 0) {
      throw new Error("表示できる写真データがありません");
    }

    buildFilters();
    initMaps();
    renderGallery();
    startAmbientFlow();
  })
  .catch((error) => {
    gallery.innerHTML = `<p class="empty-state">${error.message}</p>`;
    resultCount.textContent = "読み込みに失敗しました";
  });

Object.values(filters).forEach((select) => {
  select.addEventListener("change", () => {
    pauseAmbientFlow();
    closeViewer();
    renderGallery();
    startAmbientFlow();
  });
});

clearFiltersButton.addEventListener("click", () => {
  pauseAmbientFlow();
  Object.values(filters).forEach((select) => {
    select.value = "all";
  });
  closeViewer();
  renderGallery();
  startAmbientFlow();
});

closePanelButton.addEventListener("click", closeViewer);
prevPhotoButton.addEventListener("click", () => stepViewerPhoto(-1, true));
nextPhotoButton.addEventListener("click", () => stepViewerPhoto(1, true));

["pointerdown", "touchstart", "wheel"].forEach((eventName) => {
  gallery.addEventListener(eventName, pauseAmbientFlow, { passive: true });
});

document.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".viewer")) {
    pauseAmbientFlow();
  }
}, { passive: true });

document.addEventListener("keydown", (event) => {
  if (!document.body.classList.contains("viewer-active")) {
    return;
  }

  if (event.key === "Escape") {
    closeViewer();
  }

  if (event.key === "ArrowLeft") {
    stepViewerPhoto(-1, true);
  }

  if (event.key === "ArrowRight") {
    stepViewerPhoto(1, true);
  }
});

function buildFilters() {
  fillSelect(filters.month, uniqueValues("month"));
  fillSelect(filters.prefecture, uniqueValues("prefecture"));
  fillSelect(filters.region, uniqueValues("region"));
  fillSelect(filters.genre, uniqueValues("genre"));
}

function uniqueValues(key) {
  return [...new Set(photos.map((photo) => photo[key]).filter(Boolean))].sort();
}

function fillSelect(select, values) {
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });
}

function normalizePhoto(photo) {
  const lat = Number(photo.lat);
  const lng = Number(photo.lng);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    console.warn("Skipped photo with invalid coordinates:", photo);
    return null;
  }

  return {
    ...photo,
    lat,
    lng
  };
}

function renderGallery() {
  visiblePhotos = photos.filter((photo) => {
    return matches(photo, "month") &&
      matches(photo, "prefecture") &&
      matches(photo, "region") &&
      matches(photo, "genre");
  });

  gallery.innerHTML = "";
  photoCards = [];
  resultCount.textContent = `${visiblePhotos.length} / ${photos.length} photos`;

  if (visiblePhotos.length === 0) {
    gallery.innerHTML = '<p class="empty-state">条件に合う写真がありません。</p>';
    updateRoutes([]);
    return;
  }

  visiblePhotos.forEach((photo, index) => {
    const card = document.createElement("button");
    card.className = "photo-card";
    card.type = "button";
    card.style.setProperty("--delay", `${index * 90}ms`);
    card.innerHTML = `
      <img src="${getThumbSrc(photo)}" alt="${photo.title}" loading="${index < 4 ? "eager" : "lazy"}" decoding="async">
      <span class="card-caption">
        <h2>${photo.title}</h2>
        <p>${photo.month} / ${photo.prefecture} / ${photo.genre}</p>
      </span>
    `;
    card.addEventListener("click", () => {
      pauseAmbientFlow();
      openViewer(index);
    });
    gallery.appendChild(card);
    photoCards.push(card);
  });

  ambientIndex = Math.min(ambientIndex, visiblePhotos.length - 1);
  viewerIndex = Math.min(viewerIndex, visiblePhotos.length - 1);
  updateRoutes(visiblePhotos);
  updateAmbient(ambientIndex, false);
}

function matches(photo, key) {
  const selectedValue = filters[key].value;
  return selectedValue === "all" || photo[key] === selectedValue;
}

function initMaps() {
  const first = photos.find(hasCoordinates);

  if (!first || typeof L === "undefined") {
    return;
  }

  ambientMap = createMap("ambientMap", first, 10);
  viewerMap = createMap("viewerMap", first, 11);
}

function createMap(elementId, first, zoom) {
  const createdMap = L.map(elementId, {
    zoomControl: false,
    attributionControl: true
  }).setView([first.lat, first.lng], zoom);

  L.control.zoom({ position: "bottomright" }).addTo(createdMap);
  L.tileLayer(tileUrl, {
    attribution: tileAttribution,
    maxZoom: 19
  }).addTo(createdMap);

  return createdMap;
}

function createPhotoMarker(photo, index, isActive, onSelect) {
  const marker = L.marker([photo.lat, photo.lng], {
    icon: L.divIcon({
      className: "",
      html: `<div class="map-dot${isActive ? " is-active" : ""}" style="--dot-index:${index}"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    })
  });

  marker.on("click", () => onSelect(index));
  marker.bindTooltip(photo.title, {
    direction: "top",
    opacity: 0.88,
    offset: [0, -10]
  });

  return marker;
}

function startAmbientFlow() {
  stopAmbientFlow();

  if (visiblePhotos.length > 0) {
    updateAmbient(ambientIndex, false);
  }

  if (visiblePhotos.length > 1) {
    ambientTimer = setInterval(() => {
      ambientIndex = (ambientIndex + 1) % visiblePhotos.length;
      updateAmbient(ambientIndex, true);
    }, ambientInterval);
  }
}

function stopAmbientFlow() {
  if (ambientTimer) {
    clearInterval(ambientTimer);
    ambientTimer = null;
  }
}

function pauseAmbientFlow() {
  stopAmbientFlow();

  if (ambientPauseTimer) {
    clearTimeout(ambientPauseTimer);
  }

  ambientPauseTimer = setTimeout(() => {
    ambientPauseTimer = null;
    if (!document.body.classList.contains("viewer-active")) {
      startAmbientFlow();
    }
  }, ambientPauseAfterTouch);
}

function updateAmbient(index, shouldPeek) {
  const photo = visiblePhotos[index];

  if (!photo) {
    return;
  }

  photoCards.forEach((card) => card.classList.remove("is-featured"));
  photoCards[index]?.classList.add("is-featured");

  ambientImage.classList.remove("is-flowing");
  ambientImage.src = getThumbSrc(photo);
  ambientImage.alt = photo.title;
  ambientTitle.textContent = photo.title;
  ambientMeta.textContent = `${photo.date} / ${photo.prefecture} ${photo.region}`;

  requestAnimationFrame(() => {
    ambientImage.classList.add("is-flowing");
  });

  setActiveMarkers(ambientMarkers, index);
  moveMap(ambientMap, photo, 11, 1);

  if (shouldPeek && photoCards[index] && !isCompactScreen()) {
    photoCards[index].scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest"
    });
  }
}

function openViewer(index) {
  viewerIndex = index;
  document.body.classList.add("viewer-active");
  viewer.setAttribute("aria-hidden", "false");
  viewer.inert = false;
  stopAmbientFlow();
  updateViewer(viewerIndex);
  startViewerFlow();

  if (viewerMap) {
    setTimeout(() => viewerMap.invalidateSize(), 160);
  }
}

function closeViewer() {
  document.body.classList.remove("viewer-active");
  viewer.setAttribute("aria-hidden", "true");
  viewer.inert = true;
  stopViewerFlow();
  startAmbientFlow();
}

function stepViewerPhoto(direction, restart) {
  if (visiblePhotos.length === 0) {
    return;
  }

  viewerIndex = (viewerIndex + direction + visiblePhotos.length) % visiblePhotos.length;
  updateViewer(viewerIndex);

  if (restart) {
    startViewerFlow();
  }
}

function startViewerFlow() {
  stopViewerFlow();

  if (visiblePhotos.length > 1) {
    viewerTimer = setInterval(() => stepViewerPhoto(1, false), viewerInterval);
  }
}

function stopViewerFlow() {
  if (viewerTimer) {
    clearInterval(viewerTimer);
    viewerTimer = null;
  }
}

function updateViewer(index) {
  const photo = visiblePhotos[index];

  if (!photo) {
    return;
  }

  detailImage.classList.remove("is-flowing");
  detailImage.src = photo.src;
  detailImage.alt = photo.title;
  detailTitle.textContent = photo.title;
  detailMeta.textContent = `${photo.date} / ${photo.prefecture} ${photo.region} / ${photo.genre}`;
  detailDescription.textContent = photo.description;

  requestAnimationFrame(() => {
    detailImage.classList.add("is-flowing");
  });

  setActiveMarkers(viewerMarkers, index);
  moveMap(viewerMap, photo, 12, 1.1);
}

function updateRoutes(routePhotos) {
  ambientRouteLine = updateRouteLine(ambientMap, ambientRouteLine, routePhotos);
  viewerRouteLine = updateRouteLine(viewerMap, viewerRouteLine, routePhotos);
  ambientMarkers = updateMapMarkers(ambientMap, ambientMarkers, routePhotos, ambientIndex, (index) => {
    pauseAmbientFlow();
    ambientIndex = index;
    updateAmbient(index, false);
    openViewer(index);
  });
  viewerMarkers = updateMapMarkers(viewerMap, viewerMarkers, routePhotos, viewerIndex, (index) => {
    stopViewerFlow();
    viewerIndex = index;
    updateViewer(index);
  });
}

function updateRouteLine(targetMap, currentLine, routePhotos) {
  if (!targetMap) {
    return currentLine;
  }

  if (currentLine) {
    targetMap.removeLayer(currentLine);
  }

  const points = routePhotos.filter(hasCoordinates).map((photo) => [photo.lat, photo.lng]);
  if (points.length < 2) {
    return null;
  }

  return L.polyline(points, {
    color: "#1d5f59",
    weight: 1.5,
    opacity: 0.45,
    dashArray: "4 7"
  }).addTo(targetMap);
}

function updateMapMarkers(targetMap, currentMarkers, routePhotos, activeIndex, onSelect) {
  if (!targetMap) {
    return currentMarkers;
  }

  currentMarkers.forEach((marker) => targetMap.removeLayer(marker));

  return routePhotos.map((photo, index) => {
    return createPhotoMarker(photo, index, index === activeIndex, onSelect).addTo(targetMap);
  });
}

function setActiveMarkers(markers, activeIndex) {
  markers.forEach((marker, index) => {
    marker.setIcon(L.divIcon({
      className: "",
      html: `<div class="map-dot${index === activeIndex ? " is-active" : ""}" style="--dot-index:${index}"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    }));
  });
}

function moveMap(targetMap, photo, zoom, duration) {
  if (!targetMap || !hasCoordinates(photo)) {
    return;
  }

  targetMap.flyTo([photo.lat, photo.lng], zoom, { duration });
  setTimeout(() => targetMap.invalidateSize(), 160);
}

function hasCoordinates(photo) {
  return Number.isFinite(photo.lat) && Number.isFinite(photo.lng);
}

function getThumbSrc(photo) {
  return photo.thumb || photo.src.replace("assets/photos/", "assets/photos/thumbs/");
}

function isCompactScreen() {
  return window.matchMedia("(max-width: 760px)").matches;
}

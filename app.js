// ---------- LOCALSTORAGE ----------
const APP_VERSION = "25"; // lub nowsza, jaką masz

// --------- CYKLE (nowa logika 3→2→1 i odwrotnie) ---------
const CYKL_321 = [
  "N",
  "N",
  "N",
  "N",
  "W",
  "W",
  "II",
  "II",
  "II",
  "II",
  "W",
  "I",
  "I",
  "I",
  "I",
  "W",
];

const CYKL_123 = [
  "I",
  "I",
  "I",
  "I",
  "W",
  "II",
  "II",
  "II",
  "II",
  "W",
  "N",
  "N",
  "N",
  "N",
  "W",
  "W",
];

const OPIS_ZMIAN = {
  I: "I Zm.",
  II: "II Zm",
  N: "III Zm",
  W: "Wolne",
  L4: "L4",
  UW: "Uw",
  INNE: "Inne",
};
const STORAGE_KEY = "grafik_4brygadowy_offline_v2";
const APP_VERSION = "2.0"; // <--- ZWIĘKSZAJ przy każdej zmianie logiki

const STORAGE_KEY = "grafik_4brygadowy_offline_v2";
// Hasło do odblokowania widoku punktów w modalu
const SECRET_PASSWORD = "pkt321"; // <-- ZMIEŃ NA SWOJE
const today = new Date();
let visibleYear = today.getFullYear();
let visibleMonth = today.getMonth();
let touchStartX = null;
let touchStartY = null;
let touchEndX = null;
let touchEndY = null;

let state = {
  dniWejsciowe: [],
  startCyklu: null,
  overrides: {},
  direction: "321",
  pointsUnlocked: false, // <--- DODANE
version: APP_VERSION,
};

let calendarGenerated = false;

function getCurrentCycle() {
  return state.direction === "123" ? CYKL_123 : CYKL_321;
}
function setupCalendarSwipe() {
  const calendarWrapper = document.querySelector(".calendar-wrapper");
  if (!calendarWrapper) return;

  const SWIPE_THRESHOLD = 50; // minimalny ruch poziomy w px
  const MAX_VERTICAL_OFFSET = 40; // max. pionowy ruch, żeby nie łapać scrolla

  calendarWrapper.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchEndX = touch.clientX;
      touchEndY = touch.clientY;
    },
    { passive: true }
  );

  calendarWrapper.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches[0];
      touchEndX = touch.clientX;
      touchEndY = touch.clientY;
    },
    { passive: true }
  );

  calendarWrapper.addEventListener(
    "touchend",
    () => {
      if (touchStartX === null || touchStartY === null) return;

      const dx = (touchEndX ?? touchStartX) - touchStartX;
      const dy = (touchEndY ?? touchStartY) - touchStartY;

      // reset
      touchStartX = touchStartY = touchEndX = touchEndY = null;

      // bardziej w pionie niż w poziomie -> traktujemy jako scroll
      if (Math.abs(dy) > MAX_VERTICAL_OFFSET) return;

      // za mały gest
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;

      if (dx < 0) {
        // przesunięcie w lewo -> następny miesiąc
        const btnNext = document.getElementById("btnNextMonth");
        if (btnNext) btnNext.click();
      } else {
        // przesunięcie w prawo -> poprzedni miesiąc
        const btnPrev = document.getElementById("btnPrevMonth");
        if (btnPrev) btnPrev.click();
      }
    },
    { passive: true }
  );
}

function formatDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseISO(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function diffDays(d1, d0) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc0 = Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate());

  // round zamiast floor – żeby 23h lub 25h nadal dało 1 dzień
  return Math.round((utc1 - utc0) / MS_PER_DAY);
}



function pobierzZmianeDlaDaty(data, startDate) {
  const cycle = getCurrentCycle();
  const diff = diffDays(data, startDate);
  const idx = ((diff % cycle.length) + cycle.length) % cycle.length;
  const kod = cycle[idx];
  return {
    kod,
    nazwa: OPIS_ZMIAN[kod] || "",
  };
}



function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    // Funkcja pomocnicza – domyślne 4 dni od dziś
    function buildDefaultDni() {
      const todayISO = formatDateISO(today);
      const d1 = formatDateISO(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
      );
      const d2 = formatDateISO(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2)
      );
      const d3 = formatDateISO(
        new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3)
      );
      return [
        { data: todayISO, typ: "" },
        { data: d1, typ: "" },
        { data: d2, typ: "" },
        { data: d3, typ: "" },
      ];
    }

    // 1) Brak danych w localStorage – pierwsze odpalenie
    if (!raw) {
      state = {
        dniWejsciowe: buildDefaultDni(),
        startCyklu: null,
        overrides: {},
        direction: "321",
        pointsUnlocked: false,
        version: APP_VERSION,
      };
      return;
    }

    const parsed = JSON.parse(raw);

    // 2) ZMIANA WERSJI – czyścimy grafik, zostawiamy notatki/punkty
    if (parsed.version !== APP_VERSION) {
      state = {
        dniWejsciowe: buildDefaultDni(),       // <-- TU WAŻNE: nie [], tylko domyślne dni
        startCyklu: null,                      // brak wyliczonego startu cyklu
        overrides: parsed.overrides || {},     // zostają notatki/punkty
        direction: "321",                      // możesz tu wziąć parsed.direction, jeśli chcesz
        pointsUnlocked: parsed.pointsUnlocked || false,
        version: APP_VERSION,
      };

      saveState();
      return;
    }

    // 3) Ta sama wersja – normalne wczytanie
    state = Object.assign(
      {
        dniWejsciowe: buildDefaultDni(),
        startCyklu: null,
        overrides: {},
        direction: "321",
        pointsUnlocked: false,
        version: APP_VERSION,
      },
      parsed
    );
  } catch (e) {
    console.error("Błąd odczytu z localStorage", e);
  }
}


function saveState() {
  try {
    const toSave = Object.assign({}, state, {
      version: APP_VERSION,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.error("Błąd zapisu do localStorage", e);
  }
}




// ---------- SZUKANIE STARTU CYKLU ----------
function znajdzStartCykluZWejsciowych(entries) {
  const cycle = getCurrentCycle();
  const filled = entries
    .filter((e) => e.data && e.typ)
    .map((e) => ({
      data: e.data,
      typ: e.typ,
      dateObj: parseISO(e.data),
    }))
    .filter((e) => e.dateObj);

  if (!filled.length) return null;

  filled.sort((a, b) => a.dateObj - b.dateObj);

  const anchor = filled[0];
  const L = cycle.length;

  for (let offset = 0; offset < L; offset++) {
    const startCandidate = new Date(anchor.dateObj);
    startCandidate.setDate(startCandidate.getDate() - offset);

    let pasuje = true;
    for (const e of filled) {
      const diff = diffDays(e.dateObj, startCandidate);
      const idx = ((diff % L) + L) % L;
      if (cycle[idx] !== e.typ) {
        pasuje = false;
        break;
      }
    }

    if (pasuje) {
      return startCandidate;
    }
  }
  return null;
}
function buildDniWejscioweDebug(entries) {
  if (!entries || !entries.length) return "Brak zapisanych dni.";

  return entries
    .map((e, idx) => {
      const nr = idx + 1;
      const data = e.data && e.data !== "" ? e.data : "brak daty";
      const typ = e.typ && e.typ !== "" ? e.typ : "brak typu";
      return `#${nr}: data = ${data}, typ = ${typ}`;
    })
    .join("\n");
}

// ---------- KALENDARZ ----------
function renderMonthLabel() {
  const label = document.getElementById("monthLabel");
  const d = new Date(visibleYear, visibleMonth, 1);
  label.textContent = d.toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });
}

function buildWeekRow(weekData) {
  const tr = document.createElement("tr");
  weekData.forEach((cell) => {
    const td = document.createElement("td");
    if (!cell) {
      td.className = "pusta";
    } else {
      td.className = `komorka ${cell.zmianaClass}`;
      const div = document.createElement("div");
      div.className = "cell-content";

      const dEl = document.createElement("div");
      dEl.className = "data";
      dEl.textContent = cell.dateObj.getDate();
      div.appendChild(dEl);

      if (cell.typ) {
        const kodEl = document.createElement("div");
        kodEl.className = "kod";

        div.appendChild(kodEl);
      }

      if (cell.nazwa) {
        const nazwaEl = document.createElement("div");
        nazwaEl.className = "nazwa";
        nazwaEl.textContent = cell.nazwa;
        div.appendChild(nazwaEl);
      }

      if (cell.notka) {
        const notkaEl = document.createElement("div");
        notkaEl.className = "notka";
        notkaEl.textContent = cell.notka;
        div.appendChild(notkaEl);
      }

      // NOWA CZĘŚĆ – wyświetlanie punktów
      if (cell.pktAparat != null || cell.pktZadanie != null) {
        const parts = [];
        if (cell.pktAparat != null) {
          parts.push(`ap: ${cell.pktAparat}`);
        }
        if (cell.pktZadanie != null) {
          parts.push(`zad: ${cell.pktZadanie}`);
        }

        const punktyEl = document.createElement("div");
        punktyEl.className = "punkty";
        punktyEl.textContent = parts.join(", ");
        div.appendChild(punktyEl);
      }

      td.appendChild(div);

      td.addEventListener("click", () => {
        openDayModal(cell.iso, cell);
      });
    }
    tr.appendChild(td);
  });
  return tr;
}

function renderCalendar() {
  const calendarBody = document.getElementById("calendarBody");
  calendarBody.innerHTML = "";

  if (!calendarGenerated || !state.startCyklu) {
    // wyczyść też podsumowanie
    updateMonthSummary();
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    updateMonthSummary();
    return;
  }

  const first = new Date(visibleYear, visibleMonth, 1);
  const last = new Date(visibleYear, visibleMonth + 1, 0);
  const daysInMonth = last.getDate();

  const offset = (first.getDay() + 6) % 7;

  let week = [];
  for (let i = 0; i < offset; i++) {
    week.push(null);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(visibleYear, visibleMonth, day);
    const cellData = getDayDataForDate(dateObj, startDate);

    week.push(cellData);

    if (week.length === 7) {
      const tr = buildWeekRow(week);
      calendarBody.appendChild(tr);
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    const tr = buildWeekRow(week);
    calendarBody.appendChild(tr);
  }

  renderMonthLabel();
  updateMonthSummary();
}
function updateMonthSummary() {
  const summaryBox = document.getElementById("monthSummaryContent");
  if (!summaryBox) return;

  if (!calendarGenerated || !state.startCyklu) {
    summaryBox.textContent = "Brak danych – wygeneruj grafik.";
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    summaryBox.textContent = "Brak danych – wygeneruj grafik.";
    return;
  }

  const first = new Date(visibleYear, visibleMonth, 1);
  const last = new Date(visibleYear, visibleMonth + 1, 0);
  const daysInMonth = last.getDate();

  const counts = {
    I: 0,
    II: 0,
    N: 0,
    W: 0,
    L4: 0,
    UW: 0,
    INNE: 0,
  };

  const points = {
    aparat: 0,
    zadanie: 0,
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(visibleYear, visibleMonth, day);
    const cell = getDayDataForDate(dateObj, startDate);

    const typ = cell.typ;

    if (typ) {
      let key = typ;
      if (!Object.prototype.hasOwnProperty.call(counts, key)) {
        key = "INNE";
      }
      counts[key]++;
    }

    if (cell.pktAparat != null) {
      points.aparat += cell.pktAparat;
    }
    if (cell.pktZadanie != null) {
      points.zadanie += cell.pktZadanie;
    }
  }

  const totalPoints = points.aparat + points.zadanie;
  const labelDate = first.toLocaleDateString("pl-PL", {
    month: "long",
    year: "numeric",
  });

  const showPoints = !!state.pointsUnlocked; // <-- tylko gdy hasło było poprawne

  let html = `
    <div>Okres: <strong>${labelDate}</strong></div>
    <div class="month-summary-grid">
      <div class="month-summary-item">
        <span class="month-summary-label">I zmiana</span>
        <span class="month-summary-value">${counts.I}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">II zmiana</span>
        <span class="month-summary-value">${counts.II}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">III zmiana (N)</span>
        <span class="month-summary-value">${counts.N}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">Wolne (W)</span>
        <span class="month-summary-value">${counts.W}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">L4</span>
        <span class="month-summary-value">${counts.L4}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">Urlop (UW)</span>
        <span class="month-summary-value">${counts.UW}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">Inne</span>
        <span class="month-summary-value">${counts.INNE}</span>
      </div>
  `;

  if (showPoints) {
    html += `
      <div class="month-summary-item">
        <span class="month-summary-label">Pkt aparat</span>
        <span class="month-summary-value">${points.aparat}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">Pkt zadania</span>
        <span class="month-summary-value">${points.zadanie}</span>
      </div>
      <div class="month-summary-item">
        <span class="month-summary-label">Pkt razem</span>
        <span class="month-summary-value">${totalPoints}</span>
      </div>
    `;
  }

  html += `</div>`;
  summaryBox.innerHTML = html;
}

function showYearSummary() {
  if (!calendarGenerated || !state.startCyklu) {
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    return;
  }

  const year = visibleYear;

  const counts = {
    I: 0,
    II: 0,
    N: 0,
    W: 0,
    L4: 0,
    UW: 0,
    INNE: 0,
  };

  const points = {
    aparat: 0,
    zadanie: 0,
  };

  for (let month = 0; month < 12; month++) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const cell = getDayDataForDate(dateObj, startDate);

      const typ = cell.typ;
      if (typ) {
        let key = typ;
        if (!counts.hasOwnProperty(key)) key = "INNE";
        counts[key]++;
      }

      if (cell.pktAparat != null) points.aparat += cell.pktAparat;
      if (cell.pktZadanie != null) points.zadanie += cell.pktZadanie;
    }
  }

  const showPoints = !!state.pointsUnlocked;
  const totalPoints = points.aparat + points.zadanie;

  // generowanie HTML
  let html = `
    <div>Rok: <strong>${year}</strong></div>
    <div class="year-summary-grid">
      <div class="year-summary-item">
        <span class="year-summary-label">I zmiana</span>
        <span class="year-summary-value">${counts.I}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">II zmiana</span>
        <span class="year-summary-value">${counts.II}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">III zmiana (N)</span>
        <span class="year-summary-value">${counts.N}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">Wolne (W)</span>
        <span class="year-summary-value">${counts.W}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">L4</span>
        <span class="year-summary-value">${counts.L4}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">Urlop (UW)</span>
        <span class="year-summary-value">${counts.UW}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">Inne</span>
        <span class="year-summary-value">${counts.INNE}</span>
      </div>
  `;

  if (showPoints) {
    html += `
      <div class="year-summary-item">
        <span class="year-summary-label">Pkt aparat</span>
        <span class="year-summary-value">${points.aparat}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">Pkt zadania</span>
        <span class="year-summary-value">${points.zadanie}</span>
      </div>
      <div class="year-summary-item">
        <span class="year-summary-label">Pkt razem</span>
        <span class="year-summary-value">${totalPoints}</span>
      </div>
    `;
  }

  html += `</div>`;

  // wstawienie do HTML
  const box = document.getElementById("yearSummary");
  const content = document.getElementById("yearSummaryContent");

  content.innerHTML = html;
  box.style.display = "block"; // <-- pokazujemy sekcję
}

let modalDateISO = null;

function openDayModal(iso, cell) {
  modalDateISO = iso;

  const modalBackdrop = document.getElementById("dayModalBackdrop");
  const modalTitle = document.getElementById("modalTitle");
  const modalTyp = document.getElementById("modalTyp");
  const modalNotka = document.getElementById("modalNotka");
  const modalPassword = document.getElementById("modalPassword");
  const pointsSection = document.getElementById("pointsSection");
  const pktAInput = document.getElementById("modalPktAparat");
  const pktZInput = document.getElementById("modalPktZadanie");

  const dateObj = parseISO(iso);
  const dateLabel = dateObj
    ? dateObj.toLocaleDateString("pl-PL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : iso;

  modalTitle.textContent = `Dzień: ${dateLabel}`;
  const override = state.overrides[iso] || {};

  // Typ dnia
  if (override.typ) {
    modalTyp.value = override.typ;
  } else {
    modalTyp.value = "";
  }

  // Notka
  modalNotka.value = override.notka ? override.notka : "";

  // ---------------- PUNKTY + HASŁO ----------------

  // jeśli hasło już raz wpisane – zawsze pokazujemy sekcję z punktami,
  // automatycznie wczytujemy zapisane wartości i ukrywamy pole hasła
  if (state.pointsUnlocked) {
    if (pointsSection) pointsSection.style.display = "flex";

    if (pktAInput) {
      pktAInput.value =
        override.pktAparat != null ? String(override.pktAparat) : "";
    }
    if (pktZInput) {
      pktZInput.value =
        override.pktZadanie != null ? String(override.pktZadanie) : "";
    }

    if (modalPassword) {
      modalPassword.value = "";
      modalPassword.disabled = true;
      modalPassword.placeholder = "Hasło już podane";
      modalPassword.style.opacity = "0.5";
    }
  } else {
    // tryb „przed hasłem”: sekcja z punktami ukryta, hasło puste
    if (modalPassword) {
      modalPassword.value = "";
      modalPassword.disabled = false;
      modalPassword.placeholder = "Wpisz kod";
      modalPassword.style.opacity = "1";
    }
    if (pointsSection) pointsSection.style.display = "none";
    if (pktAInput) pktAInput.value = "";
    if (pktZInput) pktZInput.value = "";
  }

  modalBackdrop.classList.add("show");
}

function unlockPointsIfPasswordCorrect() {
  const modalPassword = document.getElementById("modalPassword");
  const pointsSection = document.getElementById("pointsSection");
  const pktAInput = document.getElementById("modalPktAparat");
  const pktZInput = document.getElementById("modalPktZadanie");

  if (!modalPassword || !pointsSection) return;
  if (!modalDateISO) return;

  // jeśli już wcześniej odblokowane – nic nie rób
  if (state.pointsUnlocked) {
    pointsSection.style.display = "flex";
    return;
  }

  if (modalPassword.value === SECRET_PASSWORD) {
    // odblokowujemy NA STAŁE — zapamiętuje się w localStorage
    state.pointsUnlocked = true;
    saveState();

    pointsSection.style.display = "flex";

    const override = state.overrides[modalDateISO] || {};
    pktAInput.value = override.pktAparat ?? "";
    pktZInput.value = override.pktZadanie ?? "";

    modalPassword.value = "";
    modalPassword.disabled = true;
    modalPassword.placeholder = "Hasło już podane";
    modalPassword.style.opacity = "0.5";
  } else {
    pointsSection.style.display = "none";
    pktAInput.value = "";
    pktZInput.value = "";
  }
}

function closeDayModal() {
  const modalBackdrop = document.getElementById("dayModalBackdrop");
  modalBackdrop.classList.remove("show");
  modalDateISO = null;
}

function saveDayModal() {
  if (!modalDateISO) return;
  const modalTyp = document.getElementById("modalTyp");
  const modalNotka = document.getElementById("modalNotka");

  const typ = modalTyp.value;
  const notka = modalNotka.value.trim();

  const baseDate = parseISO(modalDateISO);
  if (!baseDate || !state.startCyklu) return;

  const baseZmiana = pobierzZmianeDlaDaty(baseDate, parseISO(state.startCyklu));
  const defaultTyp = baseZmiana.kod;

  const pointsSection = document.getElementById("pointsSection");

  // Bierzemy poprzednie wartości z override (jeśli istniały)
  const prevOverride = state.overrides[modalDateISO] || {};
  let pktAparat = prevOverride.pktAparat ?? null;
  let pktZadanie = prevOverride.pktZadanie ?? null;

  // Aktualizujemy punkty TYLKO wtedy, gdy sekcja jest widoczna
  // (czyli hasło podane / odblokowane)
  if (pointsSection && pointsSection.style.display !== "none") {
    const pktAInput = document.getElementById("modalPktAparat");
    const pktZInput = document.getElementById("modalPktZadanie");

    if (pktAInput) {
      if (pktAInput.value !== "") {
        pktAparat = Number(pktAInput.value);
      } else {
        pktAparat = null; // puste = kasujemy
      }
    }
    if (pktZInput) {
      if (pktZInput.value !== "") {
        pktZadanie = Number(pktZInput.value);
      } else {
        pktZadanie = null; // puste = kasujemy
      }
    }
  }
  // jeśli sekcja ukryta -> pktAparat / pktZadanie zostały takie jak były

  const brakTypuLubDomyslny = !typ || typ === "" || typ === defaultTyp;
  const brakNotki = !notka;
  const brakPunktow = pktAparat == null && pktZadanie == null;

  if (brakTypuLubDomyslny && brakNotki && brakPunktow) {
    // nic specjalnego – kasujemy override
    delete state.overrides[modalDateISO];
  } else {
    // zapisujemy wszystko
    state.overrides[modalDateISO] = {
      typ: typ || "",
      notka,
      pktAparat,
      pktZadanie,
    };
  }

  saveState();
  renderCalendar();
  closeDayModal();
}

function clearDayModal() {
  if (!modalDateISO) return;
  delete state.overrides[modalDateISO];
  saveState();
  renderCalendar();
  closeDayModal();
}

// ---------- GENEROWANIE / PRZELICZANIE ----------
function hideInputDaysAfterFirstGeneration() {
  const dniWrapper = document.getElementById("dniWejscioweWrapper");
  if (dniWrapper) dniWrapper.style.display = "none";
  const btnGeneruj = document.getElementById("btnGeneruj");
  if (btnGeneruj) btnGeneruj.style.display = "none";
  const btnRecalc = document.getElementById("btnRecalc");
  if (btnRecalc) btnRecalc.style.display = "inline-block";
}

function firstGeneration() {
  const directionSelect = document.getElementById("direction");
  state.direction = directionSelect.value || "321";

  const entries = [];
  for (let i = 0; i < 4; i++) {
    const dataInput = document.getElementById(`data-${i}`);
    const typSelect = document.getElementById(`typ-${i}`);
    const data = dataInput.value;
    const typ = typSelect.value;
    entries.push({ data, typ });
  }

  state.dniWejsciowe = entries;

  const start = znajdzStartCykluZWejsciowych(entries);
  if (!start) {
    const debug = buildDniWejscioweDebug(entries);
    alert(
      "Podane dni nie pasują do wzoru cyklu (w wybranym kierunku).\n\n" +
        "Aktualnie wprowadzone dni:\n" +
        debug
    );
    return;
  }

  state.startCyklu = formatDateISO(start);
  saveState();

  calendarGenerated = true;
  document.getElementById("calendarSection").style.display = "block";
  document.getElementById("emptyInfo").style.display = "none";

  visibleYear = today.getFullYear();
  visibleMonth = today.getMonth();

  hideInputDaysAfterFirstGeneration();
  renderCalendar();
}
// Pokazuje sekcję "4 znane dni" i wypełnia inputy z state.dniWejsciowe
function showDniWejscioweInputsFromState() {
  const dniWrapper = document.getElementById("dniWejscioweWrapper");
  if (dniWrapper) {
    dniWrapper.style.display = "block";
    // opcjonalnie lekko podkreślamy, że tu jest problem / do poprawy
    dniWrapper.style.outline = "2px solid #f97316"; // pomarańczowa ramka
  }

  for (let i = 0; i < 4; i++) {
    const row = state.dniWejsciowe[i] || {};
    const dataInput = document.getElementById(`data-${i}`);
    const typSelect = document.getElementById(`typ-${i}`);
    if (dataInput) dataInput.value = row.data || "";
    if (typSelect) typSelect.value = row.typ || "";
  }
}
function getDayDataForDate(dateObj, startDate) {
  const iso = formatDateISO(dateObj);
  const baseZmiana = pobierzZmianeDlaDaty(dateObj, startDate);

  let typ = baseZmiana.kod;
  let nazwa = baseZmiana.nazwa;
  let notka = "";
  let pktAparat = null;
  let pktZadanie = null;

  const ov = state.overrides[iso];
  if (ov) {
    if (ov.typ) {
      typ = ov.typ;
      nazwa = OPIS_ZMIAN[ov.typ] || baseZmiana.nazwa;
    }
    if (ov.notka) {
      notka = ov.notka;
    }
    if (ov.pktAparat != null) {
      pktAparat = ov.pktAparat;
    }
    if (ov.pktZadanie != null) {
      pktZadanie = ov.pktZadanie;
    }
  }

  if (!OPIS_ZMIAN[typ] && typ) {
    nazwa = "Inne";
  }

  const zmianaClass = typ ? `zmiana-${typ}` : "";

  return {
    dateObj,
    iso,
    typ,
    nazwa,
    notka,
    pktAparat,
    pktZadanie,
    zmianaClass,
  };
}

// Po przeliczeniu grafiku:
// - zachowujemy wszystkie ręczne zmiany typu różne od domyślnego
// - zachowujemy notatki i punkty
// - usuwamy tylko wpisy, które są identyczne z domyślnym typem i nie mają notek/punktów
function adjustOverridesAfterRecalc() {
  if (!state.startCyklu) return;

  const startDate = parseISO(state.startCyklu);
  if (!startDate) return;

  const newOverrides = {};

  Object.entries(state.overrides).forEach(([iso, val]) => {
    if (!val) return;

    const dateObj = parseISO(iso);
    if (!dateObj) return;

    const base = pobierzZmianeDlaDaty(dateObj, startDate);
    const baseTyp = base.kod;

    const typOverride = val.typ || "";
    const notka = val.notka || "";
    const pktAparat = val.pktAparat ?? null;
    const pktZadanie = val.pktZadanie ?? null;

    const maNotke = notka !== "";
    const maPunkty = pktAparat != null || pktZadanie != null;

    // 1) Brak typu override, ale są notki/punkty -> zostawiamy
    if (!typOverride && (maNotke || maPunkty)) {
      newOverrides[iso] = {
        typ: "",
        notka,
        pktAparat,
        pktZadanie,
      };
      return;
    }

    // 2) Typ override taki sam jak domyślny, brak notek i punktów -> nie ma sensu trzymać
    if (typOverride === baseTyp && !maNotke && !maPunkty) {
      return;
    }

    // 3) Typ różni się od domyślnego LUB są notki/punkty -> świadoma zmiana, zostawiamy
    newOverrides[iso] = {
      typ: typOverride,
      notka,
      pktAparat,
      pktZadanie,
    };
  });

  state.overrides = newOverrides;
}

function recalcGeneration() {
  const directionSelect = document.getElementById("direction");
  state.direction = directionSelect.value || "321";

  // 1) Pobieramy aktualne wartości z inputów (użytkownik mógł je zmienić)
  const entries = [];
  for (let i = 0; i < 4; i++) {
    const dataInput = document.getElementById(`data-${i}`);
    const typSelect = document.getElementById(`typ-${i}`);
    const data = dataInput ? dataInput.value : "";
    const typ = typSelect ? typSelect.value : "";
    entries.push({ data, typ });
  }

  // Zapisujemy do state
  state.dniWejsciowe = entries;

  // 2) Szukamy początku cyklu dla tych danych
  const start = znajdzStartCykluZWejsciowych(entries);
  if (!start) {
    // ALERT dla użytkownika
    alert(
      "Podane 4 dni nie pasują do wybranego kierunku cyklu.\n\n" +
        "Popraw daty/typy i spróbuj ponownie."
    );

    // Pokaż i wypełnij inputy zapisanymi danymi
    showDniWejscioweInputsFromState();
    return;
  }

  // 3) Ustawiamy nowy start cyklu
  state.startCyklu = formatDateISO(start);

  // Jeśli masz funkcję korygującą override'y po przeliczeniu, możesz ją tutaj wywołać:
  // adjustOverridesAfterRecalc();

  saveState();

  calendarGenerated = true;
  document.getElementById("calendarSection").style.display = "block";
  document.getElementById("emptyInfo").style.display = "none";

  renderCalendar();
}

function resetGrafik() {
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}
function showUpdateBanner() {
  const banner = document.getElementById("updateBanner");
  const btn = document.getElementById("updateReloadBtn");
  if (!banner || !btn) return;

  banner.style.display = "flex";

  btn.onclick = () => {
    // Odśwież stronę, żeby wczytać nową wersję z nowym SW i cache
    window.location.reload();
  };
}

// ---------- INIT + PWA ----------
document.addEventListener("DOMContentLoaded", () => {
  loadState();

  const directionSelect = document.getElementById("direction");
  const dniWrapper = document.getElementById("dniWejscioweWrapper");
  const btnGeneruj = document.getElementById("btnGeneruj");
  const btnRecalc = document.getElementById("btnRecalc");
  const btnReset = document.getElementById("btnReset");
  const calendarSection = document.getElementById("calendarSection");
  const emptyInfo = document.getElementById("emptyInfo");

  directionSelect.value = state.direction || "321";
  const btnYearSummary = document.getElementById("btnYearSummary");
  if (btnYearSummary) {
    btnYearSummary.addEventListener("click", showYearSummary);
  }

  for (let i = 0; i < 4; i++) {
    const row = state.dniWejsciowe[i];
    const dataInput = document.getElementById(`data-${i}`);
    const typSelect = document.getElementById(`typ-${i}`);
    if (dataInput && row && row.data) {
      dataInput.value = row.data;
    }
    if (typSelect && row && row.typ) {
      typSelect.value = row.typ;
    }
  }

  if (state.startCyklu) {
    calendarGenerated = true;
    calendarSection.style.display = "block";
    emptyInfo.style.display = "none";

    hideInputDaysAfterFirstGeneration();
    renderCalendar();
  } else {
    btnRecalc.style.display = "none";
    dniWrapper.style.display = "block";
    btnGeneruj.style.display = "inline-block";
  }

  btnGeneruj.addEventListener("click", firstGeneration);
  btnRecalc.addEventListener("click", recalcGeneration);
  btnReset.addEventListener("click", resetGrafik);
  const modalPasswordInput = document.getElementById("modalPassword");
  if (modalPasswordInput) {
    modalPasswordInput.addEventListener("input", unlockPointsIfPasswordCorrect);
  }

  document.getElementById("btnPrevMonth").addEventListener("click", () => {
    if (visibleMonth === 0) {
      visibleMonth = 11;
      visibleYear -= 1;
    } else {
      visibleMonth -= 1;
    }
    renderCalendar();
  });

  document.getElementById("btnNextMonth").addEventListener("click", () => {
    if (visibleMonth === 11) {
      visibleMonth = 0;
      visibleYear += 1;
    } else {
      visibleMonth += 1;
    }
    renderCalendar();
  });

  document
    .getElementById("modalCloseBtn")
    .addEventListener("click", closeDayModal);
  document.getElementById("dayModalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "dayModalBackdrop") {
      closeDayModal();
    }
  });
  document
    .getElementById("modalSaveBtn")
    .addEventListener("click", saveDayModal);
  document
    .getElementById("modalClearBtn")
    .addEventListener("click", clearDayModal);

  // Rejestracja SW – "fast offline-first"
  if (
    "serviceWorker" in navigator &&
    (window.location.protocol === "https:" ||
      window.location.hostname === "localhost")
  ) {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => {
        console.log("SW registered:", reg.scope);
      })
      .catch((err) => {
        console.log("SW register error:", err);
      });

    // nasłuchujemy komunikatów z SW (np. NEW_VERSION_AVAILABLE)
    navigator.serviceWorker.addEventListener("message", (event) => {
      if (!event.data || !event.data.type) return;

      if (event.data.type === "NEW_VERSION_AVAILABLE") {
        showUpdateBanner();
      }
    });
  }
  // Swipe kalendarza palcem lewo/prawo
  setupCalendarSwipe();
});




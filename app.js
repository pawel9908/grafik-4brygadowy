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
  II: "II Zm.",
  N: "III Zm.",
  W: "Wolne",
  L4: "L4",
  UW: "UW",
  INNE: "Inne",
};

const STORAGE_KEY = "grafik_4brygadowy_offline_v2";
const SECRET_PASSWORD = "pkt321";

const today = new Date();
let visibleYear = today.getFullYear();
let visibleMonth = today.getMonth();

let touchStartX = null;
let touchStartY = null;
let touchEndX = null;
let touchEndY = null;

let modalDateISO = null;
let calendarGenerated = false;

let state = {
  dniWejsciowe: [],
  startCyklu: null,
  overrides: {},
  direction: "321",
  pointsUnlocked: false,
  salarySettings: {
    hourlyRate: "",
    baseSalary: "",
    hoursPerShift: 8,
    nightBonusPercent: 0,
  },
};

function getCurrentCycle() {
  return state.direction === "123" ? CYKL_123 : CYKL_321;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

function getDefaultInitialDays() {
  const todayISO = formatDateISO(today);
  const d1 = formatDateISO(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
  );
  const d2 = formatDateISO(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2),
  );
  const d3 = formatDateISO(
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3),
  );

  return [
    { data: todayISO, typ: "" },
    { data: d1, typ: "" },
    { data: d2, typ: "" },
    { data: d3, typ: "" },
  ];
}

// ---------- LOCAL STORAGE ----------
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      state = {
        dniWejsciowe: getDefaultInitialDays(),
        startCyklu: null,
        overrides: {},
        direction: "321",
        pointsUnlocked: false,
        salarySettings: {
          hourlyRate: "",
          baseSalary: "",
          hoursPerShift: 8,
          nightBonusPercent: 0,
        },
      };
      return;
    }

    const parsed = JSON.parse(raw);

    state = Object.assign(
      {
        dniWejsciowe: getDefaultInitialDays(),
        startCyklu: null,
        overrides: {},
        direction: "321",
        pointsUnlocked: false,
        salarySettings: {
          hourlyRate: "",
          baseSalary: "",
          hoursPerShift: 8,
          nightBonusPercent: 0,
        },
      },
      parsed,
    );

    if (!Array.isArray(state.dniWejsciowe) || state.dniWejsciowe.length !== 4) {
      state.dniWejsciowe = getDefaultInitialDays();
    }

    if (!state.overrides || typeof state.overrides !== "object") {
      state.overrides = {};
    }

    if (state.direction !== "123" && state.direction !== "321") {
      state.direction = "321";
    }
    if (!state.salarySettings || typeof state.salarySettings !== "object") {
      state.salarySettings = {
        hourlyRate: "",
        baseSalary: "",
        hoursPerShift: 8,
      };
    }
  } catch (e) {
    console.error("Błąd odczytu z localStorage", e);
    state = {
      dniWejsciowe: getDefaultInitialDays(),
      startCyklu: null,
      overrides: {},
      direction: "321",
      pointsUnlocked: false,
      salarySettings: {
        hourlyRate: "",
        baseSalary: "",
        hoursPerShift: 8,
        nightBonusPercent: 0,
      },
    };
  }
}
function updateSalarySectionVisibility() {
  const salarySection = document.getElementById("salarySection");
  if (!salarySection) return;

  salarySection.style.display = state.pointsUnlocked ? "block" : "none";
}
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error("Błąd zapisu do localStorage", e);
  }
}

// ---------- WALIDACJA ----------
function validateEntries(entries) {
  if (!Array.isArray(entries) || entries.length !== 4) {
    return "Musisz podać dokładnie 4 dni wejściowe.";
  }

  const incomplete = entries.some((e) => !e.data || !e.typ);
  if (incomplete) {
    return "Uzupełnij wszystkie 4 daty i typy zmian.";
  }

  const uniqueDates = new Set(entries.map((e) => e.data));
  if (uniqueDates.size !== entries.length) {
    return "Daty wejściowe nie mogą się powtarzać.";
  }

  return null;
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

// ---------- UI POMOCNICZE ----------
function showDniWejscioweInputsFromState() {
  const dniWrapper = document.getElementById("dniWejscioweWrapper");

  if (dniWrapper) {
    dniWrapper.style.display = "block";
    dniWrapper.style.outline = "2px solid #f97316";
  }

  for (let i = 0; i < 4; i++) {
    const row = state.dniWejsciowe[i] || {};
    const dataInput = document.getElementById(`data-${i}`);
    const typSelect = document.getElementById(`typ-${i}`);

    if (dataInput) dataInput.value = row.data || "";
    if (typSelect) typSelect.value = row.typ || "";
  }
}

function clearDniWejscioweOutline() {
  const dniWrapper = document.getElementById("dniWejscioweWrapper");
  if (dniWrapper) {
    dniWrapper.style.outline = "";
  }
}

function hideInputDaysAfterFirstGeneration() {
  const dniWrapper = document.getElementById("dniWejscioweWrapper");
  const btnGeneruj = document.getElementById("btnGeneruj");
  const btnRecalc = document.getElementById("btnRecalc");

  if (dniWrapper) dniWrapper.style.display = "none";
  if (btnGeneruj) btnGeneruj.style.display = "none";
  if (btnRecalc) btnRecalc.style.display = "inline-block";
}

function hideYearSummary() {
  const box = document.getElementById("yearSummary");
  const content = document.getElementById("yearSummaryContent");

  if (box) box.style.display = "none";
  if (content) content.innerHTML = "";
}

// ---------- DANE DNIA ----------
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

// ---------- KALENDARZ ----------
function renderMonthLabel() {
  const label = document.getElementById("monthLabel");
  if (!label) return;

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
        kodEl.textContent = cell.typ;
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

      if (
        state.pointsUnlocked &&
        (cell.pktAparat != null || cell.pktZadanie != null)
      ) {
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
        openDayModal(cell.iso);
      });
    }

    tr.appendChild(td);
  });

  return tr;
}
function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function formatMoney(value) {
  return `${roundMoney(value).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} zł`;
}

function isWorkingType(typ) {
  return typ === "I" || typ === "II" || typ === "N";
}

function getSalarySettings() {
  const hourlyRate = Number(state.salarySettings?.hourlyRate || 0);
  const baseSalary = Number(state.salarySettings?.baseSalary || 0);
  const hoursPerShift = Number(state.salarySettings?.hoursPerShift || 8);
  const nightBonusPercent = Number(
    state.salarySettings?.nightBonusPercent || 0,
  );

  return {
    hourlyRate: Number.isFinite(hourlyRate) && hourlyRate >= 0 ? hourlyRate : 0,
    baseSalary: Number.isFinite(baseSalary) && baseSalary >= 0 ? baseSalary : 0,
    hoursPerShift:
      Number.isFinite(hoursPerShift) && hoursPerShift > 0 ? hoursPerShift : 8,
    nightBonusPercent:
      Number.isFinite(nightBonusPercent) && nightBonusPercent >= 0
        ? nightBonusPercent
        : 0,
  };
}
function calculateMonthWorkStats(year, month, startDate) {
  const last = new Date(year, month + 1, 0);
  const daysInMonth = last.getDate();

  let workingDays = 0;
  let nightDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month, day);
    const cell = getDayDataForDate(dateObj, startDate);

    if (isWorkingType(cell.typ)) {
      workingDays++;
    }

    if (cell.typ === "N") {
      nightDays++;
    }
  }

  const { hourlyRate, baseSalary, hoursPerShift, nightBonusPercent } =
    getSalarySettings();

  const hours = workingDays * hoursPerShift;
  const nightHours = nightDays * hoursPerShift;

  // GODZINÓWKA
  const hourlyBaseAmount = hours * hourlyRate;
  const hourlyNightBonusAmount =
    nightHours * hourlyRate * (nightBonusPercent / 100);
  const hourlyAmount = hourlyBaseAmount + hourlyNightBonusAmount;

  // PODSTAWA
  // stawka godzinowa wyliczona z podstawy dla danego miesiąca
  const baseDerivedHourlyRate = hours > 0 ? baseSalary / hours : 0;
  const baseNightBonusAmount =
    nightHours * baseDerivedHourlyRate * (nightBonusPercent / 100);
  const baseTotalAmount = baseSalary + baseNightBonusAmount;

  const betterOption =
    hourlyAmount > baseTotalAmount
      ? "Stawka godzinowa"
      : hourlyAmount < baseTotalAmount
        ? "Podstawa"
        : "Remis";

  return {
    workingDays,
    nightDays,
    hours,
    nightHours,

    hourlyRate: roundMoney(hourlyRate),
    baseSalary: roundMoney(baseSalary),
    baseDerivedHourlyRate: roundMoney(baseDerivedHourlyRate),
    nightBonusPercent: roundMoney(nightBonusPercent),

    hourlyBaseAmount: roundMoney(hourlyBaseAmount),
    hourlyNightBonusAmount: roundMoney(hourlyNightBonusAmount),
    hourlyAmount: roundMoney(hourlyAmount),

    baseNightBonusAmount: roundMoney(baseNightBonusAmount),
    baseTotalAmount: roundMoney(baseTotalAmount),

    diff: roundMoney(Math.abs(hourlyAmount - baseTotalAmount)),
    betterOption,
  };
}

function updateSalaryInputsFromState() {
  const hourlyRateInput = document.getElementById("hourlyRate");
  const baseSalaryInput = document.getElementById("baseSalary");
  const hoursPerShiftInput = document.getElementById("hoursPerShift");
  const nightBonusPercentInput = document.getElementById("nightBonusPercent");

  if (hourlyRateInput) {
    hourlyRateInput.value = state.salarySettings?.hourlyRate ?? "";
  }

  if (baseSalaryInput) {
    baseSalaryInput.value = state.salarySettings?.baseSalary ?? "";
  }

  if (hoursPerShiftInput) {
    hoursPerShiftInput.value = state.salarySettings?.hoursPerShift ?? 8;
  }

  if (nightBonusPercentInput) {
    nightBonusPercentInput.value = state.salarySettings?.nightBonusPercent ?? 0;
  }
}

function saveSalarySettingsFromInputs() {
  const hourlyRateInput = document.getElementById("hourlyRate");
  const baseSalaryInput = document.getElementById("baseSalary");
  const hoursPerShiftInput = document.getElementById("hoursPerShift");
  const nightBonusPercentInput = document.getElementById("nightBonusPercent");

  state.salarySettings = {
    hourlyRate: hourlyRateInput ? hourlyRateInput.value : "",
    baseSalary: baseSalaryInput ? baseSalaryInput.value : "",
    hoursPerShift: hoursPerShiftInput ? hoursPerShiftInput.value : 8,
    nightBonusPercent: nightBonusPercentInput
      ? nightBonusPercentInput.value
      : 0,
  };

  saveState();
}
function updateSalaryYearReport() {
  const yearBox = document.getElementById("salaryYearReport");
  if (!yearBox) return;

  if (!state.pointsUnlocked) {
    yearBox.innerHTML = "";
    return;
  }

  if (!calendarGenerated || !state.startCyklu) {
    yearBox.innerHTML = "Raport roczny pojawi się po wygenerowaniu grafiku.";
    return;
  }

  const { hourlyRate, baseSalary, hoursPerShift } = getSalarySettings();

  if (!hourlyRate || !baseSalary || !hoursPerShift) {
    yearBox.innerHTML = "Uzupełnij dane wypłaty, aby zobaczyć raport roczny.";
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    yearBox.innerHTML = "Brak danych do obliczeń.";
    return;
  }

  let totalHours = 0;
  let totalNightHours = 0;

  let totalHourlyBaseAmount = 0;
  let totalHourlyNightBonusAmount = 0;
  let totalHourlyAmount = 0;

  let totalBaseSalary = 0;
  let totalBaseNightBonusAmount = 0;
  let totalBaseTotalAmount = 0;

  let hourlyBetterMonths = 0;
  let baseBetterMonths = 0;
  let drawMonths = 0;

  for (let month = 0; month < 12; month++) {
    const stats = calculateMonthWorkStats(visibleYear, month, startDate);

    totalHours += stats.hours;
    totalNightHours += stats.nightHours;

    totalHourlyBaseAmount += stats.hourlyBaseAmount;
    totalHourlyNightBonusAmount += stats.hourlyNightBonusAmount;
    totalHourlyAmount += stats.hourlyAmount;

    totalBaseSalary += stats.baseSalary;
    totalBaseNightBonusAmount += stats.baseNightBonusAmount;
    totalBaseTotalAmount += stats.baseTotalAmount;

    if (stats.betterOption === "Stawka godzinowa") {
      hourlyBetterMonths++;
    } else if (stats.betterOption === "Podstawa") {
      baseBetterMonths++;
    } else {
      drawMonths++;
    }
  }

  const betterYearOption =
    totalHourlyAmount > totalBaseTotalAmount
      ? "Stawka godzinowa"
      : totalHourlyAmount < totalBaseTotalAmount
        ? "Podstawa"
        : "Remis";

  yearBox.innerHTML = `
    <div><strong>Raport roczny: ${visibleYear}</strong></div>
    <div class="year-summary-grid">
      <div class="year-summary-item">
        <span class="year-summary-label">Godziny w roku</span>
        <span class="year-summary-value">${totalHours}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Godziny nocne w roku</span>
        <span class="year-summary-value">${totalNightHours}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Godzinówka: suma bazowa</span>
        <span class="year-summary-value">${formatMoney(totalHourlyBaseAmount)}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Godzinówka: suma dodatku nocnego</span>
        <span class="year-summary-value">${formatMoney(totalHourlyNightBonusAmount)}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Godzinówka: razem</span>
        <span class="year-summary-value">${formatMoney(totalHourlyAmount)}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Podstawa: suma podstaw</span>
        <span class="year-summary-value">${formatMoney(totalBaseSalary)}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Podstawa: suma dodatku nocnego</span>
        <span class="year-summary-value">${formatMoney(totalBaseNightBonusAmount)}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Podstawa: razem</span>
        <span class="year-summary-value">${formatMoney(totalBaseTotalAmount)}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Bardziej opłaca się w skali roku</span>
        <span class="year-summary-value">${betterYearOption}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Miesiące lepsze dla godzinówki</span>
        <span class="year-summary-value">${hourlyBetterMonths}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Miesiące lepsze dla podstawy</span>
        <span class="year-summary-value">${baseBetterMonths}</span>
      </div>

      <div class="year-summary-item">
        <span class="year-summary-label">Remis</span>
        <span class="year-summary-value">${drawMonths}</span>
      </div>
    </div>
  `;
}

function updateSalaryChart() {
  const chartBox = document.getElementById("salaryChart");
  if (!chartBox) return;

  if (!state.pointsUnlocked || !calendarGenerated || !state.startCyklu) {
    chartBox.innerHTML = "";
    return;
  }

  const { hourlyRate, baseSalary, hoursPerShift } = getSalarySettings();
  if (!hourlyRate || !baseSalary || !hoursPerShift) {
    chartBox.innerHTML = "";
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    chartBox.innerHTML = "";
    return;
  }

  const data = [];

  for (let month = 0; month < 12; month++) {
    const stats = calculateMonthWorkStats(visibleYear, month, startDate);
    data.push({
      monthLabel: new Date(visibleYear, month, 1).toLocaleDateString("pl-PL", {
        month: "short",
      }),
      hourlyAmount: stats.hourlyAmount,
      baseTotalAmount: stats.baseTotalAmount,
    });
  }

  const maxValue = Math.max(
    ...data.map((item) => Math.max(item.hourlyAmount, item.baseTotalAmount)),
    1,
  );

  const barsHtml = data
    .map((item) => {
      const hourlyHeight = (item.hourlyAmount / maxValue) * 160;
      const baseHeight = (item.baseTotalAmount / maxValue) * 160;

      const diff = roundMoney(item.hourlyAmount - item.baseTotalAmount);
      const absDiff = Math.abs(diff);

      let diffColor = "#64748b";
      if (diff > 0) diffColor = "#2563eb";
      if (diff < 0) diffColor = "#16a34a";

      const diffLabel =
        absDiff === 0
          ? "0 zł"
          : `${diff > 0 ? "+" : "-"}${absDiff.toLocaleString("pl-PL", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })} zł`;

      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:6px; min-width:58px;">
          <div style="font-size:11px; font-weight:600; color:${diffColor}; white-space:nowrap;">
            ${diffLabel}
          </div>

          <div style="display:flex; align-items:flex-end; gap:4px; height:180px;">
            <div
              title="Godzinówka: ${formatMoney(item.hourlyAmount)}"
              style="width:14px; height:${hourlyHeight}px; background:#2563eb; border-radius:4px;"
            ></div>

            <div
              title="Podstawa z nocnymi: ${formatMoney(item.baseTotalAmount)}"
              style="width:14px; height:${baseHeight}px; background:#16a34a; border-radius:4px;"
            ></div>
          </div>

          <div style="font-size:12px;">${item.monthLabel}</div>
        </div>
      `;
    })
    .join("");

  chartBox.innerHTML = `
    <div style="margin-bottom:8px;"><strong>Wykres roczny</strong></div>

    <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:12px; font-size:13px;">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="display:inline-block; width:12px; height:12px; background:#2563eb; border-radius:2px;"></span>
        Stawka godzinowa
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="display:inline-block; width:12px; height:12px; background:#16a34a; border-radius:2px;"></span>
        Podstawa + nocne
      </div>
    </div>

    <div style="display:flex; gap:10px; align-items:flex-end; overflow-x:auto; padding-bottom:8px;">
      ${barsHtml}
    </div>
  `;
}
function updateSalaryMonthReport() {
  const monthBox = document.getElementById("salaryMonthReport");
  if (!monthBox) return;

  if (!state.pointsUnlocked) {
    monthBox.innerHTML = "Ta sekcja jest dostępna po wpisaniu kodu.";
    return;
  }

  if (!calendarGenerated || !state.startCyklu) {
    monthBox.innerHTML = "Najpierw wygeneruj grafik.";
    return;
  }

  const { hourlyRate, baseSalary, hoursPerShift } = getSalarySettings();

  if (!hourlyRate || !baseSalary || !hoursPerShift) {
    monthBox.innerHTML =
      "Uzupełnij stawkę godzinową, podstawę i godziny na zmianę.";
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    monthBox.innerHTML = "Brak danych do obliczeń.";
    return;
  }

  const stats = calculateMonthWorkStats(visibleYear, visibleMonth, startDate);
  const monthLabel = new Date(visibleYear, visibleMonth, 1).toLocaleDateString(
    "pl-PL",
    {
      month: "long",
      year: "numeric",
    },
  );

  let betterClass = "orange";
  if (stats.betterOption === "Stawka godzinowa") betterClass = "blue";
  if (stats.betterOption === "Podstawa") betterClass = "green";

  monthBox.innerHTML = `
    <div class="salary-section">
      <div class="salary-title">Porównanie dla: ${monthLabel}</div>

      <div class="salary-grid">
        <div class="salary-card">
          <span class="salary-label">Dni pracujące</span>
          <span class="salary-value">${stats.workingDays}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Dni nocne</span>
          <span class="salary-value">${stats.nightDays}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Godziny</span>
          <span class="salary-value">${stats.hours}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Godziny nocne</span>
          <span class="salary-value">${stats.nightHours}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Godzinówka: stawka</span>
          <span class="salary-value blue">${formatMoney(stats.hourlyRate)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Podstawa miesięczna</span>
          <span class="salary-value green">${formatMoney(stats.baseSalary)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Godzinówka: kwota bazowa</span>
          <span class="salary-value blue">${formatMoney(stats.hourlyBaseAmount)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Godzinówka: dodatek nocny</span>
          <span class="salary-value blue">${formatMoney(stats.hourlyNightBonusAmount)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Godzinówka: razem</span>
          <span class="salary-value blue">${formatMoney(stats.hourlyAmount)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Stawka z podstawy w tym miesiącu</span>
          <span class="salary-value">${formatMoney(stats.baseDerivedHourlyRate)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Podstawa: dodatek nocny</span>
          <span class="salary-value green">${formatMoney(stats.baseNightBonusAmount)}</span>
        </div>

        <div class="salary-card">
          <span class="salary-label">Podstawa: razem</span>
          <span class="salary-value green">${formatMoney(stats.baseTotalAmount)}</span>
        </div>

        <div class="salary-diff">
          <div style="margin-bottom: 4px;">Bardziej opłaca się:</div>
          <strong class="${betterClass}">${stats.betterOption}</strong>
          <div style="margin-top: 6px;">
            Różnica: <strong>${formatMoney(stats.diff)}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}
function updateSalaryReports() {
  updateSalarySectionVisibility();
  updateSalaryMonthReport();
  updateSalaryYearReport();
  updateSalaryChart();
}
function renderCalendar() {
  const calendarBody = document.getElementById("calendarBody");
  if (!calendarBody) return;

  calendarBody.innerHTML = "";

  if (!calendarGenerated || !state.startCyklu) {
    updateMonthSummary();
    hideYearSummary();
    return;
  }

  const startDate = parseISO(state.startCyklu);
  if (!startDate) {
    updateMonthSummary();
    hideYearSummary();
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
      calendarBody.appendChild(buildWeekRow(week));
      week = [];
    }
  }

  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    calendarBody.appendChild(buildWeekRow(week));
  }

  renderMonthLabel();
  updateMonthSummary();
  updateSalaryReports();
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

  const showPoints = !!state.pointsUnlocked;

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
  const box = document.getElementById("yearSummary");
  const content = document.getElementById("yearSummaryContent");

  if (!box || !content) return;

  if (box.style.display === "block") {
    box.style.display = "none";
    return;
  }

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
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const cell = getDayDataForDate(dateObj, startDate);

      const typ = cell.typ;
      if (typ) {
        let key = typ;
        if (!Object.prototype.hasOwnProperty.call(counts, key)) {
          key = "INNE";
        }
        counts[key]++;
      }

      if (cell.pktAparat != null) points.aparat += cell.pktAparat;
      if (cell.pktZadanie != null) points.zadanie += cell.pktZadanie;
    }
  }

  const showPoints = !!state.pointsUnlocked;
  const totalPoints = points.aparat + points.zadanie;

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

  content.innerHTML = html;
  box.style.display = "block";
}

// ---------- MODAL ----------
function openDayModal(iso) {
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

  if (modalTitle) {
    modalTitle.textContent = `Dzień: ${dateLabel}`;
  }

  const override = state.overrides[iso] || {};

  if (modalTyp) {
    modalTyp.value = override.typ || "";
  }

  if (modalNotka) {
    modalNotka.value = override.notka || "";
  }

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

  if (modalBackdrop) {
    modalBackdrop.classList.add("show");
  }
}

function unlockPointsIfPasswordCorrect() {
  const modalPassword = document.getElementById("modalPassword");
  const pointsSection = document.getElementById("pointsSection");
  const pktAInput = document.getElementById("modalPktAparat");
  const pktZInput = document.getElementById("modalPktZadanie");

  if (!modalPassword || !pointsSection || !modalDateISO) return;

  if (state.pointsUnlocked) {
    pointsSection.style.display = "flex";
    return;
  }

  if (modalPassword.value === SECRET_PASSWORD) {
    state.pointsUnlocked = true;
    saveState();
    updateSalaryReports();
    pointsSection.style.display = "flex";

    const override = state.overrides[modalDateISO] || {};

    if (pktAInput) {
      pktAInput.value =
        override.pktAparat != null ? String(override.pktAparat) : "";
    }

    if (pktZInput) {
      pktZInput.value =
        override.pktZadanie != null ? String(override.pktZadanie) : "";
    }

    modalPassword.value = "";
    modalPassword.disabled = true;
    modalPassword.placeholder = "Hasło już podane";
    modalPassword.style.opacity = "0.5";

    updateMonthSummary();
  } else {
    pointsSection.style.display = "none";
    if (pktAInput) pktAInput.value = "";
    if (pktZInput) pktZInput.value = "";
  }
}

function closeDayModal() {
  const modalBackdrop = document.getElementById("dayModalBackdrop");
  if (modalBackdrop) {
    modalBackdrop.classList.remove("show");
  }
  modalDateISO = null;
}

function parseNonNegativeNumber(value) {
  if (value === "") return null;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return parsed;
}

function saveDayModal() {
  if (!modalDateISO) return;

  const modalTyp = document.getElementById("modalTyp");
  const modalNotka = document.getElementById("modalNotka");

  const typ = modalTyp ? modalTyp.value : "";
  const notka = modalNotka ? modalNotka.value.trim() : "";

  const baseDate = parseISO(modalDateISO);
  const startDate = parseISO(state.startCyklu);

  if (!baseDate || !startDate) return;

  const baseZmiana = pobierzZmianeDlaDaty(baseDate, startDate);
  const defaultTyp = baseZmiana.kod;

  const pointsSection = document.getElementById("pointsSection");
  const prevOverride = state.overrides[modalDateISO] || {};

  let pktAparat = prevOverride.pktAparat ?? null;
  let pktZadanie = prevOverride.pktZadanie ?? null;

  if (pointsSection && pointsSection.style.display !== "none") {
    const pktAInput = document.getElementById("modalPktAparat");
    const pktZInput = document.getElementById("modalPktZadanie");

    if (pktAInput) {
      pktAparat = parseNonNegativeNumber(pktAInput.value);
    }

    if (pktZInput) {
      pktZadanie = parseNonNegativeNumber(pktZInput.value);
    }
  }

  const brakTypuLubDomyslny = !typ || typ === defaultTyp;
  const brakNotki = !notka;
  const brakPunktow = pktAparat == null && pktZadanie == null;

  if (brakTypuLubDomyslny && brakNotki && brakPunktow) {
    delete state.overrides[modalDateISO];
  } else {
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

// ---------- OVERRIDES PO PRZELICZENIU ----------
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

    if (!typOverride && (maNotke || maPunkty)) {
      newOverrides[iso] = {
        typ: "",
        notka,
        pktAparat,
        pktZadanie,
      };
      return;
    }

    if (typOverride === baseTyp && !maNotke && !maPunkty) {
      return;
    }

    newOverrides[iso] = {
      typ: typOverride,
      notka,
      pktAparat,
      pktZadanie,
    };
  });

  state.overrides = newOverrides;
}

// ---------- GENEROWANIE ----------
function collectEntriesFromInputs() {
  const entries = [];

  for (let i = 0; i < 4; i++) {
    const dataInput = document.getElementById(`data-${i}`);
    const typSelect = document.getElementById(`typ-${i}`);

    entries.push({
      data: dataInput ? dataInput.value : "",
      typ: typSelect ? typSelect.value : "",
    });
  }

  return entries;
}

function firstGeneration() {
  const directionSelect = document.getElementById("direction");
  if (directionSelect) {
    state.direction = directionSelect.value || "321";
  }

  const entries = collectEntriesFromInputs();
  state.dniWejsciowe = entries;

  const validationError = validateEntries(entries);
  if (validationError) {
    alert(validationError);
    showDniWejscioweInputsFromState();
    return;
  }

  const start = znajdzStartCykluZWejsciowych(entries);
  if (!start) {
    const debug = buildDniWejscioweDebug(entries);
    alert(
      "Podane dni nie pasują do wzoru cyklu (w wybranym kierunku).\n\n" +
        "Aktualnie wprowadzone dni:\n" +
        debug,
    );
    showDniWejscioweInputsFromState();
    return;
  }

  state.startCyklu = formatDateISO(start);
  saveState();

  calendarGenerated = true;

  const calendarSection = document.getElementById("calendarSection");
  const emptyInfo = document.getElementById("emptyInfo");

  if (calendarSection) calendarSection.style.display = "block";
  if (emptyInfo) emptyInfo.style.display = "none";

  visibleYear = today.getFullYear();
  visibleMonth = today.getMonth();

  clearDniWejscioweOutline();
  hideYearSummary();
  hideInputDaysAfterFirstGeneration();
  renderCalendar();
}

function recalcGeneration() {
  const directionSelect = document.getElementById("direction");
  if (directionSelect) {
    state.direction = directionSelect.value || "321";
  }

  const entries = collectEntriesFromInputs();
  state.dniWejsciowe = entries;

  const validationError = validateEntries(entries);
  if (validationError) {
    alert(validationError);
    showDniWejscioweInputsFromState();
    return;
  }

  const start = znajdzStartCykluZWejsciowych(entries);
  if (!start) {
    alert(
      "Podane 4 dni nie pasują do wybranego kierunku cyklu.\n\n" +
        "Popraw daty/typy i spróbuj ponownie.",
    );

    showDniWejscioweInputsFromState();
    return;
  }

  state.startCyklu = formatDateISO(start);
  adjustOverridesAfterRecalc();
  saveState();

  calendarGenerated = true;

  const calendarSection = document.getElementById("calendarSection");
  const emptyInfo = document.getElementById("emptyInfo");

  if (calendarSection) calendarSection.style.display = "block";
  if (emptyInfo) emptyInfo.style.display = "none";

  clearDniWejscioweOutline();
  hideYearSummary();
  renderCalendar();
}

function resetGrafik() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

// ---------- UPDATE BANNER ----------
function showUpdateBanner() {
  const banner = document.getElementById("updateBanner");
  const btn = document.getElementById("updateReloadBtn");

  if (!banner || !btn) return;

  banner.style.display = "flex";

  btn.onclick = () => {
    window.location.reload();
  };
}

// ---------- SWIPE ----------
function setupCalendarSwipe() {
  const calendarWrapper = document.querySelector(".calendar-wrapper");
  if (!calendarWrapper) return;

  const SWIPE_THRESHOLD = 50;
  const MAX_VERTICAL_OFFSET = 40;

  calendarWrapper.addEventListener(
    "touchstart",
    (e) => {
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchEndX = touch.clientX;
      touchEndY = touch.clientY;
    },
    { passive: true },
  );

  calendarWrapper.addEventListener(
    "touchmove",
    (e) => {
      const touch = e.touches[0];
      touchEndX = touch.clientX;
      touchEndY = touch.clientY;
    },
    { passive: true },
  );

  calendarWrapper.addEventListener(
    "touchend",
    () => {
      if (touchStartX === null || touchStartY === null) return;

      const dx = (touchEndX ?? touchStartX) - touchStartX;
      const dy = (touchEndY ?? touchStartY) - touchStartY;

      touchStartX = null;
      touchStartY = null;
      touchEndX = null;
      touchEndY = null;

      if (Math.abs(dy) > MAX_VERTICAL_OFFSET) return;
      if (Math.abs(dx) < SWIPE_THRESHOLD) return;

      if (dx < 0) {
        const btnNext = document.getElementById("btnNextMonth");
        if (btnNext) btnNext.click();
      } else {
        const btnPrev = document.getElementById("btnPrevMonth");
        if (btnPrev) btnPrev.click();
      }
    },
    { passive: true },
  );
}

// ---------- INIT ----------
document.addEventListener("DOMContentLoaded", () => {
  loadState();
  updateSalarySectionVisibility();
  const directionSelect = document.getElementById("direction");
  const dniWrapper = document.getElementById("dniWejscioweWrapper");
  const btnGeneruj = document.getElementById("btnGeneruj");
  const btnRecalc = document.getElementById("btnRecalc");
  const btnReset = document.getElementById("btnReset");
  const calendarSection = document.getElementById("calendarSection");
  const emptyInfo = document.getElementById("emptyInfo");
  const btnYearSummary = document.getElementById("btnYearSummary");

  if (directionSelect) {
    directionSelect.value = state.direction || "321";
  }
  updateSalaryInputsFromState();
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

    if (calendarSection) calendarSection.style.display = "block";
    if (emptyInfo) emptyInfo.style.display = "none";

    hideInputDaysAfterFirstGeneration();
    clearDniWejscioweOutline();
    renderCalendar();
  } else {
    if (btnRecalc) btnRecalc.style.display = "none";
    if (dniWrapper) dniWrapper.style.display = "block";
    if (btnGeneruj) btnGeneruj.style.display = "inline-block";
    hideYearSummary();
  }

  if (btnGeneruj) btnGeneruj.addEventListener("click", firstGeneration);
  if (btnRecalc) btnRecalc.addEventListener("click", recalcGeneration);
  if (btnReset) btnReset.addEventListener("click", resetGrafik);
  if (btnYearSummary) btnYearSummary.addEventListener("click", showYearSummary);

  const modalPasswordInput = document.getElementById("modalPassword");
  if (modalPasswordInput) {
    modalPasswordInput.addEventListener("input", unlockPointsIfPasswordCorrect);
  }

  const btnPrevMonth = document.getElementById("btnPrevMonth");
  const btnNextMonth = document.getElementById("btnNextMonth");

  if (btnPrevMonth) {
    btnPrevMonth.addEventListener("click", () => {
      hideYearSummary();

      if (visibleMonth === 0) {
        visibleMonth = 11;
        visibleYear -= 1;
      } else {
        visibleMonth -= 1;
      }

      renderCalendar();
    });
  }

  if (btnNextMonth) {
    btnNextMonth.addEventListener("click", () => {
      hideYearSummary();

      if (visibleMonth === 11) {
        visibleMonth = 0;
        visibleYear += 1;
      } else {
        visibleMonth += 1;
      }

      renderCalendar();
    });
  }

  const modalCloseBtn = document.getElementById("modalCloseBtn");
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", closeDayModal);
  }

  const dayModalBackdrop = document.getElementById("dayModalBackdrop");
  if (dayModalBackdrop) {
    dayModalBackdrop.addEventListener("click", (e) => {
      if (e.target.id === "dayModalBackdrop") {
        closeDayModal();
      }
    });
  }

  const modalSaveBtn = document.getElementById("modalSaveBtn");
  if (modalSaveBtn) {
    modalSaveBtn.addEventListener("click", saveDayModal);
  }

  const modalClearBtn = document.getElementById("modalClearBtn");
  if (modalClearBtn) {
    modalClearBtn.addEventListener("click", clearDayModal);
  }
  const hourlyRateInput = document.getElementById("hourlyRate");
  const baseSalaryInput = document.getElementById("baseSalary");
  const hoursPerShiftInput = document.getElementById("hoursPerShift");
  const nightBonusPercentInput = document.getElementById("nightBonusPercent");

  [
    hourlyRateInput,
    baseSalaryInput,
    hoursPerShiftInput,
    nightBonusPercentInput,
  ].forEach((input) => {
    if (!input) return;

    input.addEventListener("input", () => {
      saveSalarySettingsFromInputs();
      updateSalaryReports();
    });
  });
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

    navigator.serviceWorker.addEventListener("message", (event) => {
      if (!event.data || !event.data.type) return;

      if (event.data.type === "NEW_VERSION_AVAILABLE") {
        showUpdateBanner();
      }
    });
  }
  updateSalaryReports();
  setupCalendarSwipe();
});

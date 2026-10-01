const COLORS = {
  amber: "#FFB020",
  red: "#E5484D",
  green: "#3FA772",
  orange: "#E0812A",
  blue: "#5B9BD5",
  paper: "#EDEAE2",
  muted: "#868C94",
  grid: "#2E333B",
};

const PALETTE = ["#FFB020", "#E0812A", "#E5484D", "#5B9BD5", "#3FA772", "#B7B9B8", "#7A5A16", "#D9B233"];

Chart.defaults.color = COLORS.muted;
Chart.defaults.font.family = "Kanit, sans-serif";
Chart.defaults.borderColor = COLORS.grid;

async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`โหลดข้อมูลไม่สำเร็จ: ${url}`);
  return res.json();
}

function fmt(n) {
  return Number(n).toLocaleString("th-TH");
}

// ---------- สรุปตัวเลขบนหัวเรื่อง ----------
async function loadSummary() {
  const s = await getJSON("/api/summary");
  document.getElementById("hero-count").textContent = fmt(s.total_accidents);
  document.getElementById("kpi-total").textContent = fmt(s.total_accidents);
  document.getElementById("kpi-deaths").textContent = fmt(s.total_deaths);
  document.getElementById("kpi-injuries").textContent = fmt(s.total_injuries);
  document.getElementById("kpi-provinces").textContent = fmt(s.provinces_covered);
}

// ---------- กราฟแท่ง/เส้นมาตรฐาน ----------
function barChart(ctx, labels, values, color, horizontal = false) {
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: color, borderRadius: 3, maxBarThickness: 34 }],
    },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: COLORS.grid, display: !horizontal }, ticks: { autoSkip: true } },
        y: { grid: { color: COLORS.grid, display: horizontal }, beginAtZero: true },
      },
    },
  });
}

async function loadHourChart() {
  const d = await getJSON("/api/stats/by_hour");
  barChart(document.getElementById("chart-hour"), d.labels, d.values, COLORS.amber);
}

async function loadWeekdayChart() {
  const d = await getJSON("/api/stats/by_weekday");
  barChart(document.getElementById("chart-weekday"), d.labels, d.values, COLORS.orange);
}

async function loadMonthChart() {
  const d = await getJSON("/api/stats/by_month");
  barChart(document.getElementById("chart-month"), d.labels, d.values, COLORS.blue);
}

async function loadWeatherChart() {
  const d = await getJSON("/api/stats/by_weather");
  new Chart(document.getElementById("chart-weather"), {
    type: "doughnut",
    data: {
      labels: d.labels,
      datasets: [{ data: d.values, backgroundColor: PALETTE, borderColor: "#1B1E23", borderWidth: 2 }],
    },
    options: {
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12, padding: 12, font: { size: 11.5 } } } },
    },
  });
}

async function loadProvinceChart() {
  const d = await getJSON("/api/stats/top_provinces");
  barChart(document.getElementById("chart-province"), d.labels, d.values, COLORS.red, true);
}

async function loadCauseChart() {
  const d = await getJSON("/api/stats/top_causes");
  barChart(document.getElementById("chart-cause"), d.labels, d.values, COLORS.green, true);
}

async function loadYearChart() {
  const d = await getJSON("/api/stats/by_year");
  new Chart(document.getElementById("chart-year"), {
    data: {
      labels: d.labels,
      datasets: [
        {
          type: "bar",
          label: "จำนวนอุบัติเหตุ",
          data: d.accidents,
          backgroundColor: "rgba(255,176,32,0.55)",
          borderRadius: 3,
          yAxisID: "y",
        },
        {
          type: "line",
          label: "ผู้เสียชีวิต",
          data: d.deaths,
          borderColor: COLORS.red,
          backgroundColor: COLORS.red,
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
      scales: {
        y: { position: "left", grid: { color: COLORS.grid }, title: { display: true, text: "อุบัติเหตุ (ครั้ง)" } },
        y1: { position: "right", grid: { display: false }, title: { display: true, text: "ผู้เสียชีวิต (คน)" } },
      },
    },
  });
}

// ---------- Heatmap วัน x ชั่วโมง ----------
function heatColor(v, max) {
  if (max === 0) return "rgba(255,176,32,0.05)";
  const t = Math.pow(v / max, 0.55); // ปรับความชันสี ให้เห็นความต่างชัดขึ้น
  // ไล่จาก asphalt -> amber -> red
  const r1 = [46, 51, 59], r2 = [255, 176, 32], r3 = [229, 72, 77];
  let c;
  if (t < 0.5) {
    const k = t / 0.5;
    c = r1.map((a, i) => Math.round(a + (r2[i] - a) * k));
  } else {
    const k = (t - 0.5) / 0.5;
    c = r2.map((a, i) => Math.round(a + (r3[i] - a) * k));
  }
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

async function loadHeatmap() {
  const d = await getJSON("/api/stats/heatmap");
  const container = document.getElementById("heatmap");
  const max = Math.max(...d.matrix.flat());

  const hourRow = document.createElement("div");
  hourRow.className = "hm-hourlabels";
  hourRow.innerHTML = "<span></span>" + d.hours.map((h, i) => `<span>${i % 2 === 0 ? h : ""}</span>`).join("");
  container.appendChild(hourRow);

  d.weekdays.forEach((wd, ri) => {
    const row = document.createElement("div");
    row.className = "hm-row";
    let cells = `<span class="hm-label">${wd}</span>`;
    d.matrix[ri].forEach((v) => {
      cells += `<span class="hm-cell" title="${wd} ${v} ครั้ง" style="background:${heatColor(v, max)}"></span>`;
    });
    row.innerHTML = cells;
    container.appendChild(row);
  });
}

// ---------- แผนที่ ----------
let leafletMap, markerLayer;

async function initMap() {
  leafletMap = L.map("map", { scrollWheelZoom: false }).setView([13.7, 100.9], 6);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap &copy; CARTO",
    maxZoom: 18,
  }).addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
  await loadMapPoints();
}

async function loadMapPoints(province) {
  const url = province ? `/api/map_points?province=${encodeURIComponent(province)}` : "/api/map_points";
  const points = await getJSON(url);
  markerLayer.clearLayers();
  points.forEach((p) => {
    const severe = p.severity_score >= 3;
    L.circleMarker([p.lat, p.lon], {
      radius: severe ? 4 : 2.5,
      color: severe ? COLORS.red : COLORS.amber,
      fillColor: severe ? COLORS.red : COLORS.amber,
      fillOpacity: 0.65,
      weight: 0,
    }).addTo(markerLayer);
  });
}

// ---------- ฟอร์มทำนายความเสี่ยง ----------
async function initPredictForm() {
  const opts = await getJSON("/api/options");

  fillSelect("f-province", opts.provinces);
  fillSelect("f-hourbin", opts.hour_bins);
  fillSelect("f-weekday", opts.weekdays);
  fillSelect("f-season", opts.seasons, { rainy: "ฤดูฝน", summer: "ฤดูร้อน", winter: "ฤดูหนาว" });
  fillSelect("map-province", opts.provinces, null, true);

  document.getElementById("f-hourbin").selectedIndex = 3; // default: เร่งด่วนเย็น
  document.getElementById("f-weekday").value = "ศุกร์";

  document.getElementById("predict-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      province: document.getElementById("f-province").value,
      hour_bin: document.getElementById("f-hourbin").value,
      weekday: document.getElementById("f-weekday").value,
      season: document.getElementById("f-season").value,
    };
    const result = await getJSON("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderResult(result);
  });

  document.getElementById("map-province").addEventListener("change", (e) => {
    loadMapPoints(e.target.value || undefined);
  });
}

function fillSelect(id, values, labelMap, withAllOption) {
  const el = document.getElementById(id);
  el.innerHTML = "";
  values.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = labelMap ? labelMap[v] || v : v;
    el.appendChild(opt);
  });
}

function renderResult(result) {
  const box = document.getElementById("predict-result");
  const level = result.risk_level;
  const proba = result.probabilities || {};
  const order = ["ต่ำ", "ปานกลาง", "สูง", "สูงมาก"];

  let bars = "";
  order.forEach((lvl) => {
    const pct = Math.round((proba[lvl] || 0) * 100);
    bars += `
      <div class="proba-row">
        <span>${lvl}</span>
        <span class="proba-track"><span class="proba-fill risk-${lvl}" style="width:${pct}%"></span></span>
        <span>${pct}%</span>
      </div>`;
  });

  box.innerHTML = `
    <div class="result-level risk-${level}">
      <span class="tag">ระดับความเสี่ยง</span>
      <span class="value">${level}</span>
    </div>
    <div class="proba-bars">${bars}</div>
  `;
}


// ---------- AI Chatbot ----------
function addChatMessage(message, sender = "bot") {
  const container = document.getElementById("chat-messages");

  const wrapper = document.createElement("div");
  wrapper.className = `chat-message ${sender}`;

  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";

  // แปลง newline เป็น <br>
  bubble.innerHTML = message
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

  wrapper.appendChild(bubble);
  container.appendChild(wrapper);

  container.scrollTop = container.scrollHeight;
}


async function initChatbot() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");

  if (!form || !input) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const message = input.value.trim();

    if (!message) return;

    addChatMessage(message, "user");

    input.value = "";
    input.disabled = true;

    try {
      addChatMessage("กำลังวิเคราะห์ข้อมูล...", "bot");

      const result = await getJSON("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: message,
        }),
      });

      // ลบข้อความ "กำลังวิเคราะห์ข้อมูล..."
      const messages = document.getElementById("chat-messages");
      const lastMessage = messages.lastElementChild;

      if (
        lastMessage &&
        lastMessage.classList.contains("bot") &&
        lastMessage.textContent.includes("กำลังวิเคราะห์ข้อมูล")
      ) {
        lastMessage.remove();
      }

      addChatMessage(result.reply || "ไม่สามารถวิเคราะห์คำถามได้", "bot");

    } catch (err) {
      console.error(err);
      addChatMessage(
        "ขออภัยครับ ระบบไม่สามารถเชื่อมต่อกับโมเดลได้ในขณะนี้",
        "bot"
      );
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}

// ---------- เริ่มทำงานทั้งหมด ----------
(async function main() {
  try {
    await Promise.all([
      loadSummary(),
      loadHourChart(),
      loadWeekdayChart(),
      loadMonthChart(),
      loadWeatherChart(),
      loadProvinceChart(),
      loadCauseChart(),
      loadYearChart(),
      loadHeatmap(),
      initPredictForm(),
      initChatbot(),
    ]);

    await initMap();
  } catch (err) {
    console.error(err);
  }
})();
(() => {
  const state = {
    data: null,
    activeTab: "arama",
    groupSubtab: "puan",
    selectedPlayerId: null,
    standingsFilter: "all",
    completedGroupFilter: "all",
    eliminationStatusFilter: "all",
    eliminationRoundFilter: "all",
    chartScale: 1,
    chartRotation: 0,
    chartFullscreen: false,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const normalize = (value) => String(value ?? "")
    .toLocaleLowerCase("tr-TR")
    .replaceAll("ı", "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const asNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };

  const sortTimeValue = (match) => `${match.tarih || "9999-99-99"} ${match.saat || "99:99"} ${String(match.id || "").padStart(8, "0")}`;

  const formatDate = (iso) => {
    if (!iso) return "—";
    const parts = String(iso).split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return iso;
  };

  const formatAverage = (value) => asNumber(value).toFixed(3).replace(".", ",");

  const matchAverage = (match, playerNo) => {
    const sayi = asNumber(match[`oyuncu${playerNo}_sayi`]);
    const istaka = asNumber(match[`oyuncu${playerNo}_istaka`]);
    return istaka > 0 ? sayi / istaka : 0;
  };

  const playerNameWithHandicap = (match, playerNo) => {
    const name = match[`oyuncu${playerNo}_adi`] || "—";
    const hcp = match[`oyuncu${playerNo}_handikap`];
    return `${name} (${hcp ?? 0})`;
  };

  const displayedStatus = (match) => match.gorunen_durum || (match.durum === "Tamamlandı" ? "Tamamlandı" : (match.tarih || match.saat ? "Planlandı" : "Planlanmadı"));

  const statusBadgeClass = (status) => {
    if (status === "Tamamlandı" || status === "Sonuçlandı") return "badge success";
    if (status === "Planlandı") return "badge warn";
    if (status === "Bekliyor") return "badge warn";
    return "badge muted";
  };

  const hideToast = () => {
    const el = $("#toast");
    if (!el) return;
    window.clearTimeout(toast._timer);
    el.classList.remove("show");
    el.textContent = "";
  };

  const toast = (message) => {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => {
      el.classList.remove("show");
      el.textContent = "";
    }, 2200);
  };

  async function loadData() {
    try {
      const response = await fetch(`data/turnuva.json?v=${Date.now()}`, { cache: "no-store" });
      if (response.ok) return response.json();
    } catch (_) {}
    if (window.TURNUVA_VERISI) return window.TURNUVA_VERISI;
    throw new Error("Turnuva verisi yüklenemedi.");
  }

  function renderHeader() {
    const { turnuva = {}, ozet = {}, son_guncelleme = "" } = state.data;
    $("#tournamentTitle").textContent = turnuva.ad || "Turnuva Sonuçları";
    $("#tournamentMeta").textContent = [
      turnuva.durum ? `Durum: ${turnuva.durum}` : "",
      son_guncelleme ? `Son güncelleme: ${son_guncelleme}` : "",
    ].filter(Boolean).join("  •  ");

    const cards = [
      [ozet.oyuncu_sayisi || 0, "Oyuncu"],
      [ozet.toplam_mac || 0, "Toplam maç"],
      [ozet.tamamlanan_mac || 0, "Tamamlanan"],
      [ozet.planlanan_mac || 0, "Planlanan"],
    ];
    $("#summaryCards").innerHTML = cards.map(([value, label]) => `
      <article class="stat-card">
        <div class="stat-value">${esc(value)}</div>
        <div class="stat-label">${esc(label)}</div>
      </article>
    `).join("");
  }

  function setTab(tab) {
    state.activeTab = tab;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    $$(".screen").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setGroupSubtab(subtab) {
    state.groupSubtab = subtab;
    $$(".sub-tab").forEach((button) => button.classList.toggle("active", button.dataset.groupSubtab === subtab));
    $$(".sub-panel").forEach((panel) => panel.classList.remove("active"));
    if (subtab === "puan") $("#groupPuanPanel")?.classList.add("active");
    if (subtab === "maclar") $("#groupMatchesPanel")?.classList.add("active");
  }

  function latestUpperRoundStatus(player) {
    const turns = state.data.grup_turlari || [];
    if (!turns.length) return "Devam ediyor";
    const latestTurn = [...turns].sort((a, b) => asNumber(a.tur_no) - asNumber(b.tur_no)).slice(-1)[0];
    const promoted = (latestTurn.gruptan_cikanlar || []).find((row) => Number(row.oyuncu_id) === Number(player.oyuncu_id));
    if (promoted) return `Üst tura çıktı • Genel sıra: ${promoted.eleme_sirasi || promoted.sira || "—"}`;
    const hasPromotedList = (latestTurn.gruptan_cikanlar || []).length > 0;
    const hasGroupRecord = (player.grup_siralar || []).some((row) => Number(row.tur_no) === Number(latestTurn.tur_no));
    if (hasPromotedList && hasGroupRecord) return "Elendi";
    return "Devam ediyor";
  }

  function playerSubtitle(player) {
    const grup = (player.grup_siralar || []).slice(-1)[0];
    const parts = [];
    const upperStatus = latestUpperRoundStatus(player);
    if (upperStatus) parts.push(upperStatus);
    if (grup) parts.push(`Grup ${grup.grup_no}: ${grup.sira}. sıra`);
    if (player.mac_ozeti) parts.push(`${player.mac_ozeti.oynanan}/${player.mac_ozeti.toplam} maç oynadı`);
    return parts.join(" • ") || "Oyuncu detayı";
  }

  function renderSearch() {
    const input = $("#playerSearch");
    const resultsEl = $("#searchResults");
    if (!input || !resultsEl) return;
    const query = normalize(input.value);
    const players = state.data.oyuncu_ozetleri || [];
    if (!query) {
      resultsEl.innerHTML = `<div class="empty">Oyuncu bulmak için arama kutusuna isim yazın.</div>`;
      renderPlayerDetail();
      return;
    }
    const matches = players
      .filter((player) => normalize(`${player.ad_soyad} ${player.arama}`).includes(query))
      .slice(0, 12);

    if (!matches.length) {
      resultsEl.innerHTML = `<div class="empty">Bu isimle oyuncu bulunamadı.</div>`;
      state.selectedPlayerId = null;
      renderPlayerDetail();
      return;
    }

    resultsEl.innerHTML = matches.map((player) => `
      <button class="result-btn" type="button" data-player-id="${esc(player.oyuncu_id)}">
        <strong>${esc(player.ad_soyad)}</strong>
        <span>${esc(playerSubtitle(player))}</span>
      </button>
    `).join("");
    $$(".result-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedPlayerId = Number(button.dataset.playerId);
        renderPlayerDetail();
        $("#playerDetail")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function playerRows(title, rows, columns) {
    if (!rows || !rows.length) return "";
    return `
      <article class="table-card compact-table">
        <div class="table-head"><h3>${esc(title)}</h3><span class="badge muted">${rows.length}</span></div>
        <div class="table-scroll">
          <table>
            <thead><tr>${columns.map((c) => `<th class="${c.className || ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
            <tbody>${rows.map((row) => `<tr>${columns.map((c) => `<td class="${c.className || ""}">${esc(c.value(row))}</td>`).join("")}</tr>`).join("")}</tbody>
          </table>
        </div>
        <div class="mobile-data-list">
          ${rows.map((row) => `
            <article class="mobile-data-card">
              ${columns.map((c, index) => `
                <div class="${index === 0 ? "mobile-data-main" : "mobile-data-field"}">
                  <span>${esc(c.label)}</span>
                  <strong>${esc(c.value(row))}</strong>
                </div>
              `).join("")}
            </article>
          `).join("")}
        </div>
      </article>
    `;
  }

  function matchDetailLine(match) {
    const p1 = match.oyuncu1_adi || "Oyuncu 1";
    const p2 = match.oyuncu2_adi || "Oyuncu 2";
    const p1Ys = `${asNumber(match.oyuncu1_ys1)}/${asNumber(match.oyuncu1_ys2)}`;
    const p2Ys = `${asNumber(match.oyuncu2_ys1)}/${asNumber(match.oyuncu2_ys2)}`;
    return `(${p1} - YS: ${p1Ys} - Ort: ${formatAverage(matchAverage(match, 1))}) - (${p2} - YS: ${p2Ys} - Ort: ${formatAverage(matchAverage(match, 2))})`;
  }

  function completedMatchCard(match) {
    return `
      <article class="match-card completed-card">
        <div class="match-main-row">
          <div class="match-text">
            <div class="players">${esc(playerNameWithHandicap(match, 1))} vs ${esc(playerNameWithHandicap(match, 2))}</div>
            <div class="match-meta">
              <span>${esc(match.asama === "eleme" ? "Eleme" : "Grup")}</span>
              ${match.tur_no ? `<span>${esc(match.tur_no)}. Tur</span>` : ""}
              ${match.grup_no ? `<span>Grup ${esc(match.grup_no)}</span>` : ""}
              <span>${formatDate(match.tarih)} ${esc(match.saat || "")}</span>
            </div>
            ${match.kazanan_adi ? `<div class="winner">Kazanan: ${esc(match.kazanan_adi)}</div>` : ""}
          </div>
          <div class="score-box">
            <span>Skor</span>
            <strong>${esc(match.skor || "—")}</strong>
          </div>
        </div>
        <div class="match-detail-line">${esc(matchDetailLine(match))}</div>
      </article>
    `;
  }

  function scheduledMatchCard(match, options = {}) {
    const showTable = options.showTable !== false;
    const showStatus = options.showStatus !== false;
    const status = displayedStatus(match) === "Planlanmadı" ? "Bekliyor" : displayedStatus(match);
    return `
      <article class="match-card">
        <div class="match-main-row">
          <div class="match-text">
            <div class="players">${esc(playerNameWithHandicap(match, 1))} vs ${esc(playerNameWithHandicap(match, 2))}</div>
            <div class="match-meta">
              <span>${esc(match.asama === "eleme" ? "Eleme" : "Grup")}</span>
              ${match.tur_no ? `<span>${esc(match.tur_no)}. Tur</span>` : ""}
              ${match.grup_no ? `<span>Grup ${esc(match.grup_no)}</span>` : ""}
              <span>${formatDate(match.tarih)} ${esc(match.saat || "")}</span>
              ${showTable && match.masa_no ? `<span>Masa ${esc(match.masa_no)}</span>` : ""}
            </div>
          </div>
          ${showStatus ? `<span class="${statusBadgeClass(status)}">${esc(status)}</span>` : ""}
        </div>
      </article>
    `;
  }

  function matchMiniList(title, matches, completedOnly = false) {
    const filtered = completedOnly ? (matches || []).filter((m) => m.durum === "Tamamlandı") : (matches || []);
    if (!filtered.length) {
      return `<article class="card"><div class="card-title"><h3>${esc(title)}</h3></div><div class="empty">Maç yok.</div></article>`;
    }
    return `
      <article class="card">
        <div class="card-title"><h3>${esc(title)}</h3><span class="badge muted">${filtered.length}</span></div>
        <div class="match-list">${filtered.map((m) => m.durum === "Tamamlandı" ? completedMatchCard(m) : scheduledMatchCard(m)).join("")}</div>
      </article>
    `;
  }

  function renderPlayerDetail() {
    const el = $("#playerDetail");
    if (!el) return;
    if (!state.selectedPlayerId) {
      el.innerHTML = "";
      return;
    }
    const player = (state.data.oyuncu_ozetleri || []).find((p) => Number(p.oyuncu_id) === Number(state.selectedPlayerId));
    if (!player) {
      el.innerHTML = "";
      return;
    }
    const latestGroup = (player.grup_siralar || []).slice(-1)[0] || {};
    const summary = player.mac_ozeti || {};
    const completed = (player.oynanan_maclar || []).filter((m) => m.durum === "Tamamlandı");
    const latestStats = latestGroup || {};
    el.innerHTML = `
      <article class="card player-card">
        <div class="card-title">
          <div><h2>${esc(player.ad_soyad)}</h2><p class="muted">${esc(latestUpperRoundStatus(player))}</p></div>
          <span class="badge">HCP ${esc(player.handikap || 0)}</span>
        </div>
        <div class="kv-grid">
          <div class="kv"><span>Grup sırası</span><strong>${esc(latestGroup.grup_no ? `Grup ${latestGroup.grup_no} / ${latestGroup.sira}. sıra` : "—")}</strong></div>
          <div class="kv"><span>Galibiyet / Mağlubiyet</span><strong>${esc(summary.galibiyet || 0)} / ${esc(summary.maglubiyet || 0)}</strong></div>
          <div class="kv"><span>Ort.</span><strong>${esc(formatAverage(latestStats.ortalama || 0))}</strong></div>
          <div class="kv"><span>Kalan maç</span><strong>${esc(summary.kalan || 0)}</strong></div>
        </div>
      </article>
      ${playerRows("Grup sıraları", player.grup_siralar || [], [
        { label: "Tur", value: (r) => `${r.tur_no}. Tur` },
        { label: "Grup", value: (r) => r.grup_no },
        { label: "Sıra", value: (r) => r.sira },
        { label: "Averaj", value: (r) => r.averaj },
        { label: "Ort.", value: (r) => formatAverage(r.ortalama) },
        { label: "Puan", value: (r) => r.puan },
      ])}
      ${matchMiniList("Tamamlanan maçları", completed, true)}
      ${matchMiniList("Kalan maçları", player.kalan_maclar || [], false)}
    `;
  }

  function promotedIdsForTurn(turn) {
    return new Set((turn.gruptan_cikanlar || []).map((row) => Number(row.oyuncu_id)).filter(Boolean));
  }

  function groupRowsByPlayer(turn) {
    const byPlayer = new Map();
    (turn.gruplar || []).forEach((group) => {
      (group.puan_durumu || []).forEach((row) => byPlayer.set(Number(row.oyuncu_id), row));
    });
    return byPlayer;
  }

  function tableRowClass(row, index, promotedIds, promotedCount) {
    if (promotedIds && promotedIds.has(Number(row.oyuncu_id))) return index === 0 ? "first" : "promoted";
    if (promotedCount && index < promotedCount) return index === 0 ? "first" : "promoted";
    return "";
  }

  function standingsMobileCard(row, index, options = {}) {
    const rowClass = tableRowClass(row, index, options.promotedIds || null, asNumber(options.promotedCount));
    const rank = row.sira || row.eleme_sirasi || index + 1;
    const showGroup = !!options.showGroup;
    const groupText = showGroup
      ? [`Grup ${row.grup_no || "—"}`, row.grup_sirasi ? `${row.grup_sirasi}. sıra` : ""].filter(Boolean).join(" • ")
      : "";
    const hcp = row.handikap !== undefined ? ` (${row.handikap})` : "";
    return `
      <article class="standing-mobile-card ${rowClass}">
        <div class="standing-mobile-top">
          <div class="standing-rank">${esc(rank)}</div>
          <div class="standing-player">
            <strong>${esc(row.oyuncu_adi || "—")}</strong>
            <span>${esc(groupText || `Maç: ${row.mac_sayisi || 0}`)}${hcp ? `<em>${esc(hcp)}</em>` : ""}</span>
          </div>
          <div class="standing-points">
            <span>Puan</span>
            <strong>${esc(row.puan || 0)}</strong>
          </div>
        </div>
        <div class="standing-stats">
          <div><span>G/M</span><strong>${esc(row.galibiyet || 0)} / ${esc(row.maglubiyet || 0)}</strong></div>
          <div><span>Averaj</span><strong>${esc(row.averaj || 0)}</strong></div>
          <div><span>YS</span><strong>${esc(row.ys1 || 0)} / ${esc(row.ys2 || 0)}</strong></div>
          <div><span>Ort.</span><strong>${esc(formatAverage(row.ortalama || 0))}</strong></div>
        </div>
      </article>
    `;
  }

  function standingsTable(title, rows, options = {}) {
    if (!rows || !rows.length) return `<article class="card"><div class="card-title"><h3>${esc(title)}</h3></div><div class="empty">Puan durumu yok.</div></article>`;
    const showGroup = !!options.showGroup;
    const promotedIds = options.promotedIds || null;
    const promotedCount = asNumber(options.promotedCount);
    const headers = ["Sıra", "Oyuncu"]
      .concat(showGroup ? ["Grup"] : [])
      .concat(["Maç", "G", "M", "Averaj", "1. YS", "2. YS", "Ort.", "Puan"]);
    return `
      <article class="table-card standings-card">
        <div class="table-head"><h3>${esc(title)}</h3><span class="badge muted">${rows.length} oyuncu</span></div>
        <div class="table-scroll">
          <table class="standings-table">
            <thead><tr>${headers.map((h, index) => `<th class="${index === 1 ? "name" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
            <tbody>
              ${rows.map((row, index) => `
                <tr class="${tableRowClass(row, index, promotedIds, promotedCount)}">
                  <td>${esc(row.sira || row.eleme_sirasi || index + 1)}</td>
                  <td class="name">${esc(row.oyuncu_adi || "—")}${row.handikap !== undefined ? ` <span class="hcp">(${esc(row.handikap)})</span>` : ""}</td>
                  ${showGroup ? `<td>${esc(row.grup_no || "—")}</td>` : ""}
                  <td>${esc(row.mac_sayisi || 0)}</td>
                  <td>${esc(row.galibiyet || 0)}</td>
                  <td>${esc(row.maglubiyet || 0)}</td>
                  <td>${esc(row.averaj || 0)}</td>
                  <td>${esc(row.ys1 || 0)}</td>
                  <td>${esc(row.ys2 || 0)}</td>
                  <td>${esc(formatAverage(row.ortalama || 0))}</td>
                  <td class="points-cell">${esc(row.puan || 0)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="standings-mobile-list">
          ${rows.map((row, index) => standingsMobileCard(row, index, { showGroup, promotedIds, promotedCount })).join("")}
        </div>
      </article>
    `;
  }

  function promotedRowsForTurn(turn) {
    const byPlayer = groupRowsByPlayer(turn);
    return (turn.gruptan_cikanlar || []).map((row, index) => {
      const full = byPlayer.get(Number(row.oyuncu_id)) || {};
      return {
        ...full,
        ...row,
        oyuncu_adi: row.oyuncu_adi || full.oyuncu_adi,
        sira: row.eleme_sirasi || index + 1,
        grup_no: row.grup_no || full.grup_no,
        grup_sirasi: row.grup_sirasi || full.sira,
        handikap: full.handikap ?? row.handikap,
        mac_sayisi: full.mac_sayisi ?? row.mac_sayisi ?? 0,
        galibiyet: full.galibiyet ?? row.galibiyet ?? 0,
        maglubiyet: full.maglubiyet ?? row.maglubiyet ?? 0,
        ortalama: full.ortalama ?? row.ortalama ?? 0,
      };
    });
  }

  function buildStandingsOptions() {
    const select = $("#standingsFilter");
    if (!select) return;
    const turns = state.data.grup_turlari || [];
    const current = state.standingsFilter || "all";
    const options = [`<option value="all">Tümünü Göster</option>`];
    turns.forEach((turn) => {
      options.push(`<option value="promoted:${esc(turn.tur_no)}">${esc(turn.tur_no)}. Tur Eleme Sıralaması</option>`);
      (turn.gruplar || []).forEach((group) => {
        options.push(`<option value="group:${esc(turn.tur_no)}:${esc(group.grup_no)}">${esc(turn.tur_no)}. Tur Grup ${esc(group.grup_no)}</option>`);
      });
    });
    select.innerHTML = options.join("");
    select.value = Array.from(select.options).some((o) => o.value === current) ? current : "all";
    state.standingsFilter = select.value;
  }

  function renderStandings() {
    const turns = state.data.grup_turlari || [];
    const filter = state.standingsFilter || "all";
    if (!turns.length) {
      $("#groupStandings").innerHTML = `<div class="empty">Henüz grup turu bulunamadı.</div>`;
      return;
    }

    const parts = [];
    turns.forEach((turn) => {
      const promotedRows = promotedRowsForTurn(turn);
      const promotedIds = promotedIdsForTurn(turn);
      const turnPrefix = `${turn.tur_no}. Tur`;
      if (filter === "all" || filter === `promoted:${turn.tur_no}`) {
        parts.push(standingsTable(`${turnPrefix} Eleme Sıralaması`, promotedRows, { showGroup: true, promotedIds }));
      }
      if (filter === "all") {
        (turn.gruplar || []).forEach((group) => {
          parts.push(standingsTable(`${turnPrefix} Grup ${group.grup_no}`, group.puan_durumu || [], { promotedCount: Number(turn.gruptan_gecen || 0) }));
        });
      } else if (filter.startsWith(`group:${turn.tur_no}:`)) {
        const groupNo = filter.split(":")[2];
        const group = (turn.gruplar || []).find((g) => String(g.grup_no) === String(groupNo));
        if (group) parts.push(standingsTable(`${turnPrefix} Grup ${group.grup_no}`, group.puan_durumu || [], { promotedCount: Number(turn.gruptan_gecen || 0) }));
      }
    });
    $("#groupStandings").innerHTML = parts.join("") || `<div class="empty">Bu filtrede puan durumu bulunamadı.</div>`;
  }

  function buildGroupCompletedOptions() {
    const select = $("#groupCompletedFilter");
    if (!select) return;
    const groups = [];
    (state.data.grup_turlari || []).forEach((turn) => {
      (turn.gruplar || []).forEach((group) => groups.push({ tur_no: turn.tur_no, grup_no: group.grup_no }));
    });
    select.innerHTML = [`<option value="all">Tüm gruplar</option>`]
      .concat(groups.map((g) => `<option value="${esc(g.tur_no)}:${esc(g.grup_no)}">${esc(g.tur_no)}. Tur Grup ${esc(g.grup_no)}</option>`))
      .join("");
    if (!Array.from(select.options).some((o) => o.value === state.completedGroupFilter)) state.completedGroupFilter = "all";
    select.value = state.completedGroupFilter;
  }

  function allGroupMatches() {
    const matches = [];
    (state.data.grup_turlari || []).forEach((turn) => {
      (turn.gruplar || []).forEach((group) => {
        (group.maclar || []).forEach((match) => matches.push(match));
      });
    });
    return matches;
  }

  function renderGroupCompletedMatches() {
    let matches = allGroupMatches().filter((match) => match.durum === "Tamamlandı");
    if (state.completedGroupFilter !== "all") {
      const [turNo, groupNo] = state.completedGroupFilter.split(":");
      matches = matches.filter((m) => String(m.tur_no) === turNo && String(m.grup_no) === groupNo);
    }
    matches.sort((a, b) => sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));
    $("#groupMatchList").innerHTML = matches.length
      ? `<div class="match-list">${matches.map(completedMatchCard).join("")}</div>`
      : `<div class="empty">Bu filtrede tamamlanan grup maçı bulunamadı.</div>`;
  }

  function allEliminationMatches() {
    const matches = [];
    (state.data.eleme_turlari || []).forEach((turn) => {
      (turn.maclar || []).forEach((match) => matches.push(match));
    });
    return matches;
  }

  function buildEliminationRoundOptions() {
    const select = $("#eliminationRoundFilter");
    if (!select) return;
    const turns = state.data.eleme_turlari || [];
    select.innerHTML = [`<option value="all">Tüm turlar</option>`]
      .concat(turns.map((turn) => `<option value="${esc(turn.tur_no)}">${esc(turn.tur_no)}. Tur</option>`))
      .join("");
    if (!Array.from(select.options).some((o) => o.value === state.eliminationRoundFilter)) state.eliminationRoundFilter = "all";
    select.value = state.eliminationRoundFilter;
  }

  function renderElimination() {
    let matches = allEliminationMatches();
    if (state.eliminationStatusFilter === "waiting") matches = matches.filter((m) => m.durum !== "Tamamlandı");
    if (state.eliminationStatusFilter === "completed") matches = matches.filter((m) => m.durum === "Tamamlandı");
    if (state.eliminationRoundFilter !== "all") matches = matches.filter((m) => String(m.tur_no) === String(state.eliminationRoundFilter));
    matches.sort((a, b) => Number(a.tur_no || 0) - Number(b.tur_no || 0) || asNumber(a.chart_mac_no || a.sira) - asNumber(b.chart_mac_no || b.sira) || sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));
    $("#eliminationList").innerHTML = matches.length
      ? `<div class="match-list">${matches.map((m) => m.durum === "Tamamlandı" ? completedMatchCard(m) : scheduledMatchCard(m)).join("")}</div>`
      : `<div class="empty">Bu filtrede eleme maçı bulunamadı.</div>`;
  }

  function renderUpcoming() {
    const matches = (state.data.maclar || [])
      .filter((match) => match.durum !== "Tamamlandı" && match.tarih && match.saat)
      .sort((a, b) => sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));
    const subtitle = $("#upcomingSubtitle");
    if (subtitle) subtitle.textContent = `${matches.length} planlanmış maç tarih ve saat sırasına göre listelenir.`;
    $("#upcomingMatches").innerHTML = matches.length
      ? `<div class="match-list">${matches.map((m) => scheduledMatchCard(m, { showTable: false })).join("")}</div>`
      : `<div class="empty">Yaklaşan planlı maç bulunmuyor.</div>`;
  }

  function chartStatus(match) {
    if (match.durum === "Tamamlandı") return "Sonuçlandı";
    if (match.tarih || match.saat) return "Planlandı";
    return "Bekliyor";
  }

  function matchSlotNo(match, fallbackIndex) {
    return asNumber(match.chart_mac_no || match.sira || match.mac_no || fallbackIndex, fallbackIndex);
  }

  function nextPowerOfTwo(value) {
    let n = 1;
    const target = Math.max(1, asNumber(value, 1));
    while (n < target) n *= 2;
    return n;
  }

  function buildBracketRounds() {
    const rawTurns = state.data.eleme_turlari || [];
    const turnMap = new Map();
    rawTurns.forEach((turn) => {
      const turNo = Math.max(1, asNumber(turn.tur_no, 1));
      const matches = [...(turn.maclar || [])]
        .map((match, index) => ({ ...match, tur_no: match.tur_no || turNo, chart_mac_no: matchSlotNo(match, index + 1) }))
        .sort((a, b) => matchSlotNo(a, 0) - matchSlotNo(b, 0));
      turnMap.set(turNo, matches);
    });

    if (!turnMap.size) return { rounds: [], baseSlots: 1 };

    const roundNos = [...turnMap.keys()].sort((a, b) => a - b);
    const firstRoundNo = roundNos[0];
    const firstRoundMatches = turnMap.get(firstRoundNo) || [];
    const firstMatchCount = Math.max(
      firstRoundMatches.length,
      ...firstRoundMatches.map((match) => matchSlotNo(match, 0)),
      1
    );
    const baseSlots = nextPowerOfTwo(firstMatchCount);

    const expectedCounts = [];
    let expected = baseSlots;
    expectedCounts.push(expected);
    while (expected > 1) {
      expected = Math.ceil(expected / 2);
      expectedCounts.push(expected);
    }

    const maxActualRound = Math.max(...roundNos);
    const totalRounds = Math.max(maxActualRound, expectedCounts.length);
    const rounds = [];

    for (let turNo = 1; turNo <= totalRounds; turNo += 1) {
      const actualMatches = turnMap.get(turNo) || [];
      const actualBySlot = new Map(actualMatches.map((match, index) => [matchSlotNo(match, index + 1), match]));
      const expectedCount = expectedCounts[turNo - 1] || 1;
      const slotCount = Math.max(expectedCount, actualMatches.length, ...actualMatches.map((match) => matchSlotNo(match, 0)), 1);
      const span = Math.max(1, Math.floor(baseSlots / slotCount));
      const matches = [];

      for (let slot = 1; slot <= slotCount; slot += 1) {
        const source = actualBySlot.get(slot);
        matches.push(source || {
          tur_no: turNo,
          chart_mac_no: slot,
          durum: "Bekliyor",
          placeholder: true,
        });
      }

      rounds.push({ tur_no: turNo, matches, span });
    }

    return { rounds, baseSlots };
  }

  function chartPlaceholderText(match, playerNo) {
    const turNo = asNumber(match.tur_no, 1);
    const slot = matchSlotNo(match, 1);
    if (turNo <= 1) return "Oyuncu bekleniyor";
    const previousMatch = (slot - 1) * 2 + playerNo;
    return `${turNo - 1}. Tur ${previousMatch}. Maç kazananı`;
  }

  function chartPlayerLine(match, playerNo) {
    const name = match[`oyuncu${playerNo}_adi`] || chartPlaceholderText(match, playerNo);
    const hcp = match[`oyuncu${playerNo}_handikap`];
    const score = match.durum === "Tamamlandı" ? asNumber(match[`oyuncu${playerNo}_sayi`]) : "";
    const playerId = match[`oyuncu${playerNo}_id`];
    const isWinner = playerId && Number(match.kazanan_id) === Number(playerId);
    const isPlaceholder = !match[`oyuncu${playerNo}_adi`];
    return `<div class="chart-player ${isWinner ? "winner-player" : ""} ${isPlaceholder ? "placeholder-player" : ""}"><span>${esc(name)}${hcp !== undefined && hcp !== null && !isPlaceholder ? ` <em>(${esc(hcp)})</em>` : ""}</span>${score !== "" ? `<strong>${esc(score)}</strong>` : ""}</div>`;
  }

  function drawChartLines() {
    const board = $("#chartBoard");
    const svg = $("#chartLines");
    if (!board || !svg) return;

    const boardRect = board.getBoundingClientRect();
    const slots = $$(".chart-slot");
    const maxRound = Math.max(...slots.map((slot) => asNumber(slot.dataset.round, 0)), 0);
    const slotByKey = new Map(slots.map((slot) => [`${slot.dataset.round}:${slot.dataset.index}`, slot]));
    const paths = [];

    for (let round = 1; round < maxRound; round += 1) {
      const currentRoundSlots = slots
        .filter((slot) => asNumber(slot.dataset.round, 0) === round)
        .sort((a, b) => asNumber(a.dataset.index, 0) - asNumber(b.dataset.index, 0));

      currentRoundSlots.forEach((slot) => {
        const sourceCard = slot.querySelector(".chart-match");
        if (!sourceCard) return;
        const sourceIndex = asNumber(slot.dataset.index, 1);
        const targetIndex = Math.ceil(sourceIndex / 2);
        const targetSlot = slotByKey.get(`${round + 1}:${targetIndex}`);
        const targetCard = targetSlot?.querySelector(".chart-match");
        if (!targetCard) return;

        const s = sourceCard.getBoundingClientRect();
        const t = targetCard.getBoundingClientRect();
        const x1 = s.right - boardRect.left;
        const y1 = s.top + s.height / 2 - boardRect.top;
        const x2 = t.left - boardRect.left;
        const y2 = t.top + t.height / 2 - boardRect.top;
        const mid = x1 + Math.max(20, (x2 - x1) / 2);
        paths.push(`<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} H ${mid.toFixed(1)} V ${y2.toFixed(1)} H ${x2.toFixed(1)}" />`);
      });
    }

    const width = Math.max(board.scrollWidth, board.offsetWidth, 1);
    const height = Math.max(board.scrollHeight, board.offsetHeight, 1);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    svg.innerHTML = paths.join("");
  }

  function renderChart() {
    const canvas = $("#chartCanvas");
    if (!canvas) return;
    const { rounds, baseSlots } = buildBracketRounds();
    if (!rounds.length) {
      canvas.innerHTML = `<div class="empty">Henüz eleme chartı oluşturulmadı.</div>`;
      return;
    }

    const totalMatches = rounds.reduce((total, round) => total + round.matches.filter((match) => !match.placeholder).length, 0);
    $("#chartSubtitle").textContent = `${rounds.length} tur • ${totalMatches} maç • Tüm eleme chartı`;
    canvas.innerHTML = `
      <div id="chartBoard" class="chart-board" style="--slot-count:${baseSlots}">
        <svg id="chartLines" class="chart-lines" aria-hidden="true"></svg>
        <div class="chart-rounds">
          ${rounds.map((round) => `
            <section class="chart-round" style="grid-template-rows: repeat(${baseSlots}, var(--bracket-slot-height));">
              <div class="chart-round-title">${esc(round.tur_no)}. Tur</div>
              ${round.matches.map((match, index) => {
                const slot = matchSlotNo(match, index + 1);
                const rowStart = ((slot - 1) * round.span) + 1;
                return `
                  <div class="chart-slot" data-round="${esc(round.tur_no)}" data-index="${esc(slot)}" style="grid-row:${rowStart} / span ${round.span};">
                    <article class="chart-match ${match.durum === "Tamamlandı" ? "completed" : ""} ${match.placeholder ? "placeholder-match" : ""}">
                      <div class="chart-match-top">
                        <span>Maç ${esc(match.chart_mac_no || match.sira || slot)}</span>
                        <strong>${esc(chartStatus(match))}</strong>
                      </div>
                      ${chartPlayerLine(match, 1)}
                      ${chartPlayerLine(match, 2)}
                    </article>
                  </div>
                `;
              }).join("")}
            </section>
          `).join("")}
        </div>
      </div>
    `;
    applyChartTransform();
    requestAnimationFrame(drawChartLines);
  }

  function applyChartTransform() {
    const canvas = $("#chartCanvas");
    const overlay = $("#chartOverlay");
    if (!canvas) return;
    canvas.style.transform = `rotate(${state.chartRotation}deg) scale(${state.chartScale})`;
    canvas.style.transformOrigin = "top left";
    overlay?.classList.toggle("fullscreen", state.chartFullscreen);
    overlay?.classList.toggle("rotated", Math.abs(state.chartRotation % 180) === 90);
  }

  function setChartScale(nextScale, anchor = null) {
    const viewport = $("#chartViewport");
    const previousScale = state.chartScale || 1;
    const scale = Math.min(3.5, Math.max(0.1, nextScale));
    if (viewport && anchor) {
      const contentX = (viewport.scrollLeft + anchor.x) / previousScale;
      const contentY = (viewport.scrollTop + anchor.y) / previousScale;
      state.chartScale = scale;
      applyChartTransform();
      viewport.scrollLeft = Math.max(0, (contentX * scale) - anchor.x);
      viewport.scrollTop = Math.max(0, (contentY * scale) - anchor.y);
      return;
    }
    state.chartScale = scale;
    applyChartTransform();
  }

  function fitChartToViewport() {
    const viewport = $("#chartViewport");
    const canvas = $("#chartCanvas");
    if (!viewport || !canvas) return;

    state.chartScale = 1;
    state.chartRotation = state.chartRotation || 0;
    applyChartTransform();

    requestAnimationFrame(() => {
      const content = canvas.querySelector("#chartBoard") || canvas.querySelector(".chart-rounds") || canvas.firstElementChild || canvas;
      const viewportWidth = Math.max(1, viewport.clientWidth - 24);
      const viewportHeight = Math.max(1, viewport.clientHeight - 24);
      const contentWidth = Math.max(1, content.scrollWidth || content.offsetWidth || canvas.scrollWidth);
      const contentHeight = Math.max(1, content.scrollHeight || content.offsetHeight || canvas.scrollHeight);
      const rotated = Math.abs(state.chartRotation % 180) === 90;
      const requiredWidth = rotated ? contentHeight : contentWidth;
      const requiredHeight = rotated ? contentWidth : contentHeight;
      const scale = Math.min(viewportWidth / requiredWidth, viewportHeight / requiredHeight, 1);
      state.chartScale = Math.max(0.12, Math.floor(scale * 100) / 100);
      applyChartTransform();
      viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
    });
  }

  function openChart() {
    const overlay = $("#chartOverlay");
    hideToast();
    state.chartScale = 1;
    state.chartRotation = 0;
    state.chartFullscreen = true;
    renderChart();
    overlay?.classList.add("open");
    overlay?.setAttribute("aria-hidden", "false");
    document.body.classList.add("chart-open");
    requestAnimationFrame(() => {
      drawChartLines();
      fitChartToViewport();
    });
  }

  function bindChartPan() {
    const viewport = $("#chartViewport");
    if (!viewport || viewport.dataset.panBound === "1") return;
    viewport.dataset.panBound = "1";

    let dragging = false;
    let moved = false;
    let pinching = false;
    let pinchStartDistance = 1;
    let pinchStartScale = 1;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    const pointers = new Map();

    const distance = () => {
      const values = [...pointers.values()];
      if (values.length < 2) return 1;
      return Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
    };

    const center = () => {
      const values = [...pointers.values()];
      const rect = viewport.getBoundingClientRect();
      if (values.length < 2) return { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
      return {
        x: ((values[0].x + values[1].x) / 2) - rect.left,
        y: ((values[0].y + values[1].y) / 2) - rect.top,
      };
    };

    const startDrag = (point) => {
      dragging = true;
      moved = false;
      startX = point.x;
      startY = point.y;
      startLeft = viewport.scrollLeft;
      startTop = viewport.scrollTop;
      viewport.classList.add("dragging", "interacting");
    };

    const startPinch = () => {
      dragging = false;
      pinching = true;
      moved = true;
      pinchStartDistance = Math.max(1, distance());
      pinchStartScale = state.chartScale || 1;
      viewport.classList.add("interacting");
    };

    const stopDrag = (event) => {
      pointers.delete(event.pointerId);
      if (pinching && pointers.size === 1) {
        pinching = false;
        const point = [...pointers.values()][0];
        startDrag(point);
        return;
      }
      if (!dragging && !pinching) return;
      dragging = false;
      pinching = false;
      viewport.classList.remove("dragging", "interacting");
      try { viewport.releasePointerCapture(event.pointerId); } catch (_) {}
      window.setTimeout(() => { moved = false; }, 0);
    };

    viewport.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      if (event.target.closest("button, a, input, select, textarea")) return;
      const point = { x: event.clientX, y: event.clientY };
      pointers.set(event.pointerId, point);
      if (pointers.size >= 2) startPinch();
      else startDrag(point);
      try { viewport.setPointerCapture(event.pointerId); } catch (_) {}
      event.preventDefault();
    });

    viewport.addEventListener("pointermove", (event) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pinching && pointers.size >= 2) {
        setChartScale(pinchStartScale * (distance() / pinchStartDistance), center());
        event.preventDefault();
        return;
      }
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      viewport.scrollLeft = startLeft - dx;
      viewport.scrollTop = startTop - dy;
      event.preventDefault();
    });

    viewport.addEventListener("pointerup", stopDrag);
    viewport.addEventListener("pointercancel", stopDrag);
    viewport.addEventListener("pointerleave", stopDrag);
    viewport.addEventListener("click", (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
      }
    }, true);
  }

  function closeChart() {
    const overlay = $("#chartOverlay");
    overlay?.classList.remove("open", "fullscreen", "rotated");
    overlay?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("chart-open");
    hideToast();
  }

  function bindEvents() {
    bindChartPan();
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
    $$(".sub-tab").forEach((button) => button.addEventListener("click", () => setGroupSubtab(button.dataset.groupSubtab)));
    $("#playerSearch")?.addEventListener("input", renderSearch);
    $("#standingsFilter")?.addEventListener("change", (event) => {
      state.standingsFilter = event.target.value;
      renderStandings();
    });
    $("#groupCompletedFilter")?.addEventListener("change", (event) => {
      state.completedGroupFilter = event.target.value;
      renderGroupCompletedMatches();
    });
    $("#eliminationStatusFilter")?.addEventListener("change", (event) => {
      state.eliminationStatusFilter = event.target.value;
      renderElimination();
    });
    $("#eliminationRoundFilter")?.addEventListener("change", (event) => {
      state.eliminationRoundFilter = event.target.value;
      renderElimination();
    });
    $("#refreshBtn")?.addEventListener("click", () => window.location.reload());
    $("#showChartBtn")?.addEventListener("click", openChart);
    $("#chartClose")?.addEventListener("click", closeChart);
    $("#chartZoomIn")?.addEventListener("click", () => {
      setChartScale(state.chartScale + 0.1, { x: $("#chartViewport")?.clientWidth / 2 || 0, y: $("#chartViewport")?.clientHeight / 2 || 0 });
    });
    $("#chartZoomOut")?.addEventListener("click", () => {
      setChartScale(state.chartScale - 0.1, { x: $("#chartViewport")?.clientWidth / 2 || 0, y: $("#chartViewport")?.clientHeight / 2 || 0 });
    });
    $("#chartFit")?.addEventListener("click", fitChartToViewport);
    $("#chartFullscreen")?.addEventListener("click", () => {
      state.chartFullscreen = !state.chartFullscreen;
      applyChartTransform();
      requestAnimationFrame(fitChartToViewport);
    });
    $("#chartRotate")?.addEventListener("click", () => {
      state.chartRotation = (state.chartRotation + 90) % 360;
      applyChartTransform();
      requestAnimationFrame(fitChartToViewport);
    });
    $("#chartOverlay")?.addEventListener("click", (event) => {
      if (event.target.id === "chartOverlay") closeChart();
    });
    window.addEventListener("resize", () => {
      if ($("#chartOverlay")?.classList.contains("open")) requestAnimationFrame(fitChartToViewport);
    });
    window.addEventListener("orientationchange", () => {
      if ($("#chartOverlay")?.classList.contains("open")) {
        setTimeout(fitChartToViewport, 300);
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && $("#chartOverlay")?.classList.contains("open")) closeChart();
    });
  }

  function renderAll() {
    renderHeader();
    buildStandingsOptions();
    buildGroupCompletedOptions();
    buildEliminationRoundOptions();
    renderSearch();
    renderStandings();
    renderGroupCompletedMatches();
    renderElimination();
    renderUpcoming();
  }

  async function init() {
    bindEvents();
    try {
      state.data = await loadData();
      renderAll();
      if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        navigator.serviceWorker.register("service-worker.js").catch(() => {});
      }
    } catch (error) {
      $("#tournamentMeta").textContent = "Veri yüklenemedi";
      $("#summaryCards").innerHTML = "";
      $("#playerDetail").innerHTML = `<div class="empty">${esc(error.message || error)}<br>Yayınla butonuyla veriyi yeniden oluşturun.</div>`;
      toast("Veri yüklenemedi");
    }
  }

  init();
})();

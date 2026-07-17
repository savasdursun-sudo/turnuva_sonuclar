(() => {
  const state = {
    data: null,
    activeTab: "arama",
    groupSubtab: "puan",
    selectedGroupRound: "",
    selectedResultRound: "",
    selectedPlayerId: null,
    standingsFilter: "all",
    completedGroupFilter: "all",
    groupSelectionTouched: false,
    autoSelectedGroup: null,
    resultRoundSelectionTouched: false,
    eliminationStatusFilter: "all",
    eliminationRoundFilter: "all",
    chartScale: 1,
    chartRotation: 0,
    chartFullscreen: false,
    listLimits: {},
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const MATCH_LIST_INITIAL_LIMIT = 80;
  const MATCH_LIST_MORE_STEP = 80;

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
  const activityTimeValue = (match) => `${match.tarih || "0000-00-00"} ${match.saat || "00:00"} ${String(match.id || "").padStart(8, "0")}`;

  const formatDate = (iso) => {
    if (!iso) return "—";
    const parts = String(iso).split("-");
    if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
    return iso;
  };

  const localDateISO = (date = new Date()) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const addDaysISO = (iso, days) => {
    const [year, month, day] = String(iso).split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    date.setDate(date.getDate() + days);
    return localDateISO(date);
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

  function safeColor(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text : fallback;
  }

  function renderHeader() {
    const { turnuva = {}, salon = {}, ozet = {}, son_guncelleme = "" } = state.data;
    const salonAdi = salon.ad || "Bilardo Atölyesi";
    document.documentElement.style.setProperty("--accent", safeColor(salon.tema_rengi, "#0f8c6f"));
    document.documentElement.style.setProperty("--accent-2", safeColor(salon.vurgu_rengi, "#1f6fb2"));
    document.title = `${salonAdi} - ${turnuva.ad || "Sonuçlar"}`;

    const titleEl = $("#tournamentTitle");
    if (titleEl) titleEl.textContent = turnuva.ad || "Turnuva Sonuçları";
    const salonNameEl = $("#salonName");
    if (salonNameEl) salonNameEl.textContent = salonAdi;
    const logoEl = $("#salonLogo");
    if (logoEl && salon.logo_url) {
      logoEl.src = `${salon.logo_url}?v=${state.data.yayin_surumu || Date.now()}`;
      logoEl.hidden = false;
    } else if (logoEl) {
      logoEl.hidden = true;
    }
    const contactEl = $("#salonContact");
    if (contactEl) {
      const contact = [salon.telefon, salon.instagram, salon.web].filter(Boolean).join(" • ");
      contactEl.textContent = contact || (salon.adres || "");
      contactEl.hidden = !contactEl.textContent;
    }
    const headerEl = document.querySelector(".hero-header");
    if (headerEl && salon.header_gorsel_url) {
      headerEl.style.backgroundImage = `linear-gradient(90deg, rgba(3, 12, 22, .18) 0%, rgba(5, 18, 32, .06) 38%, rgba(5, 16, 30, .18) 100%), linear-gradient(180deg, rgba(4, 12, 22, .08), rgba(4, 12, 22, .20)), url("${salon.header_gorsel_url}?v=${state.data.yayin_surumu || Date.now()}")`;
    }
    const metaEl = $("#tournamentMeta");
    if (metaEl) metaEl.textContent = son_guncelleme
      ? `Son güncelleme: ${son_guncelleme}`
      : "Son güncelleme bilgisi yüklenemedi";

    const cards = [
      [ozet.oyuncu_sayisi || 0, "Oyuncu"],
      [ozet.toplam_mac || 0, "Toplam Maç"],
      [ozet.tamamlanan_mac || 0, "Oynanan"],
      [ozet.planlanan_mac || 0, "Planlı Maç"],
    ];
    $("#summaryCards").innerHTML = cards.map(([value, label]) => `
      <article class="stat-card">
        <div class="stat-value">${esc(value)}</div>
        <div class="stat-label">${esc(label)}</div>
      </article>
    `).join("");
  }

  function setTab(tab) {
    if (tab === "grup") applyLatestActiveGroupSelection(false);
    state.activeTab = tab;
    $$(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    $$(".screen").forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tab}`));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setGroupSubtab(subtab = "puan") {
    state.groupSubtab = subtab;
    $$(".sub-tab").forEach((button) => button.classList.toggle("active", button.dataset.groupSubtab === subtab));
    $$(".sub-panel").forEach((panel) => panel.classList.remove("active"));
    if (subtab === "puan") $("#groupPuanPanel")?.classList.add("active");
    if (subtab === "maclar") $("#groupMatchesPanel")?.classList.add("active");
    if (subtab === "cikanlar") $("#groupPromotedPanel")?.classList.add("active");
  }

  function groupRoundValue(turn) {
    return `${turn.tur_tipi || "normal"}:${turn.tur_no || 0}`;
  }

  function groupRoundLabel(turn) {
    const type = String(turn.tur_tipi || "normal").toLocaleLowerCase("tr-TR");
    if (type === "final") return "Final Grupları";
    if (type === "klasman") return "Klasman Grupları";
    return `${turn.tur_no || "?"}. Tur Grupları`;
  }

  function groupShortLabel(turn) {
    const type = String(turn.tur_tipi || "normal").toLocaleLowerCase("tr-TR");
    if (type === "final") return "Final";
    if (type === "klasman") return "Klasman";
    return `${turn.tur_no || "?"}. Tur`;
  }

  function selectedGroupTurn() {
    const turns = state.data?.grup_turlari || [];
    if (!turns.length) return null;
    if (!state.selectedGroupRound) state.selectedGroupRound = groupRoundValue(turns[0]);
    return turns.find((turn) => groupRoundValue(turn) === state.selectedGroupRound) || turns[0];
  }

  function selectedResultTurn() {
    const turns = state.data?.grup_turlari || [];
    if (!turns.length) return null;
    const validValues = new Set(turns.map(groupRoundValue));
    if (!state.selectedResultRound || !validValues.has(state.selectedResultRound)) {
      state.selectedResultRound = state.autoSelectedGroup?.roundValue || state.selectedGroupRound || groupRoundValue(turns[0]);
    }
    return turns.find((turn) => groupRoundValue(turn) === state.selectedResultRound) || turns[0];
  }

  function syncResultRoundWithActiveGroup(force = false) {
    const turns = state.data?.grup_turlari || [];
    if (!turns.length) return;
    const fallback = state.autoSelectedGroup?.roundValue || state.selectedGroupRound || groupRoundValue(turns[0]);
    const validValues = new Set(turns.map(groupRoundValue));
    if (force || !state.resultRoundSelectionTouched || !validValues.has(state.selectedResultRound)) {
      state.selectedResultRound = validValues.has(fallback) ? fallback : groupRoundValue(turns[0]);
    }
  }


  function compareActiveGroupCandidates(a, b) {
    if (!a) return -1;
    if (!b) return 1;
    if (a.hasActivityDate !== b.hasActivityDate) return a.hasActivityDate - b.hasActivityDate;
    if (a.timeKey !== b.timeKey) return a.timeKey > b.timeKey ? 1 : -1;
    if (a.statusRank !== b.statusRank) return a.statusRank - b.statusRank;
    if (a.completedCount !== b.completedCount) return a.completedCount - b.completedCount;
    if (a.turnIndex !== b.turnIndex) return a.turnIndex - b.turnIndex;
    return a.groupIndex - b.groupIndex;
  }

  function matchActivityInfo(match) {
    const completed = match.durum === "Tamamlandı";
    const hasActivityDate = Boolean(match.tarih || match.saat || match.masa_no);
    const statusRank = completed ? 3 : (hasActivityDate ? 2 : 1);
    return {
      hasActivityDate: hasActivityDate ? 1 : 0,
      statusRank,
      timeKey: activityTimeValue(match),
    };
  }

  function findLatestActiveGroupSelection() {
    const turns = state.data?.grup_turlari || [];
    let best = null;

    turns.forEach((turn, turnIndex) => {
      (turn.gruplar || []).forEach((group, groupIndex) => {
        const matches = group.maclar || [];
        const completedCount = matches.filter((match) => match.durum === "Tamamlandı").length;
        const groupNo = group.grup_no;
        if (groupNo === undefined || groupNo === null) return;

        let latestMatchInfo = null;
        matches.forEach((match) => {
          const info = matchActivityInfo(match);
          if (!latestMatchInfo || compareActiveGroupCandidates(
            { ...info, completedCount, turnIndex, groupIndex },
            { ...latestMatchInfo, completedCount, turnIndex, groupIndex }
          ) > 0) latestMatchInfo = info;
        });

        const candidate = {
          roundValue: groupRoundValue(turn),
          groupNo: String(groupNo),
          label: `${groupRoundLabel(turn)} • Grup ${groupNo}`,
          hasActivityDate: latestMatchInfo?.hasActivityDate || 0,
          timeKey: latestMatchInfo?.timeKey || "0000-00-00 00:00 00000000",
          statusRank: latestMatchInfo?.statusRank || (completedCount > 0 ? 2 : 0),
          completedCount,
          turnIndex,
          groupIndex,
        };

        if (!best || compareActiveGroupCandidates(candidate, best) > 0) best = candidate;
      });
    });

    return best;
  }

  function applyLatestActiveGroupSelection(force = false) {
    if (!state.data || (!force && state.groupSelectionTouched)) return;
    const selection = findLatestActiveGroupSelection();
    if (!selection) return;
    state.selectedGroupRound = selection.roundValue;
    if (force || !state.resultRoundSelectionTouched || !state.selectedResultRound) state.selectedResultRound = selection.roundValue;
    state.standingsFilter = "all";
    state.completedGroupFilter = selection.groupNo;
    state.autoSelectedGroup = selection;
  }

  function buildGroupRoundTabs() {
    const el = $("#groupRoundTabs");
    if (!el) return;
    const turns = state.data.grup_turlari || [];
    if (!turns.length) {
      el.innerHTML = "";
      return;
    }
    if (!state.selectedGroupRound || !turns.some((turn) => groupRoundValue(turn) === state.selectedGroupRound)) {
      state.selectedGroupRound = groupRoundValue(turns[0]);
    }
    el.innerHTML = turns.map((turn) => {
      const value = groupRoundValue(turn);
      return `
        <button class="round-tab ${value === state.selectedGroupRound ? "active" : ""}" type="button" data-round-value="${esc(value)}">
          <strong>${esc(groupShortLabel(turn))}</strong>
          <span>${esc(turn.grup_sayisi || 0)} grup</span>
        </button>
      `;
    }).join("");
    $$(".round-tab").forEach((button) => {
      button.addEventListener("click", () => {
        state.groupSelectionTouched = true;
        state.autoSelectedGroup = null;
        state.selectedGroupRound = button.dataset.roundValue;
        state.selectedResultRound = button.dataset.roundValue;
        state.resultRoundSelectionTouched = false;
        state.standingsFilter = "all";
        state.completedGroupFilter = "all";
        buildGroupRoundTabs();
        buildResultRoundOptions();
        buildStandingsOptions();
        buildGroupCompletedOptions();
        renderGroupRoundSummary();
        renderStandings();
        renderGroupCompletedMatches();
        renderPromoted();
      });
    });
  }

  function groupProgress(group) {
    const total = asNumber(group.toplam_mac);
    const completed = asNumber(group.tamamlanan_mac);
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    return { total, completed, percent };
  }

  function groupLeader(group) {
    const rows = group.puan_durumu || [];
    if (!rows.length) return "—";
    return rows[0].oyuncu_adi || rows[0].isim || "—";
  }

  function groupStatusText(group) {
    const progress = groupProgress(group);
    if (!progress.total) return "Maç yok";
    if (progress.completed >= progress.total) return "Tamamlandı";
    if (progress.completed > 0) return "Devam ediyor";
    return "Başlamadı";
  }

  function groupOverviewCards(turn) {
    const groups = turn.gruplar || [];
    if (!groups.length) return "";
    const hint = `<div class="group-overview-hint"><span>${esc(groups.length)} grup</span> Grup kartlarını sağa sola kaydırarak tüm grupları görebilirsiniz.</div>`;
    return `
      ${hint}
      <div class="group-overview-grid is-scrollable" aria-label="Grup özeti">
        ${groups.map((group) => {
          const progress = groupProgress(group);
          const status = groupStatusText(group);
          const statusClass = status === "Tamamlandı" ? "success" : status === "Devam ediyor" ? "warn" : "muted";
          return `
            <article class="group-overview-card">
              <div class="group-overview-head">
                <div>
                  <p class="eyebrow">Grup ${esc(group.grup_no || "—")}</p>
                  <h4>${esc(groupLeader(group))}</h4>
                </div>
                <span class="badge ${esc(statusClass)}">${esc(status)}</span>
              </div>
              <div class="group-progress-line" aria-label="${esc(progress.completed)} / ${esc(progress.total)} maç tamamlandı">
                <span style="width: ${esc(progress.percent)}%"></span>
              </div>
              <div class="group-overview-stats">
                <div><span>Maç</span><strong>${esc(progress.completed)} / ${esc(progress.total)}</strong></div>
                <div><span>Oyuncu</span><strong>${esc(group.oyuncu_sayisi || (group.puan_durumu || []).length || 0)}</strong></div>
              </div>
              <div class="group-overview-actions">
                <button type="button" data-group-overview="${esc(group.grup_no)}" data-target-subtab="puan">Puanları Gör</button>
                <button type="button" data-group-overview="${esc(group.grup_no)}" data-target-subtab="maclar">Maçları Gör</button>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

  function bindGroupOverviewActions() {
    $$('[data-group-overview]').forEach((button) => {
      button.addEventListener("click", () => {
        const groupNo = button.dataset.groupOverview;
        const targetSubtab = button.dataset.targetSubtab || "puan";
        state.groupSelectionTouched = true;
        state.standingsFilter = `group:${groupNo}`;
        state.completedGroupFilter = String(groupNo);
        buildStandingsOptions();
        buildGroupCompletedOptions();
        renderStandings();
        renderGroupCompletedMatches();
        setGroupSubtab(targetSubtab);
      });
    });
  }

  function renderGroupRoundSummary() {
    const el = $("#groupRoundSummary");
    if (!el) return;
    const turn = selectedGroupTurn();
    if (!turn) {
      el.innerHTML = `<div class="empty">Henüz grup turu bulunamadı.</div>`;
      return;
    }
    const groups = turn.gruplar || [];
    const totalMatches = groups.reduce((sum, group) => sum + asNumber(group.toplam_mac), 0);
    const completedMatches = groups.reduce((sum, group) => sum + asNumber(group.tamamlanan_mac), 0);
    const promotedCount = (turn.gruptan_cikanlar || []).length;
    const progressPercent = totalMatches > 0 ? Math.min(100, Math.round((completedMatches / totalMatches) * 100)) : 0;
    const activeHint = state.autoSelectedGroup && state.autoSelectedGroup.roundValue === state.selectedGroupRound
      ? `<p class="active-group-hint"><span class="badge success">Aktif tur</span> Açılışta ${esc(groupRoundLabel(turn))} seçildi. Grup puanlarında önce tüm gruplar listelenir; filtreden tek grup seçebilirsiniz.</p>`
      : "";
    el.innerHTML = `
      <article class="round-summary-card professional-round-card">
        <div>
          <p class="eyebrow">Seçili bölüm</p>
          <h3>${esc(groupRoundLabel(turn))}</h3>
          <p class="muted">Grup puanları, maç sonuçları ve tur sonucu bu bölüm altında gösterilir.</p>
          <div class="round-progress-line" aria-label="${esc(completedMatches)} / ${esc(totalMatches)} maç tamamlandı"><span style="width: ${esc(progressPercent)}%"></span></div>
          ${activeHint}
        </div>
        <div class="round-summary-stats">
          <div><span>Grup</span><strong>${esc(groups.length)}</strong></div>
          <div><span>Maç</span><strong>${esc(completedMatches)} / ${esc(totalMatches)}</strong></div>
          <div><span>Çıkan</span><strong>${esc(promotedCount)}</strong></div>
        </div>
      </article>
      ${groupOverviewCards(turn)}
    `;
    bindGroupOverviewActions();
  }

  function latestUpperRoundStatus(player) {
    const turns = state.data.grup_turlari || [];
    if (!turns.length) return "Devam ediyor";
    const latestTurn = [...turns].sort((a, b) => asNumber(a.tur_no) - asNumber(b.tur_no)).slice(-1)[0];
    const promoted = (latestTurn.gruptan_cikanlar || []).find((row) => Number(row.oyuncu_id) === Number(player.oyuncu_id));
    if (promoted) return `Üst tura çıktı • Grup ${promoted.grup_no || "—"}`;
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

  function resetMatchListLimits(prefix = "") {
    Object.keys(state.listLimits || {}).forEach((key) => {
      if (!prefix || key.startsWith(prefix)) delete state.listLimits[key];
    });
  }

  function limitedMatchListHtml(listId, matches, renderer, options = {}) {
    const items = matches || [];
    const total = items.length;
    const initial = Math.max(1, asNumber(options.initialLimit, MATCH_LIST_INITIAL_LIMIT));
    const currentLimit = Math.min(total, Math.max(initial, asNumber(state.listLimits[listId], initial)));
    const visible = items.slice(0, currentLimit);
    const listClass = options.listClass || "match-list";
    const renderType = options.renderType || "";
    const moreText = total > currentLimit
      ? `${total - currentLimit} maç daha var`
      : "";
    return `
      <div class="${esc(listClass)}">${visible.map(renderer).join("")}</div>
      ${total > currentLimit ? `
        <div class="load-more-wrap">
          <button class="load-more-btn" type="button" data-load-more-list="${esc(listId)}" data-load-more-render="${esc(renderType)}">
            Daha fazla göster <span>${esc(moreText)}</span>
          </button>
          <p>${esc(currentLimit)} / ${esc(total)} maç gösteriliyor. Büyük turnuvalarda performans için maçlar parça parça yüklenir.</p>
        </div>
      ` : ""}
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

  function matchMiniList(title, matches, completedOnly = false, options = {}) {
    const filtered = completedOnly ? (matches || []).filter((m) => m.durum === "Tamamlandı") : (matches || []);
    const emptyText = options.emptyText || "Maç yok.";
    const cardClass = options.cardClass || "card";
    const badgeClass = options.badgeClass || "badge muted";
    if (!filtered.length) {
      return `<article class="${esc(cardClass)}"><div class="card-title"><h3>${esc(title)}</h3></div><div class="empty">${esc(emptyText)}</div></article>`;
    }
    return `
      <article class="${esc(cardClass)}">
        <div class="card-title"><h3>${esc(title)}</h3><span class="${esc(badgeClass)}">${filtered.length}</span></div>
        <div class="match-list">${filtered.map((m) => m.durum === "Tamamlandı" ? completedMatchCard(m) : scheduledMatchCard(m, options.matchOptions || {})).join("")}</div>
      </article>
    `;
  }

  function matchHasPlayer(match, playerId) {
    const id = Number(playerId);
    return Number(match.oyuncu1_id) === id || Number(match.oyuncu2_id) === id;
  }

  function playerUpcomingMatches(playerId) {
    const today = localDateISO();
    const tomorrow = addDaysISO(today, 1);
    return (state.data.maclar || [])
      .filter((match) => matchHasPlayer(match, playerId))
      .filter((match) => plannedWaitingMatch(match) && (match.tarih === today || match.tarih === tomorrow))
      .sort((a, b) => sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));
  }

  function playerUpcomingSection(player) {
    const upcoming = playerUpcomingMatches(player.oyuncu_id);
    if (!upcoming.length) return "";
    return matchMiniList("Yaklaşan maçları", upcoming, false, {
      cardClass: "card player-upcoming-card",
      badgeClass: "badge warn",
      matchOptions: { showTable: true, showStatus: false },
    });
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
    const upcoming = playerUpcomingMatches(player.oyuncu_id);
    el.innerHTML = `
      <article class="card player-card player-profile-card">
        <div class="card-title player-profile-title">
          <div>
            <p class="eyebrow">Oyuncu Detayı</p>
            <h2>${esc(player.ad_soyad)}</h2>
            <p class="muted">${esc(latestUpperRoundStatus(player))}</p>
          </div>
        </div>
        <div class="kv-grid player-summary-grid">
          <div class="kv ${upcoming.length ? "highlight-kv" : ""}"><span>Yaklaşan maç</span><strong>${esc(upcoming.length ? `${upcoming.length} maç` : "Yok")}</strong></div>
          <div class="kv"><span>Son grup sırası</span><strong>${esc(latestGroup.grup_no ? `${latestGroup.tur_no}. Tur / Grup ${latestGroup.grup_no} / ${latestGroup.sira}. sıra` : "—")}</strong></div>
          <div class="kv"><span>Galibiyet / Mağlubiyet</span><strong>${esc(summary.galibiyet || 0)} / ${esc(summary.maglubiyet || 0)}</strong></div>
          <div class="kv"><span>Ortalama</span><strong>${esc(formatAverage(latestStats.ortalama || 0))}</strong></div>
        </div>
      </article>
      ${playerUpcomingSection(player)}
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
    if (promotedCount && index >= promotedCount) return "risk";
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

  function destinationText(row) {
    const parts = [];
    if (row.hedef_tur_adi) parts.push(row.hedef_tur_adi);
    if (row.hedef_grup_no !== undefined && row.hedef_grup_no !== null && row.hedef_grup_no !== "") {
      parts.push(`Grup ${row.hedef_grup_no}`);
    }
    return parts.join(" • ") || "—";
  }

  function resultSectionClass(section) {
    const code = section?.kod || "ust_tur";
    if (code === "final") return "result-section final-section";
    if (code === "klasman") return "result-section klasman-section";
    return "result-section upper-section";
  }

  function turnResultMobileCard(row) {
    return `
      <article class="turn-result-card">
        <div class="turn-result-top">
          <div class="standing-rank">${esc(row.sira || "—")}</div>
          <div class="standing-player">
            <strong>${esc(row.oyuncu_adi || "—")}${row.handikap !== undefined ? ` <em>(${esc(row.handikap)})</em>` : ""}</strong>
            <span>Geldiği grup: ${esc(row.grup_no || "—")} • Grup sırası: ${esc(row.grup_sirasi || "—")}</span>
          </div>
        </div>
        <div class="destination-pill">${esc(destinationText(row))}</div>
        <div class="standing-stats">
          <div><span>Puan</span><strong>${esc(row.puan || 0)}</strong></div>
          <div><span>Averaj</span><strong>${esc(row.averaj || 0)}</strong></div>
          <div><span>YS</span><strong>${esc(row.ys1 || 0)} / ${esc(row.ys2 || 0)}</strong></div>
          <div><span>Ort.</span><strong>${esc(formatAverage(row.ortalama || 0))}</strong></div>
        </div>
      </article>
    `;
  }

  function turnResultSection(section) {
    const rows = section?.satirlar || [];
    if (!rows.length) return "";
    return `
      <article class="${resultSectionClass(section)}">
        <div class="result-section-head">
          <div>
            <p class="eyebrow">Tur Sonucu</p>
            <h3>${esc(section.baslik || "Üst Tura Çıkanlar")}</h3>
            ${section.aciklama ? `<p>${esc(section.aciklama)}</p>` : ""}
          </div>
          <span class="badge ${section.kod === "final" ? "success" : section.kod === "klasman" ? "warn" : "muted"}">${esc(rows.length)} oyuncu</span>
        </div>
        <div class="table-scroll result-table-wrap">
          <table class="result-table">
            <thead>
              <tr>
                <th>Sıra</th>
                <th class="name">Oyuncu</th>
                <th>Geldiği Grup</th>
                <th>Grup Sıra</th>
                <th>Puan</th>
                <th>Averaj</th>
                <th>YS</th>
                <th>Ort.</th>
                <th>Devam Edeceği Yer</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td>${esc(row.sira || "—")}</td>
                  <td class="name">${esc(row.oyuncu_adi || "—")}${row.handikap !== undefined ? ` <span class="hcp">(${esc(row.handikap)})</span>` : ""}</td>
                  <td>${esc(row.grup_no || "—")}</td>
                  <td>${esc(row.grup_sirasi || "—")}</td>
                  <td class="points-cell">${esc(row.puan || 0)}</td>
                  <td>${esc(row.averaj || 0)}</td>
                  <td>${esc(row.ys1 || 0)} / ${esc(row.ys2 || 0)}</td>
                  <td>${esc(formatAverage(row.ortalama || 0))}</td>
                  <td>${esc(destinationText(row))}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
        <div class="turn-result-mobile-list">
          ${rows.map(turnResultMobileCard).join("")}
        </div>
      </article>
    `;
  }

  function buildResultRoundOptions() {
    const select = $("#turnResultRoundFilter");
    if (!select) return;
    const turns = state.data?.grup_turlari || [];
    if (!turns.length) {
      select.innerHTML = `<option value="">Tur bulunamadı</option>`;
      state.selectedResultRound = "";
      return;
    }
    syncResultRoundWithActiveGroup(false);
    select.innerHTML = turns.map((turn) => {
      const value = groupRoundValue(turn);
      const groups = asNumber(turn.grup_sayisi || (turn.gruplar || []).length);
      return `<option value="${esc(value)}">${esc(groupRoundLabel(turn))}${groups ? ` • ${esc(groups)} grup` : ""}</option>`;
    }).join("");
    if (!Array.from(select.options).some((option) => option.value === state.selectedResultRound)) {
      state.selectedResultRound = groupRoundValue(turns[0]);
    }
    select.value = state.selectedResultRound;
  }

  function renderTurnResultFilterHint(turn) {
    const hint = $("#turnResultFilterHint");
    if (!hint) return;
    const selectedLabel = turn ? groupRoundLabel(turn) : "—";
    const activeLabel = state.autoSelectedGroup?.roundValue === state.selectedResultRound
      ? state.autoSelectedGroup.label
      : "";
    hint.innerHTML = `
      <div class="turn-result-filter-summary">
        <span class="badge ${state.resultRoundSelectionTouched ? "muted" : "success"}">${state.resultRoundSelectionTouched ? "Manuel seçim" : "Aktif tur"}</span>
        <strong>${esc(selectedLabel)}</strong>
        ${activeLabel && !state.resultRoundSelectionTouched ? `<span>${esc(activeLabel)} üzerinden açıldı.</span>` : `<span>Diğer turları filtreden seçebilirsiniz.</span>`}
      </div>
    `;
  }

  function buildStandingsOptions() {
    const select = $("#standingsFilter");
    if (!select) return;
    const turn = selectedGroupTurn();
    const current = state.standingsFilter || "all";
    if (!turn) {
      select.innerHTML = `<option value="all">Tüm gruplar</option>`;
      state.standingsFilter = "all";
      return;
    }
    const options = [`<option value="all">Tüm gruplar</option>`];
    (turn.gruplar || []).forEach((group) => {
      options.push(`<option value="group:${esc(group.grup_no)}">Grup ${esc(group.grup_no)}</option>`);
    });
    select.innerHTML = options.join("");
    select.value = Array.from(select.options).some((o) => o.value === current) ? current : "all";
    state.standingsFilter = select.value;
  }

  function selectedGroupFilterLabel(turn, filter, suffix = "") {
    if (!turn) return "—";
    if (!filter || filter === "all") return `Tüm Gruplar${suffix}`;
    const groupNo = String(filter).replace("group:", "");
    return `Grup ${groupNo}${suffix}`;
  }

  function sectionStatusRow(options) {
    const title = options.title || "";
    const eyebrow = options.eyebrow || "";
    const description = options.description || "";
    const badge = options.badge || "";
    return `
      <div class="section-status-row">
        <div>
          ${eyebrow ? `<p class="eyebrow">${esc(eyebrow)}</p>` : ""}
          <h3>${esc(title)}</h3>
          ${description ? `<p>${esc(description)}</p>` : ""}
        </div>
        ${badge ? `<span class="badge success">${esc(badge)}</span>` : ""}
      </div>
    `;
  }

  function renderStandings() {
    const turn = selectedGroupTurn();
    const filter = state.standingsFilter || "all";
    const el = $("#groupStandings");
    if (!el) return;
    if (!turn) {
      el.innerHTML = `<div class="empty">Henüz grup turu bulunamadı.</div>`;
      return;
    }

    const promotedIds = promotedIdsForTurn(turn);
    const visibleGroups = (turn.gruplar || []).filter((group) => filter === "all" || filter === `group:${group.grup_no}`);
    const rowCount = visibleGroups.reduce((sum, group) => sum + (group.puan_durumu || []).length, 0);
    const parts = visibleGroups.map((group) => standingsTable(`${groupRoundLabel(turn)} • Grup ${group.grup_no}`, group.puan_durumu || [], {
      promotedIds,
      promotedCount: Number(turn.gruptan_gecen || 0),
    }));
    const intro = sectionStatusRow({
      eyebrow: groupRoundLabel(turn),
      title: selectedGroupFilterLabel(turn, filter, " Puanları"),
      description: filter === "all" ? "Seçili turun tüm grup puan durumları birlikte gösterilir." : "Seçili grubun puan durumu gösterilir.",
      badge: `${rowCount} oyuncu`,
    });
    el.innerHTML = parts.length
      ? `${intro}<div class="standings-stack">${parts.join("")}</div>`
      : `<div class="empty">Bu bölümde grup puan durumu bulunamadı.</div>`;
  }

  function renderPromoted() {
    const turn = selectedResultTurn();
    const el = $("#groupPromotedList");
    if (!el) return;
    renderTurnResultFilterHint(turn);
    if (!turn) {
      el.innerHTML = `<div class="empty">Henüz grup turu bulunamadı.</div>`;
      return;
    }

    const sections = turn.tur_sonucu?.bolumler || [];
    const sectionHtml = sections.map(turnResultSection).filter(Boolean).join("");
    if (sectionHtml) {
      el.innerHTML = `
        <div class="turn-result-intro card">
          <div>
            <p class="eyebrow">${esc(groupRoundLabel(turn))}</p>
            <h3>Tur Sonucu</h3>
            <p>Bu bölümde oyuncuların bir sonraki aşamada nerede devam edeceği ayrı ayrı gösterilir.</p>
          </div>
        </div>
        <div class="turn-result-stack">${sectionHtml}</div>
      `;
      return;
    }

    const rows = promotedRowsForTurn(turn);
    if (!rows.length) {
      el.innerHTML = `<div class="empty">Bu bölümde henüz tur sonucu / üst tura çıkan oyuncu kaydı yok.</div>`;
      return;
    }
    el.innerHTML = `
      <div class="turn-result-intro card">
        <div>
          <p class="eyebrow">${esc(groupRoundLabel(turn))}</p>
          <h3>Tur Sonucu</h3>
          <p>Bu bölümde üst tura çıkan oyuncular gösterilir.</p>
        </div>
      </div>
      ${standingsTable(`${groupRoundLabel(turn)} • Üst Tura Çıkanlar`, rows, { showGroup: true, promotedIds: promotedIdsForTurn(turn) })}
    `;
  }

  function buildGroupCompletedOptions() {
    const select = $("#groupCompletedFilter");
    if (!select) return;
    const turn = selectedGroupTurn();
    const groups = turn ? (turn.gruplar || []) : [];
    select.innerHTML = [`<option value="all">Tüm gruplar</option>`]
      .concat(groups.map((g) => `<option value="${esc(g.grup_no)}">Grup ${esc(g.grup_no)}</option>`))
      .join("");
    if (!Array.from(select.options).some((o) => o.value === state.completedGroupFilter)) state.completedGroupFilter = "all";
    select.value = state.completedGroupFilter;
  }

  function groupMatchesForSelectedTurn() {
    const turn = selectedGroupTurn();
    const matches = [];
    if (!turn) return matches;
    (turn.gruplar || []).forEach((group) => {
      (group.maclar || []).forEach((match) => matches.push(match));
    });
    return matches;
  }

  function renderGroupCompletedMatches() {
    const turn = selectedGroupTurn();
    let matches = groupMatchesForSelectedTurn().filter((match) => match.durum === "Tamamlandı");
    if (state.completedGroupFilter !== "all") {
      matches = matches.filter((m) => String(m.grup_no) === String(state.completedGroupFilter));
    }
    matches.sort((a, b) => sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));
    const groupFilter = state.completedGroupFilter === "all" ? "all" : `group:${state.completedGroupFilter}`;
    const intro = sectionStatusRow({
      eyebrow: turn ? groupRoundLabel(turn) : "Grup Maçları",
      title: selectedGroupFilterLabel(turn, groupFilter, " Maç Sonuçları"),
      description: "Sadece sonucu girilmiş grup maçları tarih ve saat sırasına göre listelenir.",
      badge: `${matches.length} maç`,
    });
    const listId = `group-completed:${state.selectedGroupRound || "all"}:${state.completedGroupFilter || "all"}`;
    $("#groupMatchList").innerHTML = matches.length
      ? `${intro}${limitedMatchListHtml(listId, matches, completedMatchCard, {
          listClass: "match-list group-match-result-list",
          renderType: "group-completed",
        })}`
      : `${intro}<div class="empty">Bu bölümde tamamlanan grup maçı bulunamadı.</div>`;
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


  function eliminationRoundTitle(turn) {
    const no = asNumber(turn?.tur_no, 0);
    const matches = turn?.maclar || [];
    if (matches.length === 1) return "Final";
    if (matches.length === 2) return "Yarı Final";
    if (matches.length === 4) return "Çeyrek Final";
    return no ? `${no}. Eleme Turu` : "Eleme Turu";
  }

  function eliminationRoundStats(turn) {
    const matches = turn?.maclar || [];
    const completed = matches.filter((m) => m.durum === "Tamamlandı").length;
    const planned = matches.filter((m) => m.durum !== "Tamamlandı" && (m.tarih || m.saat || m.masa_no)).length;
    const waiting = matches.length - completed;
    const percent = matches.length ? Math.round((completed / matches.length) * 100) : 0;
    return { total: matches.length, completed, planned, waiting, percent };
  }

  function eliminationRoundStatus(turn) {
    const stats = eliminationRoundStats(turn);
    if (!stats.total) return "Hazırlanıyor";
    if (stats.completed >= stats.total) return "Tamamlandı";
    if (stats.completed > 0 || stats.planned > 0) return "Devam ediyor";
    return "Bekliyor";
  }

  function activeEliminationTurn() {
    const turns = state.data?.eleme_turlari || [];
    if (!turns.length) return null;
    const scored = turns.map((turn) => {
      const matches = turn.maclar || [];
      const activeMatches = matches.filter((m) => m.durum === "Tamamlandı" || m.tarih || m.saat || m.masa_no);
      const latestActivity = (activeMatches.length ? activeMatches : matches)
        .map(activityTimeValue)
        .sort((a, b) => b.localeCompare(a, "tr"))[0] || "0000-00-00 00:00";
      const stats = eliminationRoundStats(turn);
      const hasActivity = stats.completed > 0 || stats.planned > 0;
      return {
        turn,
        score: [hasActivity ? 1 : 0, latestActivity, asNumber(turn.tur_no, 0)],
      };
    });
    scored.sort((a, b) => {
      if (a.score[0] !== b.score[0]) return b.score[0] - a.score[0];
      const dateCompare = String(b.score[1]).localeCompare(String(a.score[1]), "tr");
      if (dateCompare) return dateCompare;
      return b.score[2] - a.score[2];
    });
    return scored[0]?.turn || turns[0] || null;
  }

  function renderEliminationSummary() {
    const el = $("#eliminationSummary");
    if (!el) return;
    const turns = state.data?.eleme_turlari || [];
    if (!turns.length) {
      el.innerHTML = `<div class="empty">Henüz eleme turu oluşturulmadı.</div>`;
      return;
    }

    const activeTurn = activeEliminationTurn();
    const totalMatches = turns.reduce((sum, turn) => sum + eliminationRoundStats(turn).total, 0);
    const completedMatches = turns.reduce((sum, turn) => sum + eliminationRoundStats(turn).completed, 0);
    const plannedMatches = turns.reduce((sum, turn) => sum + eliminationRoundStats(turn).planned, 0);
    const progress = totalMatches ? Math.round((completedMatches / totalMatches) * 100) : 0;

    el.innerHTML = `
      <article class="elimination-overview card">
        <div>
          <p class="eyebrow">Eleme Akışı</p>
          <h3>${esc(activeTurn ? `${eliminationRoundTitle(activeTurn)} aktif görünüyor` : "Eleme turları")}</h3>
          <p>Eleme maçları tur tur takip edilir; chart görünümünden tüm akış tek ekranda incelenebilir.</p>
          <div class="progress-line"><span style="width:${progress}%"></span></div>
        </div>
        <div class="elimination-overview-stats">
          <div><span>Tur</span><strong>${esc(turns.length)}</strong></div>
          <div><span>Maç</span><strong>${esc(completedMatches)} / ${esc(totalMatches)}</strong></div>
          <div><span>Planlı</span><strong>${esc(plannedMatches)}</strong></div>
        </div>
      </article>
      <div class="elimination-round-strip ${turns.length >= 7 ? "compact-scroll" : ""}" aria-label="Eleme tur özetleri">
        ${turns.map((turn) => {
          const stats = eliminationRoundStats(turn);
          const active = activeTurn && String(activeTurn.tur_no) === String(turn.tur_no);
          return `
            <button class="elimination-round-card ${active ? "active" : ""}" type="button" data-elimination-round="${esc(turn.tur_no)}">
              <span class="elimination-round-label">${esc(eliminationRoundTitle(turn))}</span>
              <strong>${esc(stats.completed)} / ${esc(stats.total)}</strong>
              <em>${esc(eliminationRoundStatus(turn))}</em>
              <span class="mini-progress"><i style="width:${stats.percent}%"></i></span>
            </button>
          `;
        }).join("")}
      </div>
    `;

    $$(".elimination-round-card[data-elimination-round]").forEach((button) => {
      button.addEventListener("click", () => {
        state.eliminationRoundFilter = button.dataset.eliminationRound || "all";
        buildEliminationRoundOptions();
        renderElimination();
        document.getElementById("eliminationList")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function renderElimination() {
    let matches = allEliminationMatches();
    if (state.eliminationStatusFilter === "waiting") matches = matches.filter((m) => m.durum !== "Tamamlandı");
    if (state.eliminationStatusFilter === "completed") matches = matches.filter((m) => m.durum === "Tamamlandı");
    if (state.eliminationRoundFilter !== "all") matches = matches.filter((m) => String(m.tur_no) === String(state.eliminationRoundFilter));
    matches.sort((a, b) => Number(a.tur_no || 0) - Number(b.tur_no || 0) || asNumber(a.chart_mac_no || a.sira) - asNumber(b.chart_mac_no || b.sira) || sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));

    const selectedTurn = state.eliminationRoundFilter === "all"
      ? null
      : (state.data.eleme_turlari || []).find((turn) => String(turn.tur_no) === String(state.eliminationRoundFilter));
    const completed = matches.filter((m) => m.durum === "Tamamlandı").length;
    const waiting = matches.length - completed;
    const listTitle = selectedTurn ? eliminationRoundTitle(selectedTurn) : "Tüm eleme maçları";
    const filterLabel = state.eliminationStatusFilter === "completed"
      ? "sonuçlanan"
      : state.eliminationStatusFilter === "waiting"
        ? "sonuç bekleyen"
        : "tüm";

    $("#eliminationList").innerHTML = `
      <article class="elimination-list-head card">
        <div>
          <p class="eyebrow">Maç Listesi</p>
          <h3>${esc(listTitle)}</h3>
          <p>${esc(matches.length)} ${esc(filterLabel)} maç listeleniyor. Sonuçlanan: ${esc(completed)} • Bekleyen: ${esc(waiting)}</p>
        </div>
      </article>
      ${matches.length
        ? limitedMatchListHtml(
            `elimination:${state.eliminationStatusFilter || "all"}:${state.eliminationRoundFilter || "all"}`,
            matches,
            (m) => m.durum === "Tamamlandı" ? completedMatchCard(m) : scheduledMatchCard(m),
            { listClass: "match-list elimination-match-list", renderType: "elimination" }
          )
        : `<div class="empty">Bu filtrede eleme maçı bulunamadı.</div>`}
    `;
  }

  function plannedWaitingMatch(match) {
    return match.durum !== "Tamamlandı" && Boolean(match.tarih) && Boolean(match.saat);
  }

  function renderUpcoming() {
    const today = localDateISO();
    const tomorrow = addDaysISO(today, 1);
    const matches = (state.data.maclar || [])
      .filter((match) => plannedWaitingMatch(match) && (match.tarih === today || match.tarih === tomorrow))
      .sort((a, b) => sortTimeValue(a).localeCompare(sortTimeValue(b), "tr"));

    const subtitle = $("#upcomingSubtitle");
    if (subtitle) {
      subtitle.textContent = matches.length
        ? `Bugün ve yarın için sonuç bekleyen ${matches.length} planlı maç tarih sırasına göre listeleniyor.`
        : "Bugün ve yarın için sonuç bekleyen planlı maç bulunmuyor.";
    }

    $("#upcomingMatches").innerHTML = matches.length
      ? limitedMatchListHtml(
          "upcoming:today-tomorrow",
          matches,
          (m) => scheduledMatchCard(m, { showTable: true, showStatus: false }),
          { listClass: "match-list upcoming-flat-list", renderType: "upcoming" }
        )
      : `<div class="empty">Bugün veya yarın için sonuç bekleyen planlı maç yok.</div>`;
  }

  function chartStatus(match) {
    if (match.durum === "Tamamlandı") return "Sonuçlandı";
    if (match.tarih || match.saat) return "Planlandı";
    return "Bekliyor";
  }

  function matchSlotNo(match, fallbackIndex) {
    return asNumber(match.slot_index || match.chart_mac_no || match.sira || match.mac_no || fallbackIndex, fallbackIndex);
  }

  function nextPowerOfTwo(value) {
    let n = 1;
    const target = Math.max(1, asNumber(value, 1));
    while (n < target) n *= 2;
    return n;
  }

  function chartNodeName(node, fallback) {
    if (!node) return fallback;
    return node.oyuncu_adi || node.label || node.etiket || fallback;
  }

  function chartNodeId(node) {
    return node?.oyuncu_id || node?.id || "";
  }

  function chartNodeHcp(node) {
    return node?.handikap ?? node?.hcp ?? null;
  }

  function eliminationMatchMapBySlot() {
    const map = new Map();
    (state.data.eleme_turlari || []).forEach((turn) => {
      const turNo = Math.max(1, asNumber(turn.tur_no, 1));
      (turn.maclar || []).forEach((match, index) => {
        const slot = matchSlotNo(match, index + 1);
        map.set(`${turNo}:${slot}`, { ...match, tur_no: match.tur_no || turNo, chart_mac_no: slot, mac_no: slot });
      });
    });
    return map;
  }

  function enrichLockedChartMatch(baseMatch, actualMatch) {
    if (!actualMatch) return baseMatch;
    return {
      ...baseMatch,
      id: actualMatch.id ?? baseMatch.id,
      durum: actualMatch.durum || baseMatch.durum,
      tarih: actualMatch.tarih || baseMatch.tarih || "",
      saat: actualMatch.saat || baseMatch.saat || "",
      masa_no: actualMatch.masa_no ?? baseMatch.masa_no ?? "",
      skor: actualMatch.skor || baseMatch.skor || "",
      kazanan_id: actualMatch.kazanan_id || baseMatch.kazanan_id || "",
      kazanan_adi: actualMatch.kazanan_adi || baseMatch.kazanan_adi || "",
      oyuncu1_id: actualMatch.oyuncu1_id || baseMatch.oyuncu1_id,
      oyuncu1_adi: actualMatch.oyuncu1_adi || baseMatch.oyuncu1_adi,
      oyuncu1_handikap: actualMatch.oyuncu1_handikap ?? baseMatch.oyuncu1_handikap,
      oyuncu1_istaka: actualMatch.oyuncu1_istaka ?? baseMatch.oyuncu1_istaka,
      oyuncu1_sayi: actualMatch.oyuncu1_sayi ?? baseMatch.oyuncu1_sayi,
      oyuncu1_ys1: actualMatch.oyuncu1_ys1 ?? baseMatch.oyuncu1_ys1,
      oyuncu1_ys2: actualMatch.oyuncu1_ys2 ?? baseMatch.oyuncu1_ys2,
      oyuncu2_id: actualMatch.oyuncu2_id || baseMatch.oyuncu2_id,
      oyuncu2_adi: actualMatch.oyuncu2_adi || baseMatch.oyuncu2_adi,
      oyuncu2_handikap: actualMatch.oyuncu2_handikap ?? baseMatch.oyuncu2_handikap,
      oyuncu2_istaka: actualMatch.oyuncu2_istaka ?? baseMatch.oyuncu2_istaka,
      oyuncu2_sayi: actualMatch.oyuncu2_sayi ?? baseMatch.oyuncu2_sayi,
      oyuncu2_ys1: actualMatch.oyuncu2_ys1 ?? baseMatch.oyuncu2_ys1,
      oyuncu2_ys2: actualMatch.oyuncu2_ys2 ?? baseMatch.oyuncu2_ys2,
    };
  }

  function lockedChartTurns() {
    const chart = state.data.eleme_charti || {};
    const sourceTurns = [];
    if (Array.isArray(chart.turlar)) sourceTurns.push(chart.turlar);
    if (Array.isArray(chart.sol_turlar)) sourceTurns.push(chart.sol_turlar);
    if (Array.isArray(chart.sag_turlar)) sourceTurns.push(chart.sag_turlar);
    if (!sourceTurns.length) return null;

    const publishedMatchesBySlot = eliminationMatchMapBySlot();
    const byRound = new Map();
    sourceTurns.forEach((turns) => {
      turns.forEach((turn) => {
        const turNo = Math.max(1, asNumber(turn.tur_no, 1));
        const existing = byRound.get(turNo) || [];
        (turn.maclar || []).forEach((match) => {
          const left = match.sol || {};
          const right = match.sag || {};
          const slotNo = asNumber(match.mac_no || match.chart_mac_no, existing.length + 1);
          const baseMatch = {
            tur_no: turNo,
            chart_mac_no: slotNo,
            mac_no: slotNo,
            durum: match.durum || (match.kazanan_id ? "Tamamlandı" : "Bekliyor"),
            skor: match.skor || "",
            kazanan_id: match.kazanan_id || "",
            kazanan_adi: match.kazanan_adi || "",
            oyuncu1_id: chartNodeId(left),
            oyuncu1_adi: chartNodeName(left, turNo <= 1 ? "Oyuncu bekleniyor" : "Kazanan bekleniyor"),
            oyuncu1_handikap: chartNodeHcp(left),
            oyuncu2_id: chartNodeId(right),
            oyuncu2_adi: chartNodeName(right, turNo <= 1 ? "Oyuncu bekleniyor" : "Kazanan bekleniyor"),
            oyuncu2_handikap: chartNodeHcp(right),
          };
          existing.push(enrichLockedChartMatch(baseMatch, publishedMatchesBySlot.get(`${turNo}:${slotNo}`)));
        });
        byRound.set(turNo, existing);
      });
    });

    if (!byRound.size) return null;
    const rounds = [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([turNo, matches]) => ({
        tur_no: turNo,
        matches: matches
          .sort((a, b) => asNumber(a.mac_no, 0) - asNumber(b.mac_no, 0))
          .map((match, index) => ({ ...match, slot_index: index + 1 })),
      }));
    return rounds;
  }

  function buildBracketRounds() {
    const lockedRounds = lockedChartTurns();
    if (lockedRounds) {
      const firstCount = Math.max(1, lockedRounds[0]?.matches?.length || 1);
      const baseSlots = nextPowerOfTwo(firstCount);
      return {
        rounds: lockedRounds.map((round) => ({
          ...round,
          span: Math.max(1, Math.floor(baseSlots / Math.max(1, round.matches.length))),
        })),
        baseSlots,
      };
    }

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

  function chartScoreForPlayer(match, playerNo) {
    if (match.durum !== "Tamamlandı") return "";
    const rawScore = match[`oyuncu${playerNo}_sayi`];
    if (rawScore !== undefined && rawScore !== null && rawScore !== "") return asNumber(rawScore);
    const parts = String(match.skor || "").match(/(\d+)\s*[-:]\s*(\d+)/);
    if (!parts) return "";
    return playerNo === 1 ? parts[1] : parts[2];
  }

  function chartPlayerLine(match, playerNo) {
    const name = match[`oyuncu${playerNo}_adi`] || chartPlaceholderText(match, playerNo);
    const hcp = match[`oyuncu${playerNo}_handikap`];
    const score = chartScoreForPlayer(match, playerNo);
    const playerId = match[`oyuncu${playerNo}_id`];
    const isWinner = playerId && Number(match.kazanan_id) === Number(playerId);
    const isPlaceholder = !match[`oyuncu${playerNo}_adi`] || name.includes("bekleniyor");
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
    const scale = Math.min(5, Math.max(0.08, nextScale));
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
    viewport.addEventListener("wheel", (event) => {
      if (!$("#chartOverlay")?.classList.contains("open")) return;
      const rect = viewport.getBoundingClientRect();
      const direction = event.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? 1.12 : 0.89;
      setChartScale((state.chartScale || 1) * factor, {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      event.preventDefault();
    }, { passive: false });
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

  async function clearLegacyStaticCaches() {
    if (!("caches" in window)) return;
    try {
      const version = "20260717115812118762";
      const marker = `turnuva-cache-migrated-${version}`;
      if (window.localStorage?.getItem(marker) === "1") return;
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith("turnuva-sonuclari-") && !key.endsWith(version))
          .map((key) => caches.delete(key))
      );
      window.localStorage?.setItem(marker, "1");
    } catch (_) {}
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;
    try {
      const registration = await navigator.serviceWorker.register("service-worker.js?v=20260717115812118762");
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (registerServiceWorker._reloaded) return;
        registerServiceWorker._reloaded = true;
        window.location.reload();
      });
    } catch (_) {}
  }

  function bindEvents() {
    bindChartPan();
    $$(".nav-item").forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
    $$(".sub-tab").forEach((button) => button.addEventListener("click", () => setGroupSubtab(button.dataset.groupSubtab)));
    $("#playerSearch")?.addEventListener("input", renderSearch);
    $("#standingsFilter")?.addEventListener("change", (event) => {
      state.groupSelectionTouched = true;
      state.autoSelectedGroup = null;
      state.standingsFilter = event.target.value;
      renderStandings();
    });
    $("#groupCompletedFilter")?.addEventListener("change", (event) => {
      state.groupSelectionTouched = true;
      state.autoSelectedGroup = null;
      state.completedGroupFilter = event.target.value;
      resetMatchListLimits("group-completed:");
      renderGroupCompletedMatches();
    });
    $("#turnResultRoundFilter")?.addEventListener("change", (event) => {
      state.resultRoundSelectionTouched = true;
      state.selectedResultRound = event.target.value;
      buildResultRoundOptions();
      renderPromoted();
    });
    $("#eliminationStatusFilter")?.addEventListener("change", (event) => {
      state.eliminationStatusFilter = event.target.value;
      resetMatchListLimits("elimination:");
      renderElimination();
    });
    $("#eliminationRoundFilter")?.addEventListener("change", (event) => {
      state.eliminationRoundFilter = event.target.value;
      resetMatchListLimits("elimination:");
      renderElimination();
    });
    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-load-more-list]");
      if (!button) return;
      const listId = button.dataset.loadMoreList || "";
      if (!listId) return;
      state.listLimits[listId] = asNumber(state.listLimits[listId], MATCH_LIST_INITIAL_LIMIT) + MATCH_LIST_MORE_STEP;
      const renderType = button.dataset.loadMoreRender || "";
      if (renderType === "group-completed") renderGroupCompletedMatches();
      else if (renderType === "elimination") renderElimination();
      else if (renderType === "upcoming") renderUpcoming();
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
    applyLatestActiveGroupSelection(true);
    syncResultRoundWithActiveGroup(true);
    buildGroupRoundTabs();
    buildResultRoundOptions();
    buildStandingsOptions();
    buildGroupCompletedOptions();
    buildEliminationRoundOptions();
    renderEliminationSummary();
    renderSearch();
    renderGroupRoundSummary();
    renderStandings();
    renderGroupCompletedMatches();
    renderPromoted();
    renderElimination();
    renderUpcoming();
    setGroupSubtab(state.groupSubtab || "puan");
  }

  async function init() {
    bindEvents();
    try {
      state.data = await loadData();
      renderAll();
      await clearLegacyStaticCaches();
      await registerServiceWorker();
    } catch (error) {
      $("#tournamentMeta").textContent = "Veri yüklenemedi";
      $("#summaryCards").innerHTML = "";
      $("#playerDetail").innerHTML = `<div class="empty">${esc(error.message || error)}<br>Yayınla butonuyla veriyi yeniden oluşturun.</div>`;
      toast("Veri yüklenemedi");
    }
  }

  init();
})();

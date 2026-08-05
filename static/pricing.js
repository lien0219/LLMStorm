"use strict";

import { fetchPricing } from "./api.js";

const $ = (selector) => document.querySelector(selector);
const ITEMS = [
  { key: "input", label: "priceInput", input: "#relay-price-input" },
  { key: "output", label: "priceOutput", input: "#relay-price-output" },
  { key: "cacheWrite", label: "priceCacheWrite", input: "#relay-price-cache-write" },
  { key: "cacheRead", label: "priceCacheRead", input: "#relay-price-cache-read" }
];

function numericValue(input) {
  if (!input || input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function money(value, digits = 4) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: digits })}`;
}

function costMoney(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  const digits = value < 0.01 ? 6 : 4;
  return `$${value.toFixed(digits)}`;
}

function formatDate(value, locale) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "zh" ? "zh-CN" : "en-GB", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
  });
}

export function createPricingComparison({ t, getLocale }) {
  let currentKey = "";
  let currentProvider = "";
  let currentModel = "";
  let official = null;
  let usage = null;
  let relayTiers = [];
  let requestId = 0;
  const savedPricing = new Map();

  function relayPrices() {
    return Object.fromEntries(ITEMS.map((item) => [item.key, numericValue($(item.input))]));
  }

  function saveCurrent() {
    if (!currentKey) return;
    savedPricing.set(currentKey, {
      prices: relayPrices(),
      tiers: relayTiers.map((tier) => ({ ...tier, prices: { ...tier.prices } }))
    });
  }

  function restoreCurrent() {
    const saved = savedPricing.get(currentKey) || {};
    const prices = saved.prices || {};
    relayTiers = (saved.tiers || []).map((tier) => ({ ...tier, prices: { ...tier.prices } }));
    for (const item of ITEMS) {
      $(item.input).value = prices[item.key] == null ? "" : String(prices[item.key]);
    }
    renderTierList();
    renderTierSelector();
  }

  function selectedTierIndex() {
    const value = $("#pricing-tier-view").value;
    return value.startsWith("tier-") ? Number(value.slice(5)) : -1;
  }

  function selectedRelayPrices() {
    const index = selectedTierIndex();
    return index >= 0 && relayTiers[index] ? relayTiers[index].prices : relayPrices();
  }

  function selectedOfficialPrices() {
    if (!official?.found) return null;
    const index = selectedTierIndex();
    if (index < 0 || !relayTiers[index]) return official.prices;
    const minimum = Number(relayTiers[index].minTokens || 0);
    const matching = [...(official.tiers || [])]
      .filter((tier) => Number(tier.minTokens || 0) <= minimum)
      .sort((left, right) => Number(right.minTokens) - Number(left.minTokens))[0];
    return matching?.prices || official.prices;
  }

  function effectiveOfficialPrice(prices, key) {
    if (!prices) return null;
    if (key === "cacheWrite" && prices.cacheWrite == null && currentProvider === "openai") {
      return prices.input ?? null;
    }
    return prices[key] ?? null;
  }

  function tierLabel(tier, index) {
    const minimum = tier.minTokens === "" ? "0" : tier.minTokens;
    const maximum = tier.maxTokens === "" ? "∞" : tier.maxTokens;
    return t("pricingTierLabel", { index: index + 1, min: minimum, max: maximum });
  }

  function renderTierSelector() {
    const select = $("#pricing-tier-view");
    const oldValue = select.value;
    select.replaceChildren();
    const base = document.createElement("option");
    base.value = "base";
    base.textContent = t("defaultPricingTier");
    select.appendChild(base);
    relayTiers.forEach((tier, index) => {
      const option = document.createElement("option");
      option.value = `tier-${index}`;
      option.textContent = tierLabel(tier, index);
      select.appendChild(option);
    });
    select.value = [...select.options].some((option) => option.value === oldValue)
      ? oldValue : "base";
  }

  function renderTierList() {
    const list = $("#relay-tier-list");
    list.replaceChildren();
    relayTiers.forEach((tier, index) => {
      const card = document.createElement("div");
      card.className = "relay-tier-card";
      const range = document.createElement("div");
      range.className = "relay-tier-range";
      const title = document.createElement("strong");
      title.textContent = t("pricingTierNumber", { index: index + 1 });
      const minimum = document.createElement("input");
      minimum.type = "number";
      minimum.min = "0";
      minimum.placeholder = t("tierMinimum");
      minimum.value = tier.minTokens;
      const divider = document.createElement("span");
      divider.textContent = "→";
      const maximum = document.createElement("input");
      maximum.type = "number";
      maximum.min = "0";
      maximum.placeholder = t("tierMaximum");
      maximum.value = tier.maxTokens;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", t("removePricingTier"));
      remove.textContent = "×";
      minimum.addEventListener("input", () => {
        tier.minTokens = minimum.value;
        saveCurrent();
        renderTierSelector();
        renderTable();
      });
      maximum.addEventListener("input", () => {
        tier.maxTokens = maximum.value;
        saveCurrent();
        renderTierSelector();
      });
      remove.addEventListener("click", () => {
        relayTiers.splice(index, 1);
        saveCurrent();
        renderTierList();
        renderTierSelector();
        renderTable();
      });
      range.append(title, minimum, divider, maximum, remove);
      const priceGrid = document.createElement("div");
      priceGrid.className = "relay-tier-prices";
      for (const item of ITEMS) {
        const label = document.createElement("label");
        const name = document.createElement("span");
        name.textContent = t(item.label);
        const input = document.createElement("input");
        input.type = "number";
        input.min = "0";
        input.step = "any";
        input.placeholder = "$ / M";
        input.value = tier.prices[item.key] == null ? "" : String(tier.prices[item.key]);
        input.addEventListener("input", () => {
          tier.prices[item.key] = numericValue(input);
          saveCurrent();
          renderTable();
        });
        label.append(name, input);
        priceGrid.appendChild(label);
      }
      card.append(range, priceGrid);
      list.appendChild(card);
    });
  }

  function setStatus(type, key) {
    const status = $("#pricing-status");
    status.className = `status-badge ${type}`;
    status.replaceChildren();
    const dot = document.createElement("span");
    const label = document.createElement("b");
    label.textContent = t(key);
    status.append(dot, label);
  }

  function renderSource() {
    const source = $("#pricing-source-text");
    const link = $("#official-price-link");
    link.classList.toggle("is-hidden", !official?.officialUrl);
    if (official?.officialUrl) link.href = official.officialUrl;
    if (!currentModel) {
      source.textContent = t("pricingSelectModel");
    } else if (!official?.found) {
      source.textContent = t("pricingUnavailable");
    } else if (official.status === "live") {
      const cacheHours = Number(official.cacheTtlSeconds) / 3600;
      source.textContent = t("pricingLiveSource", {
        time: formatDate(official.fetchedAt, getLocale()),
        hours: Number.isFinite(cacheHours) ? Number(cacheHours.toFixed(1)) : "—"
      });
    } else {
      source.textContent = t("pricingSnapshotSource", { date: official.verifiedAt || "—" });
    }
  }

  function renderTable() {
    const body = $("#pricing-compare-body");
    body.replaceChildren();
    const relay = selectedRelayPrices();
    const officialPrices = selectedOfficialPrices();
    const derivedCacheWrite = currentProvider === "openai"
      && officialPrices?.cacheWrite == null
      && officialPrices?.input != null;
    $("#pricing-derived-note").classList.toggle("is-hidden", !derivedCacheWrite);
    for (const item of ITEMS) {
      const relayValue = relay[item.key];
      const officialValue = effectiveOfficialPrice(officialPrices, item.key);
      const row = document.createElement("tr");
      const labelCell = document.createElement("td");
      labelCell.textContent = t(item.label);
      const relayCell = document.createElement("td");
      relayCell.textContent = money(relayValue);
      const officialCell = document.createElement("td");
      officialCell.textContent = money(officialValue);
      const deltaCell = document.createElement("td");
      const multipleCell = document.createElement("td");
      if (relayValue == null || officialValue == null) {
        deltaCell.textContent = "—";
        multipleCell.textContent = "—";
      } else {
        const delta = relayValue - officialValue;
        deltaCell.textContent = `${delta > 0 ? "+" : ""}${money(delta)}`;
        deltaCell.className = delta > 0 ? "price-up" : delta < 0 ? "price-down" : "";
        if (officialValue === 0) {
          multipleCell.textContent = relayValue === 0 ? "1.00×" : "∞";
        } else {
          const multiple = relayValue / officialValue;
          multipleCell.textContent = `${multiple.toFixed(2)}×`;
          multipleCell.className = multiple > 1 ? "price-up" : multiple < 1 ? "price-down" : "";
        }
      }
      row.append(labelCell, relayCell, officialCell, deltaCell, multipleCell);
      body.appendChild(row);
    }
    renderUsage();
  }

  function estimateCost(prices) {
    if (!prices || !usage) return null;
    const cachedRead = Number(usage.cacheRead || 0);
    const cachedWrite = Number(usage.cacheWrite || 0);
    const totalInput = Number(usage.input || 0);
    const regularInput = Math.max(0, totalInput - cachedRead - cachedWrite);
    const parts = [
      [regularInput, prices.input],
      [Number(usage.output || 0), prices.output],
      [cachedRead, prices.cacheRead ?? prices.input],
      [cachedWrite, prices.cacheWrite ?? prices.input]
    ];
    if (parts.some(([tokens, price]) => tokens > 0 && price == null)) return null;
    return parts.reduce((total, [tokens, price]) => total + tokens * (price || 0) / 1_000_000, 0);
  }

  function renderUsage() {
    const card = $("#usage-cost-card");
    if (!usage) {
      card.classList.add("is-hidden");
      return;
    }
    card.classList.remove("is-hidden");
    const total = Object.values(usage).reduce((sum, value) => sum + Number(value || 0), 0);
    $("#actual-usage-value").textContent = total > 0
      ? t("usageTokens", { input: usage.input || 0, output: usage.output || 0 })
      : "—";
    $("#relay-estimated-cost").textContent = costMoney(estimateCost(relayPrices()));
    $("#official-estimated-cost").textContent = costMoney(
      official?.found ? estimateCost(official.prices) : null
    );
    const note = $("#usage-cost-note");
    note.textContent = total > 0 ? t("usageCostDisclaimer") : t("usageUnavailable");
  }

  async function setModel(provider, model) {
    const nextProvider = provider || "";
    const nextModel = model || "";
    const nextKey = `${nextProvider}:${nextModel}`;
    if (nextKey === currentKey) return;
    saveCurrent();
    currentProvider = nextProvider;
    currentModel = nextModel;
    currentKey = nextKey;
    official = null;
    usage = null;
    restoreCurrent();
    $("#pricing-model").textContent = currentModel || "—";
    renderSource();
    renderTable();
    if (!currentProvider || !currentModel) {
      setStatus("idle", "pricingWaiting");
      return;
    }

    const ownRequest = ++requestId;
    setStatus("running", "pricingRefreshing");
    $("#pricing-source-text").textContent = t("pricingLoading");
    try {
      const result = await fetchPricing(currentProvider, currentModel);
      if (ownRequest !== requestId) return;
      official = result;
      setStatus(result.found ? "complete" : "idle", result.found ? "pricingReady" : "pricingNoPrice");
    } catch {
      if (ownRequest !== requestId) return;
      official = { found: false };
      setStatus("error", "pricingRefreshFailed");
    }
    renderSource();
    renderTable();
  }

  for (const item of ITEMS) {
    $(item.input).addEventListener("input", () => {
      saveCurrent();
      renderTable();
    });
  }

  $("#use-official-prices").addEventListener("click", () => {
    if (!official?.found) return;
    const destination = selectedTierIndex() >= 0 ? selectedRelayPrices() : null;
    const source = selectedOfficialPrices();
    for (const item of ITEMS) {
      const value = effectiveOfficialPrice(source, item.key);
      if (destination) destination[item.key] = value == null ? null : value;
      else $(item.input).value = value == null ? "" : String(value);
    }
    saveCurrent();
    renderTierList();
    renderTable();
  });

  $("#add-pricing-tier").addEventListener("click", () => {
    relayTiers.push({
      minTokens: "",
      maxTokens: "",
      prices: { input: null, output: null, cacheWrite: null, cacheRead: null }
    });
    saveCurrent();
    renderTierList();
    renderTierSelector();
    $("#pricing-tier-view").value = `tier-${relayTiers.length - 1}`;
    renderTable();
  });
  $("#pricing-tier-view").addEventListener("change", renderTable);

  renderTable();
  renderSource();

  return {
    setModel,
    setUsage(nextUsage) {
      usage = nextUsage || null;
      renderUsage();
    },
    refreshLocale() {
      $("#pricing-model").textContent = currentModel || "—";
      renderTierList();
      renderTierSelector();
      renderSource();
      renderTable();
      if (!currentModel) setStatus("idle", "pricingWaiting");
      else if (!official) setStatus("running", "pricingRefreshing");
      else setStatus(official.found ? "complete" : "idle", official.found ? "pricingReady" : "pricingNoPrice");
    }
  };
}

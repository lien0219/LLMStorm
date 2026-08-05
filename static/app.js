"use strict";

import { fetchBootstrap, streamTest } from "./api.js";
import { getProvider, populateModels, populateProviders, setCatalog } from "./catalog.js";
import { createMonitor } from "./monitor.js";
import { createPricingComparison } from "./pricing.js";
import { createSiteAnalysis } from "./site-analysis.js";

const { t, getLocale } = window.LLMStormI18n;
const $ = (selector) => document.querySelector(selector);

const form = $("#test-form");
const providerSelect = $("#provider");
const modelSelect = $("#model");
const customModel = $("#custom-model");
const modelSelectShell = $("#model-select-shell");
const customModelShell = $("#custom-model-shell");
const concurrencyInput = $("#concurrency");
const concurrencyRange = $("#concurrency-range");
const startButton = $("#start-button");
const pricing = createPricingComparison({ t, getLocale });
const monitor = createMonitor({ t, getLocale });
const siteAnalysis = createSiteAnalysis({
  t,
  getLocale,
  showToast,
  getConfig: () => ({
    url: $("#url").value.trim(),
    provider: providerSelect.value,
    model: selectedModel(),
    insecure: $("#insecure").checked
  })
});

let controller = null;
let catalogReady = false;
let maxAllowedConcurrency = Number(concurrencyInput.max);
let sliderMaximum = Number(concurrencyRange.max);
let successThreshold = 0;
let rampPercentages = [];

function showToast(message, error = false) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", error);
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function setRuntimeText(selector, key, values = {}) {
  const element = typeof selector === "string" ? $(selector) : selector;
  if (!element) return;
  element.dataset.runtimeI18n = key;
  element.dataset.runtimeValues = JSON.stringify(values);
  element.textContent = t(key, values);
}

function refreshRuntimeTexts() {
  document.querySelectorAll("[data-runtime-i18n]").forEach((element) => {
    let values = {};
    try { values = JSON.parse(element.dataset.runtimeValues || "{}"); } catch { /* ignored */ }
    element.textContent = t(element.dataset.runtimeI18n, values);
  });
}

function paintRange(value) {
  const rangeValue = Math.min(sliderMaximum, Math.max(1, Number(value) || 1));
  concurrencyRange.value = String(rangeValue);
  const percentage = ((rangeValue - 1) / Math.max(sliderMaximum - 1, 1)) * 100;
  concurrencyRange.style.setProperty("--range-value", `${percentage}%`);
  concurrencyRange.classList.toggle("at-custom-limit", Number(value) > sliderMaximum);
}

function renderRangeScale() {
  const candidates = [1, 100, 250, sliderMaximum];
  const ticks = [...new Set(candidates.filter((value) => value <= sliderMaximum))];
  const scale = $(".range-scale");
  scale.replaceChildren();
  ticks.forEach((value, index) => {
    const span = document.createElement("span");
    const percentage = ((value - 1) / Math.max(sliderMaximum - 1, 1)) * 100;
    span.style.setProperty("--tick", `${percentage}%`);
    span.textContent = index === ticks.length - 1 && maxAllowedConcurrency > sliderMaximum
      ? `${value}+`
      : String(value);
    if (index === 0) span.classList.add("tick-first");
    if (index === ticks.length - 1) span.classList.add("tick-last");
    scale.appendChild(span);
  });
}

function updateFromRange(value) {
  const safe = Math.min(sliderMaximum, Math.max(1, Math.round(Number(value) || 1)));
  concurrencyInput.value = String(safe);
  paintRange(safe);
}

function updateFromNumber(value, clamp = false) {
  if (value === "") return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return;
  const safe = Math.min(maxAllowedConcurrency, Math.max(1, Math.round(parsed)));
  if (clamp || safe !== parsed) concurrencyInput.value = String(safe);
  paintRange(safe);
}

function refreshPolicyText() {
  setRuntimeText("#concurrency-help", "concurrencyHelp", { max: maxAllowedConcurrency });
  setRuntimeText("#metric-threshold", "successThreshold", { threshold: successThreshold });
  setRuntimeText("#cost-body", "costBodyDynamic", {
    ramp: rampPercentages.map((value) => `${value}%`).join(" → ")
  });
}

function enterCustomModel(focus = true) {
  modelSelectShell.classList.add("is-hidden");
  customModelShell.classList.remove("is-hidden");
  customModel.required = true;
  if (focus) customModel.focus();
}

function leaveCustomModel(clear = true) {
  modelSelectShell.classList.remove("is-hidden");
  customModelShell.classList.add("is-hidden");
  customModel.required = false;
  if (clear) customModel.value = "";
}

function selectedModel() {
  return modelSelect.value === "__custom__" ? customModel.value.trim() : modelSelect.value;
}

function updateUrlPlaceholder() {
  const provider = getProvider(providerSelect.value);
  if (provider) $("#url").placeholder = provider.placeholder;
}

function renderModels(preserveSelection = false) {
  const oldValue = modelSelect.value;
  const oldCustomValue = customModel.value;
  const customActive = !customModelShell.classList.contains("is-hidden");
  populateModels(
    modelSelect,
    providerSelect.value,
    getLocale(),
    t,
    preserveSelection ? oldValue : ""
  );
  if (preserveSelection && customActive) {
    modelSelect.value = "__custom__";
    enterCustomModel(false);
    customModel.value = oldCustomValue;
  } else {
    leaveCustomModel();
  }
  updateUrlPlaceholder();
  pricing.setModel(providerSelect.value, selectedModel());
}

function renderCatalog(preserveSelection = false) {
  const oldProvider = providerSelect.value;
  populateProviders(
    providerSelect,
    getLocale(),
    preserveSelection ? oldProvider : ""
  );
  renderModels(preserveSelection);
}

function setRunning(running) {
  startButton.classList.toggle("running", running);
  form.querySelectorAll("input, select, summary").forEach((element) => {
    element.toggleAttribute("disabled", running);
  });
  startButton.disabled = !running && !catalogReady;
  if (!running && !catalogReady) {
    providerSelect.disabled = true;
    modelSelect.disabled = true;
  }
}

async function startTest() {
  updateFromNumber(concurrencyInput.value || 1, true);
  if (!form.reportValidity()) return;
  const model = selectedModel();
  if (!model) {
    showToast(t("enterModel"), true);
    customModel.focus();
    return;
  }

  monitor.reset();
  setRunning(true);
  monitor.setStatus("running", "statusRunning");
  controller = new AbortController();
  const payload = {
    url: $("#url").value.trim(),
    provider: providerSelect.value,
    apiKey: $("#api-key").value,
    model,
    maxConcurrency: Number(concurrencyInput.value),
    timeout: Number($("#timeout").value),
    maxTokens: Number($("#max-tokens").value),
    prompt: $("#prompt").value,
    insecure: $("#insecure").checked,
    locale: getLocale()
  };

  try {
    void siteAnalysis.run({ quiet: true });
    await streamTest(payload, controller.signal, monitor.handleEvent);
    if (!monitor.hasResult()) throw new Error(t("incompleteStream"));
  } catch (error) {
    if (error.name === "AbortError") {
      monitor.logRaw(t("stoppedLog"), "bad");
      monitor.setStatus("idle", "statusStopped");
      showToast(t("testStoppedToast"));
    } else {
      monitor.logRaw(error.message, "bad");
      monitor.setStatus("error", "statusError");
      showToast(error.message, true);
    }
  } finally {
    controller = null;
    setRunning(false);
  }
}

async function loadApplication() {
  try {
    const { config, catalog } = await fetchBootstrap();
    setCatalog(catalog);
    maxAllowedConcurrency = Number(config.maxConcurrency);
    sliderMaximum = Number(config.quickConcurrencyMax);
    successThreshold = Number(config.successThreshold);
    rampPercentages = config.rampPercentages;
    const maxOutputTokens = Number(config.maxOutputTokens);
    if (
      !Number.isInteger(maxAllowedConcurrency)
      || !Number.isInteger(sliderMaximum)
      || maxAllowedConcurrency < 1
      || sliderMaximum < 1
      || sliderMaximum > maxAllowedConcurrency
      || !Number.isFinite(successThreshold)
      || successThreshold <= 0
      || successThreshold > 100
      || !Array.isArray(rampPercentages)
      || rampPercentages.some((value) => !Number.isFinite(value) || value <= 0 || value >= 100)
      || !Number.isInteger(maxOutputTokens)
      || maxOutputTokens < 1
    ) {
      throw new Error(t("invalidServerConfig"));
    }
    concurrencyInput.max = String(maxAllowedConcurrency);
    concurrencyRange.max = String(sliderMaximum);
    $("#max-tokens").max = String(maxOutputTokens);
    if (Number(concurrencyInput.value) > maxAllowedConcurrency) {
      concurrencyInput.value = String(maxAllowedConcurrency);
      showToast(t("maxAdjusted", { max: maxAllowedConcurrency }));
    }
    catalogReady = true;
    providerSelect.disabled = false;
    modelSelect.disabled = false;
    startButton.disabled = false;
    siteAnalysis.setEnabled(true);
    monitor.setSuccessThreshold(successThreshold);
    renderCatalog();
    renderRangeScale();
    refreshPolicyText();
    updateFromNumber(concurrencyInput.value, true);
  } catch (error) {
    catalogReady = false;
    setRunning(false);
    showToast(t("catalogUnavailable", { error: error.message }), true);
  }
}

providerSelect.addEventListener("change", () => renderModels());
modelSelect.addEventListener("change", () => {
  if (modelSelect.value === "__custom__") enterCustomModel();
  pricing.setModel(providerSelect.value, selectedModel());
});
$("#back-to-models").addEventListener("click", () => {
  modelSelect.selectedIndex = 0;
  leaveCustomModel();
  pricing.setModel(providerSelect.value, selectedModel());
});
let customPricingTimer = null;
customModel.addEventListener("input", () => {
  clearTimeout(customPricingTimer);
  customPricingTimer = setTimeout(
    () => pricing.setModel(providerSelect.value, selectedModel()),
    350
  );
});
concurrencyRange.addEventListener("input", (event) => updateFromRange(event.target.value));
concurrencyInput.addEventListener("input", (event) => updateFromNumber(event.target.value));
concurrencyInput.addEventListener("blur", (event) => updateFromNumber(event.target.value || 1, true));
$("#toggle-key").addEventListener("click", () => {
  const keyInput = $("#api-key");
  const visible = keyInput.type === "text";
  keyInput.type = visible ? "password" : "text";
  $("#toggle-key").classList.toggle("visible", !visible);
  $("#toggle-key").setAttribute("aria-label", t(visible ? "keyShow" : "keyHide"));
});
$("#copy-output").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(monitor.outputText());
    showToast(t("copied"));
  } catch {
    showToast(t("copyFailed"), true);
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (controller) controller.abort();
  else startTest();
});
startButton.addEventListener("click", (event) => {
  if (controller) {
    event.preventDefault();
    controller.abort();
  }
});

window.addEventListener("llmstorm:localechange", () => {
  if (catalogReady) {
    renderCatalog(true);
    refreshPolicyText();
  }
  refreshRuntimeTexts();
  monitor.refreshLocale();
  pricing.refreshLocale();
  siteAnalysis.refreshLocale();
  const keyVisible = $("#api-key").type === "text";
  $("#toggle-key").setAttribute("aria-label", t(keyVisible ? "keyHide" : "keyShow"));
});

window.addEventListener("llmstorm:testcomplete", (event) => {
  pricing.setUsage(event.detail?.usage);
});

startButton.disabled = true;
renderRangeScale();
updateFromNumber(concurrencyInput.value, true);
loadApplication();

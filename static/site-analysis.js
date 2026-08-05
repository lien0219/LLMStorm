"use strict";

import { fetchSiteAnalysis } from "./api.js";

const $ = (selector) => document.querySelector(selector);

function formatMs(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(0)} ms` : "—";
}

function confidenceKey(value) {
  return value === "high" ? "analysisConfidenceHigh"
    : value === "medium" ? "analysisConfidenceMedium"
      : value === "low" ? "analysisConfidenceLow"
        : "analysisConfidenceNone";
}

export function createSiteAnalysis({ t, getLocale, getConfig, showToast }) {
  let result = null;
  let running = false;
  const button = $("#run-site-analysis");
  const status = $("#analysis-status");

  function setStatus(state, key) {
    status.className = `status-badge ${state}`;
    status.querySelector("b").textContent = t(key);
  }

  function setText(selector, value) {
    $(selector).textContent = value ?? "—";
  }

  function ipScopeKey(scope) {
    const suffix = String(scope || "special").replace(/^[a-z]/, (value) => value.toUpperCase());
    return `analysisIpScope${suffix}`;
  }

  function createIpFact(label, value) {
    const row = document.createElement("div");
    const term = document.createElement("span");
    const detail = document.createElement("strong");
    term.textContent = label;
    detail.textContent = value || "—";
    row.append(term, detail);
    return row;
  }

  function renderIpDetails(details) {
    const list = $("#ip-details-list");
    list.replaceChildren();
    if (!Array.isArray(details) || !details.length) {
      const empty = document.createElement("p");
      empty.textContent = t("analysisNoIpDetails");
      list.appendChild(empty);
      return;
    }
    details.forEach((item) => {
      const card = document.createElement("article");
      const header = document.createElement("header");
      const address = document.createElement("code");
      const type = document.createElement("span");
      address.textContent = item.address || "—";
      type.textContent = `${item.version || "IP"} · ${t(ipScopeKey(item.scope))}`;
      header.append(address, type);

      const facts = document.createElement("div");
      facts.className = "ip-detail-facts";
      const location = [item.flagEmoji, item.country, item.region, item.city].filter(Boolean).join(" ");
      const network = [item.asn, item.isp].filter(Boolean).join(" · ");
      const organization = [item.organization, item.domain].filter(Boolean).join(" · ");
      const coordinates = Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude))
        ? `${Number(item.latitude).toFixed(4)}, ${Number(item.longitude).toFixed(4)}`
        : "—";
      facts.append(
        createIpFact(t("analysisIpLocation"), location),
        createIpFact(t("analysisIpNetwork"), network),
        createIpFact(t("analysisIpOrganization"), organization),
        createIpFact(t("analysisIpReverseDns"), item.reverseDns),
        createIpFact(t("analysisIpCoordinates"), coordinates)
      );

      const flags = Object.entries(item.security || {}).filter(([, enabled]) => enabled);
      if (flags.length) {
        const tags = document.createElement("div");
        tags.className = "ip-security-tags";
        flags.forEach(([key]) => {
          const tag = document.createElement("span");
          tag.textContent = t(`analysisIpFlag${key.replace(/^[a-z]/, (value) => value.toUpperCase())}`);
          tags.appendChild(tag);
        });
        card.append(header, facts, tags);
      } else {
        card.append(header, facts);
      }
      if (item.error) {
        const error = document.createElement("small");
        error.className = "ip-detail-error";
        error.textContent = t("analysisIpLookupUnavailable");
        card.appendChild(error);
      }
      list.appendChild(card);
    });
  }

  function renderQuality(data) {
    const quality = data.quality || {};
    const score = Number(quality.score);
    setText("#quality-score", Number.isFinite(score) ? String(score) : "—");
    setText("#quality-score-label", quality.reachable
      ? t(score >= 90 ? "analysisQualityExcellent" : score >= 75 ? "analysisQualityGood" : score >= 55 ? "analysisQualityFair" : "analysisQualityPoor")
      : t("analysisUnreachable"));
    setText("#quality-dns", formatMs(quality.dnsMs));
    setText("#quality-tcp", formatMs(quality.tcpMs));
    setText("#quality-tls", data.endpoint?.startsWith("https:") ? formatMs(quality.tlsMs) : t("notApplicable"));
    setText("#quality-ttfb", formatMs(quality.ttfbMs));
    setText("#quality-http", quality.httpStatus
      ? `${quality.httpStatus} · ${quality.httpVersion || "HTTP"}`
      : "—");
    const days = quality.certificate?.daysRemaining;
    setText("#quality-certificate", Number.isInteger(days)
      ? t("analysisCertificateDays", { days })
      : t("notApplicable"));
    renderIpDetails(quality.ipDetails);
    const error = $("#quality-error");
    error.textContent = quality.error || "";
    error.classList.toggle("is-hidden", !quality.error);
  }

  function renderRoute(data) {
    const route = data.route || {};
    setText("#route-target", data.host || "—");
    const upstreamLink = $("#route-upstream-link");
    const upstreamText = $("#route-upstream-text");
    if (route.exposedUpstreamUrl) {
      upstreamLink.href = route.exposedUpstreamUrl;
      upstreamLink.textContent = route.exposedUpstreamUrl;
      upstreamLink.classList.remove("is-hidden");
      upstreamText.classList.add("is-hidden");
    } else {
      upstreamLink.removeAttribute("href");
      upstreamLink.classList.add("is-hidden");
      upstreamText.classList.remove("is-hidden");
      upstreamText.textContent = route.suspectedProvider
        ? `${route.suspectedProvider} · ${t(confidenceKey(route.confidence))}`
        : t("analysisCannotConfirm");
    }
    setText("#route-infrastructure", Array.isArray(route.infrastructure) && route.infrastructure.length
      ? route.infrastructure.join(" · ")
      : t("analysisNoSignal"));
    setText("#route-proxy-signals", String(Number(route.proxySignals) || 0));

    const evidenceList = $("#route-evidence");
    evidenceList.replaceChildren();
    if (!Array.isArray(route.evidence) || !route.evidence.length) {
      const empty = document.createElement("li");
      empty.className = "empty-evidence";
      empty.textContent = t("analysisNoEvidence");
      evidenceList.appendChild(empty);
      return;
    }
    route.evidence.forEach((item) => {
      const row = document.createElement("li");
      const name = document.createElement("span");
      const value = document.createElement("code");
      name.textContent = item.name;
      value.textContent = item.value;
      row.append(name, value);
      evidenceList.appendChild(row);
    });
  }

  function render() {
    if (!result) return;
    renderQuality(result);
    renderRoute(result);
  }

  async function run({ quiet = false } = {}) {
    if (running) return;
    const config = getConfig();
    if (!config.url || !config.provider || !config.model) {
      if (!quiet) showToast(t("analysisConfigRequired"), true);
      return;
    }
    running = true;
    button.disabled = true;
    button.classList.add("running");
    setStatus("running", "analysisRunning");
    try {
      result = await fetchSiteAnalysis({ ...config, locale: getLocale() });
      render();
      setStatus(result.quality?.reachable ? "complete" : "error", result.quality?.reachable ? "analysisReady" : "analysisPartial");
    } catch (error) {
      setStatus("error", "analysisFailed");
      if (!quiet) showToast(error.message, true);
    } finally {
      running = false;
      button.disabled = false;
      button.classList.remove("running");
    }
  }

  button.addEventListener("click", () => run());
  return {
    run,
    refreshLocale() {
      if (result) render();
      if (!running && !result) setStatus("idle", "analysisWaiting");
    },
    setEnabled(enabled) { button.disabled = !enabled; }
  };
}

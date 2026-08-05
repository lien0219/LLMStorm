"use strict";

const $ = (selector) => document.querySelector(selector);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function createMonitor({ t, getLocale }) {
  let expectedStageCount = 0;
  let completedStages = [];
  let logEntries = [];
  let rawResult = null;
  let successThreshold = Number.POSITIVE_INFINITY;
  let statusType = "idle";
  let statusKey = "statusWaiting";

  const outputLog = $("#output-log");
  const statusBadge = $("#status-badge");

  function setRuntimeText(selector, key, values = {}) {
    const element = $(selector);
    if (!element) return;
    element.dataset.runtimeI18n = key;
    element.dataset.runtimeValues = JSON.stringify(values);
    element.textContent = t(key, values);
  }

  function refreshRuntimeTexts() {
    document.querySelectorAll("#test-state [data-runtime-i18n]").forEach((element) => {
      let values = {};
      try { values = JSON.parse(element.dataset.runtimeValues || "{}"); } catch { /* ignored */ }
      element.textContent = t(element.dataset.runtimeI18n, values);
    });
  }

  function setStatus(type, key) {
    statusType = type;
    statusKey = key;
    statusBadge.className = `status-badge ${type}`;
    statusBadge.replaceChildren();
    const dot = document.createElement("span");
    const label = document.createElement("b");
    label.textContent = t(key);
    statusBadge.append(dot, label);
  }

  function formatTime(date) {
    return date.toLocaleTimeString(getLocale() === "zh" ? "zh-CN" : "en-GB", { hour12: false });
  }

  function renderLogs() {
    outputLog.replaceChildren();
    for (const entry of logEntries) {
      const line = document.createElement("div");
      const time = document.createElement("span");
      const message = document.createElement("span");
      time.className = "log-time";
      time.textContent = `[${formatTime(entry.time)}] `;
      message.className = entry.kind ? `log-${entry.kind}` : "";
      message.textContent = entry.raw ?? t(entry.key, entry.values);
      line.append(time, message);
      outputLog.appendChild(line);
    }
    outputLog.scrollTop = outputLog.scrollHeight;
  }

  function logKey(key, values = {}, kind = "") {
    logEntries.push({ key, values, kind, time: new Date() });
    renderLogs();
  }

  function logRaw(raw, kind = "") {
    logEntries.push({ raw, kind, time: new Date() });
    renderLogs();
  }

  function seconds(value) {
    return value == null ? "—" : `${value.toFixed(value < 10 ? 2 : 1)}s`;
  }

  function rate(value) {
    return value == null ? "—" : value.toFixed(2);
  }

  function renderStageTable() {
    const body = $("#stage-body");
    body.replaceChildren();
    if (!completedStages.length) {
      const row = document.createElement("tr");
      row.className = "placeholder-row";
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = t("waitingStage");
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    for (const stage of completedStages) {
      const passed = stage.successRate >= successThreshold;
      const row = document.createElement("tr");
      const values = [
        stage.concurrency,
        `${stage.successRate.toFixed(1)}%`,
        `${rate(stage.throughput)} req/s`,
        seconds(stage.p95Latency)
      ];
      for (const value of values) {
        const cell = document.createElement("td");
        cell.textContent = String(value);
        row.appendChild(cell);
      }
      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `stage-status ${passed ? "pass" : "fail"}`;
      badge.innerHTML = `<i></i>${escapeHtml(t(passed ? "passed" : "limited"))}`;
      statusCell.appendChild(badge);
      row.appendChild(statusCell);
      body.appendChild(row);
    }
  }

  function addStage(stage) {
    completedStages.push(stage);
    renderStageTable();
    const passed = stage.successRate >= successThreshold;
    logKey("stageLog", {
      concurrency: stage.concurrency,
      success: stage.success,
      requests: stage.requests,
      throughput: rate(stage.throughput),
      latency: seconds(stage.p95Latency)
    }, passed ? "good" : "bad");
    for (const failure of stage.failures || []) {
      logRaw(`#${failure.index} [${failure.status}] ${failure.error}`, "bad");
    }
  }

  function renderSummary(summary, addLogs = false) {
    rawResult = summary;
    $("#summary-grid").classList.remove("is-hidden");
    $("#metric-recommended").textContent = String(summary.recommendedConcurrency);
    $("#metric-success").textContent = `${summary.successRate.toFixed(1)}%`;
    setRuntimeText("#metric-success-detail", "successFailure", {
      success: summary.success,
      failure: summary.failure
    });
    $("#metric-throughput").textContent = rate(summary.peakThroughput);
    $("#metric-latency").textContent = seconds(summary.p95Latency);
    if (!addLogs) return;
    logKey("summaryLog", {
      recommended: summary.recommendedConcurrency,
      time: seconds(summary.wallTime)
    }, "info");
    if (summary.recommendedConcurrency === summary.maxTestedConcurrency) {
      logKey("maxPassedLog", {}, "good");
    } else if (summary.recommendedConcurrency === 0) {
      logKey("allFailedLog", { threshold: successThreshold }, "bad");
    } else {
      logKey("reserveLog", { recommended: summary.recommendedConcurrency }, "bad");
    }
  }

  function reset() {
    $("#empty-state").classList.add("is-hidden");
    $("#test-state").classList.remove("is-hidden");
    $("#summary-grid").classList.add("is-hidden");
    setRuntimeText("#progress-label", "connecting");
    $("#progress-percent").textContent = "0%";
    setRuntimeText("#progress-count", "requestsCount", { completed: 0, total: 0 });
    $("#progress-bar").style.width = "0%";
    $("#current-concurrency").textContent = "—";
    $("#live-success").textContent = "0";
    $("#last-status").textContent = "—";
    $("#stage-counter").textContent = "0 / 0";
    completedStages = [];
    logEntries = [];
    expectedStageCount = 0;
    rawResult = null;
    renderStageTable();
    outputLog.replaceChildren();
  }

  function handleEvent(event, payload) {
    switch (event) {
      case "start":
        expectedStageCount = payload.levels.length;
        setRuntimeText("#progress-count", "requestsCount", { completed: 0, total: payload.totalRequests });
        $("#stage-counter").textContent = `0 / ${payload.levels.length}`;
        logKey("targetEndpointLog", { endpoint: payload.endpoint }, "info");
        logKey("planLog", { levels: payload.levels.length, requests: payload.totalRequests });
        break;
      case "stage_start":
        setRuntimeText("#progress-label", "levelProgress", { level: payload.level, count: payload.levelCount });
        $("#current-concurrency").textContent = String(payload.concurrency);
        logKey("stageStarting", { concurrency: payload.concurrency });
        break;
      case "progress":
        $("#progress-percent").textContent = `${payload.percent.toFixed(1)}%`;
        setRuntimeText("#progress-count", "requestsCount", { completed: payload.completed, total: payload.total });
        $("#progress-bar").style.width = `${payload.percent}%`;
        $("#live-success").textContent = String(payload.success);
        $("#last-status").textContent = String(payload.lastStatus);
        break;
      case "stage_complete":
        addStage(payload);
        $("#stage-counter").textContent = `${completedStages.length} / ${expectedStageCount}`;
        break;
      case "complete":
        setRuntimeText("#progress-label", "allComplete");
        $("#progress-percent").textContent = "100%";
        $("#progress-bar").style.width = "100%";
        $("#stage-counter").textContent = `${payload.stages.length} / ${payload.stages.length}`;
        renderSummary(payload, true);
        setStatus("complete", "statusComplete");
        break;
      case "error":
        throw new Error(payload.message || t("statusError"));
    }
  }

  return {
    handleEvent,
    hasResult: () => rawResult !== null,
    logRaw,
    outputText: () => rawResult ? JSON.stringify(rawResult, null, 2) : outputLog.innerText,
    refreshLocale() {
      refreshRuntimeTexts();
      renderStageTable();
      renderLogs();
      if (rawResult) renderSummary(rawResult, false);
      setStatus(statusType, statusKey);
    },
    reset,
    setStatus,
    setSuccessThreshold(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
        throw new Error("Invalid success threshold");
      }
      successThreshold = parsed;
      renderStageTable();
    }
  };
}

"use strict";

const MAX_EVENT_BUFFER = 1_000_000;

async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export async function fetchBootstrap() {
  const [configResponse, catalogResponse] = await Promise.all([
    fetch("/api/config", { headers: { Accept: "application/json" } }),
    fetch("/api/catalog", { headers: { Accept: "application/json" } })
  ]);
  return {
    config: await readJson(configResponse),
    catalog: await readJson(catalogResponse)
  };
}

export async function fetchPricing(provider, model) {
  const query = new URLSearchParams({ provider, model });
  const response = await fetch(`/api/pricing?${query}`, {
    headers: { Accept: "application/json" }
  });
  return readJson(response);
}

export async function fetchSiteAnalysis(payload) {
  const response = await fetch("/api/site-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload)
  });
  return readJson(response);
}

function dispatchBlock(block, onEvent) {
  let event = "message";
  const data = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (data.length) onEvent(event, JSON.parse(data.join("\n")));
}

export async function streamTest(payload, signal, onEvent) {
  const response = await fetch("/api/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal
  });
  if (!response.ok) await readJson(response);
  if (!response.body) throw new Error("Streaming response body is unavailable");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replaceAll("\r\n", "\n");
    if (buffer.length > MAX_EVENT_BUFFER && !buffer.includes("\n\n")) {
      throw new Error("Event stream exceeded the safety buffer");
    }
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      dispatchBlock(buffer.slice(0, boundary), onEvent);
      buffer = buffer.slice(boundary + 2);
    }
    if (done) break;
  }
  if (buffer.trim()) dispatchBlock(buffer, onEvent);
}

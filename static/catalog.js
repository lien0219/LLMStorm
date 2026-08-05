"use strict";

let providers = [];

function localized(value, locale) {
  if (typeof value === "string") return value;
  return value?.[locale] || value?.zh || value?.en || "";
}

function normalizedModel(entry) {
  return typeof entry === "string" ? { id: entry, label: entry } : entry;
}

export function setCatalog(catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.providers)) {
    throw new Error("Unsupported model catalog");
  }
  providers = catalog.providers;
}

export function getProvider(providerId) {
  return providers.find((provider) => provider.id === providerId) || null;
}

export function populateProviders(select, locale, preserveValue = "") {
  select.replaceChildren();
  for (const provider of providers) {
    const option = document.createElement("option");
    option.value = provider.id;
    option.textContent = localized(provider.label, locale);
    select.appendChild(option);
  }
  if (preserveValue && getProvider(preserveValue)) select.value = preserveValue;
}

export function populateModels(select, providerId, locale, t, preserveValue = "") {
  const provider = getProvider(providerId);
  select.replaceChildren();
  if (!provider) return;

  for (const group of provider.groups) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = t(group.labelKey);
    for (const rawModel of group.models) {
      const model = normalizedModel(rawModel);
      const option = document.createElement("option");
      option.value = model.id;
      option.textContent = localized(model.label ?? model.id, locale);
      option.title = model.id;
      optgroup.appendChild(option);
    }
    select.appendChild(optgroup);
  }

  const custom = document.createElement("option");
  custom.value = "__custom__";
  custom.textContent = t("customModelOption");
  select.appendChild(custom);
  if (preserveValue && [...select.options].some((option) => option.value === preserveValue)) {
    select.value = preserveValue;
  }
}


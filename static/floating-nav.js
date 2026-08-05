"use strict";

const header = document.querySelector(".site-header");

if (header) {
  const STORAGE_KEY = "llmstorm.floatingNavPosition";
  const FLOAT_SCROLL_POINT = 72;
  const RETURN_SCROLL_POINT = 320;
  const TOP_SCROLL_POINT = 8;
  const EDGE_GAP = 10;
  const MORPH_EASING = "cubic-bezier(.2,.82,.2,1)";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const primaryNav = header.querySelector(".primary-nav");
  const placeholder = document.createElement("div");
  const toggle = document.createElement("button");

  let mode = "top";
  let lastScrollY = window.scrollY;
  let morphAnimation = null;
  let morphSequence = 0;
  let drag = null;
  let suppressClick = false;
  let savedPosition = readSavedPosition();
  let orbPosition = resolveOrbPosition();

  placeholder.className = "nav-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  header.insertAdjacentElement("afterend", placeholder);

  if (primaryNav && !primaryNav.id) primaryNav.id = "primary-navigation";
  toggle.className = "nav-orb-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-controls", primaryNav?.id || "primary-navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML = `
    <span class="nav-orb-core" aria-hidden="true">
      <svg viewBox="0 0 32 32"><path d="M18.7 2 7 17.2h8.2L12.8 30 25 13.6h-8.1L18.7 2Z"/></svg>
    </span>
  `;
  header.append(toggle);
  header.classList.add("nav-enhanced");
  updateToggleLabel();

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function orbSize() {
    return window.innerWidth <= 700 ? 52 : 56;
  }

  function readSavedPosition() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
      if (
        parsed
        && Number.isFinite(parsed.x)
        && Number.isFinite(parsed.y)
        && parsed.x >= 0
        && parsed.x <= 1
        && parsed.y >= 0
        && parsed.y <= 1
      ) return parsed;
    } catch {
      // Use the default position when storage is unavailable or invalid.
    }
    return null;
  }

  function resolveOrbPosition() {
    const size = orbSize();
    const maxX = Math.max(EDGE_GAP, window.innerWidth - size - EDGE_GAP);
    const maxY = Math.max(EDGE_GAP, window.innerHeight - size - EDGE_GAP);
    if (savedPosition) {
      return {
        x: clamp(savedPosition.x * (window.innerWidth - size), EDGE_GAP, maxX),
        y: clamp(savedPosition.y * (window.innerHeight - size), EDGE_GAP, maxY)
      };
    }
    return {
      x: maxX,
      y: clamp(window.innerWidth <= 700 ? 132 : 92, EDGE_GAP, maxY)
    };
  }

  function saveOrbPosition() {
    const size = orbSize();
    savedPosition = {
      x: clamp(orbPosition.x / Math.max(1, window.innerWidth - size), 0, 1),
      y: clamp(orbPosition.y / Math.max(1, window.innerHeight - size), 0, 1)
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedPosition));
    } catch {
      // Position remains available for this page when storage is disabled.
    }
  }

  function setHeaderRect({ left, top, width, height }) {
    header.style.left = `${Math.round(left)}px`;
    header.style.top = `${Math.round(top)}px`;
    header.style.width = `${Math.round(width)}px`;
    header.style.height = `${Math.round(height)}px`;
  }

  function clearHeaderRect() {
    header.style.removeProperty("left");
    header.style.removeProperty("top");
    header.style.removeProperty("width");
    header.style.removeProperty("height");
  }

  function stopMorph() {
    morphSequence += 1;
    if (morphAnimation) morphAnimation.cancel();
    morphAnimation = null;
    header.style.transform = "none";
  }

  function morphHeader(target, mutate, { duration = 480, onFinish } = {}) {
    const start = header.getBoundingClientRect();
    stopMorph();
    if (mutate) mutate();
    setHeaderRect(target);
    const end = header.getBoundingClientRect();
    const scaleX = start.width / Math.max(1, end.width);
    const scaleY = start.height / Math.max(1, end.height);
    const translateX = start.left - end.left;
    const translateY = start.top - end.top;

    if (reducedMotion.matches || duration <= 0) {
      if (onFinish) onFinish();
      return;
    }

    const sequence = ++morphSequence;
    morphAnimation = header.animate(
      [
        {
          transformOrigin: "0 0",
          transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scaleX}, ${scaleY})`
        },
        {
          transformOrigin: "0 0",
          transform: "translate3d(0, 0, 0) scale(1, 1)"
        }
      ],
      { duration, easing: MORPH_EASING, fill: "none" }
    );
    morphAnimation.finished.then(() => {
      if (sequence !== morphSequence) return;
      morphAnimation = null;
      header.style.transform = "none";
      if (onFinish) onFinish();
    }).catch(() => {
      // A new interaction can intentionally replace an in-flight morph.
    });
  }

  function topHeaderRect() {
    const compact = window.innerWidth <= 700;
    const width = Math.min(1380, window.innerWidth - (compact ? 16 : 32));
    return {
      left: (window.innerWidth - width) / 2,
      top: compact ? 8 : 12,
      width,
      height: compact ? 112 : 66
    };
  }

  function collapsedRect() {
    const size = orbSize();
    return { left: orbPosition.x, top: orbPosition.y, width: size, height: size };
  }

  function expandedRect() {
    const size = orbSize();
    const compact = window.innerWidth <= 900;
    const width = compact ? window.innerWidth - 16 : Math.min(820, window.innerWidth - 24);
    const height = compact ? 112 : 66;
    const centerX = orbPosition.x + size / 2;
    const centerY = orbPosition.y + size / 2;
    const preferredLeft = centerX > window.innerWidth / 2
      ? orbPosition.x + size - width
      : orbPosition.x;
    const preferredTop = centerY > window.innerHeight / 2
      ? orbPosition.y + size - height
      : orbPosition.y;
    return {
      left: clamp(preferredLeft, 8, window.innerWidth - width - 8),
      top: clamp(preferredTop, 8, window.innerHeight - height - 8),
      width,
      height,
      compact
    };
  }

  function updateToggleLabel() {
    const label = window.LLMStormI18n?.t("floatingNavOpen") || "展开导航";
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
  }

  function enterFloatingMode() {
    if (mode !== "top") return;
    const start = header.getBoundingClientRect();
    const computed = window.getComputedStyle(header);
    const occupiedHeight = header.offsetHeight
      + Number.parseFloat(computed.marginTop || "0")
      + Number.parseFloat(computed.marginBottom || "0");
    placeholder.style.height = `${occupiedHeight}px`;
    orbPosition = resolveOrbPosition();
    mode = "collapsed";
    header.classList.add("is-floating", "is-expanded");
    header.classList.remove("is-collapsed", "is-returning", "is-compact");
    setHeaderRect(start);
    header.getBoundingClientRect();
    window.requestAnimationFrame(() => {
      if (mode !== "collapsed") return;
      morphHeader(collapsedRect(), () => {
        header.classList.remove("is-expanded");
        header.classList.add("is-collapsed");
        toggle.setAttribute("aria-expanded", "false");
      }, { duration: 520 });
    });
  }

  function expandNavigation() {
    if (mode !== "collapsed") return;
    const target = expandedRect();
    mode = "expanded";
    morphHeader(target, () => {
      header.classList.remove("is-collapsed");
      header.classList.add("is-expanded");
      header.classList.toggle("is-compact", target.compact);
      toggle.setAttribute("aria-expanded", "true");
    }, { duration: 460 });
  }

  function collapseNavigation() {
    if (mode !== "expanded") return;
    mode = "collapsed";
    morphHeader(collapsedRect(), () => {
      header.classList.remove("is-expanded", "is-compact");
      header.classList.add("is-collapsed");
      toggle.setAttribute("aria-expanded", "false");
    }, { duration: 420 });
  }

  function reverseReturnToOrb() {
    if (mode !== "returning" && mode !== "awaiting-top") return;
    mode = "collapsed";
    morphHeader(collapsedRect(), () => {
      header.classList.remove("is-expanded", "is-returning", "is-awaiting-top", "is-compact");
      header.classList.add("is-collapsed");
      toggle.setAttribute("aria-expanded", "false");
    }, { duration: 360 });
  }

  function finishReturnToTop() {
    if (mode !== "returning" && mode !== "awaiting-top") return;
    mode = "top";
    header.classList.remove(
      "is-floating",
      "is-expanded",
      "is-collapsed",
      "is-returning",
      "is-awaiting-top",
      "is-compact"
    );
    clearHeaderRect();
    placeholder.style.height = "0px";
    toggle.setAttribute("aria-expanded", "false");
  }

  function settleReturnMotion() {
    if (mode !== "returning") return;
    if (window.scrollY <= TOP_SCROLL_POINT) {
      finishReturnToTop();
      return;
    }
    mode = "awaiting-top";
    header.classList.remove("is-returning");
    header.classList.add("is-awaiting-top");
  }

  function returnToTop() {
    if (mode === "top" || mode === "returning" || mode === "awaiting-top") return;
    mode = "returning";
    morphHeader(topHeaderRect(), () => {
      header.classList.remove("is-collapsed", "is-compact");
      header.classList.add("is-expanded", "is-returning");
      toggle.setAttribute("aria-expanded", "true");
    }, { duration: 520, onFinish: settleReturnMotion });
  }

  function handleScroll() {
    const nextScrollY = window.scrollY;
    const scrollingUp = nextScrollY < lastScrollY - 1;
    const scrollingDown = nextScrollY > lastScrollY + 1;
    if (nextScrollY <= TOP_SCROLL_POINT) {
      if (mode === "awaiting-top") finishReturnToTop();
      else returnToTop();
    } else if (
      scrollingUp
      && nextScrollY <= RETURN_SCROLL_POINT
      && mode !== "top"
      && mode !== "returning"
      && mode !== "awaiting-top"
    ) {
      returnToTop();
    } else if (
      scrollingDown
      && nextScrollY >= FLOAT_SCROLL_POINT
      && (mode === "returning" || mode === "awaiting-top")
    ) {
      reverseReturnToOrb();
    } else if (nextScrollY >= FLOAT_SCROLL_POINT && mode === "top") {
      enterFloatingMode();
    } else if (mode === "expanded" && Math.abs(nextScrollY - lastScrollY) > 2) {
      collapseNavigation();
    }
    lastScrollY = nextScrollY;
  }

  toggle.addEventListener("click", () => {
    if (suppressClick) return;
    expandNavigation();
  });

  toggle.addEventListener("pointerdown", (event) => {
    if (mode !== "collapsed" || event.button > 0) return;
    stopMorph();
    setHeaderRect(collapsedRect());
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: orbPosition.x,
      originY: orbPosition.y,
      moved: false
    };
    toggle.setPointerCapture(event.pointerId);
    header.classList.add("is-dragging");
  });

  toggle.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.hypot(deltaX, deltaY) > 4) drag.moved = true;
    if (!drag.moved) return;
    const size = orbSize();
    orbPosition = {
      x: clamp(drag.originX + deltaX, EDGE_GAP, window.innerWidth - size - EDGE_GAP),
      y: clamp(drag.originY + deltaY, EDGE_GAP, window.innerHeight - size - EDGE_GAP)
    };
    setHeaderRect(collapsedRect());
    event.preventDefault();
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    drag = null;
    header.classList.remove("is-dragging");
    if (toggle.hasPointerCapture(event.pointerId)) toggle.releasePointerCapture(event.pointerId);
    if (moved) {
      saveOrbPosition();
      suppressClick = true;
      window.setTimeout(() => { suppressClick = false; }, 0);
    }
  }

  toggle.addEventListener("pointerup", finishDrag);
  toggle.addEventListener("pointercancel", finishDrag);

  document.addEventListener("pointerdown", (event) => {
    if (mode === "expanded" && !header.contains(event.target)) collapseNavigation();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") collapseNavigation();
  });
  window.addEventListener("wheel", collapseNavigation, { passive: true });
  window.addEventListener("touchmove", collapseNavigation, { passive: true });
  window.addEventListener("scroll", handleScroll, { passive: true });
  window.addEventListener("resize", () => {
    stopMorph();
    orbPosition = resolveOrbPosition();
    if (mode === "collapsed") {
      setHeaderRect(collapsedRect());
    } else if (mode === "expanded") {
      const target = expandedRect();
      header.classList.toggle("is-compact", target.compact);
      setHeaderRect(target);
    } else if (mode === "returning") {
      setHeaderRect(topHeaderRect());
      settleReturnMotion();
    } else if (mode === "awaiting-top") {
      setHeaderRect(topHeaderRect());
    }
  });
  window.addEventListener("llmstorm:localechange", updateToggleLabel);

  handleScroll();
}

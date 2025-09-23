(function () {
  const setActiveNav = () => {
    const navLinks = document.querySelectorAll("nav.primary-nav a");
    const currentPath = window.location.pathname.split("/").pop();

    navLinks.forEach((link) => {
      const linkPath = link.getAttribute("href");
      if (!linkPath) return;
      const isActive = linkPath === currentPath || (!currentPath && linkPath === "index.html");
      link.classList.toggle("active", isActive);
    });
  };

  const initScrollAnimations = () => {
    const animatedElements = document.querySelectorAll("[data-animate]");
    if (!("IntersectionObserver" in window)) {
      animatedElements.forEach((el) => el.classList.add("visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.15,
      }
    );

    animatedElements.forEach((element) => observer.observe(element));
  };

  const initHeroTitleRotator = () => {
    const rotator = document.querySelector("[data-rotator]");
    if (!rotator) return;

    const stage = rotator.querySelector("[data-rotator-stage]");
    const currentFace = rotator.querySelector("[data-rotator-current]");
    const nextFace = rotator.querySelector("[data-rotator-next]");

    if (!stage || !currentFace || !nextFace) {
      return;
    }

    const phrasesAttribute = rotator.getAttribute("data-phrases");
    const initialText = (currentFace.textContent || "").trim();
    let phrases = [];

    if (phrasesAttribute) {
      try {
        const parsed = JSON.parse(phrasesAttribute);
        if (Array.isArray(parsed)) {
          phrases = parsed
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean);
        }
      } catch (error) {
        // Ignore malformed data attributes
      }
    }

    if (!phrases.length && initialText) {
      phrases = [initialText];
    }

    if (!phrases.length) {
      return;
    }

    let currentIndex = phrases.indexOf(initialText);
    if (currentIndex === -1) {
      phrases.unshift(initialText || phrases[0]);
      currentIndex = 0;
    }

    currentFace.textContent = phrases[currentIndex];

    let nextIndex = (currentIndex + 1) % phrases.length;
    let pendingIndex = nextIndex;

    const HOLD_DURATION = 2400;
    let timerId = null;
    let isAnimating = false;
    let activeTransitionHandler = null;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    const measureDimensions = () => {
      if (!phrases.length) return;

      const computed = window.getComputedStyle(currentFace);
      const measurement = document.createElement("span");
      measurement.textContent = "";
      measurement.style.position = "absolute";
      measurement.style.visibility = "hidden";
      measurement.style.pointerEvents = "none";
      measurement.style.whiteSpace = "nowrap";
      measurement.style.font = computed.font;
      measurement.style.letterSpacing = computed.letterSpacing;
      measurement.style.textTransform = computed.textTransform;
      measurement.style.fontFeatureSettings = computed.fontFeatureSettings;
      document.body.appendChild(measurement);

      let maxWidth = 0;
      let maxHeight = 0;

      phrases.forEach((phrase) => {
        measurement.textContent = phrase;
        const rect = measurement.getBoundingClientRect();
        maxWidth = Math.max(maxWidth, rect.width);
        maxHeight = Math.max(maxHeight, rect.height);
      });

      measurement.remove();

      const width = Math.ceil(maxWidth);
      const height = Math.ceil(maxHeight);

      if (width > 0) {
        rotator.style.setProperty("--rotator-width", `${width}px`);
        rotator.style.setProperty("--rotator-depth", `${width}px`);
      }
      if (height > 0) {
        rotator.style.setProperty("--rotator-height", `${height}px`);
      }
    };

    const clearTimer = () => {
      if (timerId) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const detachTransitionHandler = () => {
      if (activeTransitionHandler) {
        stage.removeEventListener("transitionend", activeTransitionHandler);
        activeTransitionHandler = null;
      }
    };

    const resetStage = () => {
      stage.style.transition = "none";
      stage.style.transform = "rotateY(0deg)";
      rotator.classList.remove("is-animating");
      requestAnimationFrame(() => {
        stage.style.removeProperty("transition");
      });
    };

    const finalizeFlip = (targetIndex) => {
      currentIndex = targetIndex;
      currentFace.textContent = phrases[currentIndex];
      nextFace.textContent = "";
      isAnimating = false;
      resetStage();
      nextIndex = (currentIndex + 1) % phrases.length;
      pendingIndex = nextIndex;
    };

    const runFlip = () => {
      if (isAnimating || reduceMotion || phrases.length <= 1) {
        return;
      }

      const targetIndex = nextIndex;
      pendingIndex = targetIndex;
      const nextPhrase = phrases[targetIndex];

      if (!nextPhrase) {
        return;
      }

      isAnimating = true;
      rotator.classList.add("is-animating");
      nextFace.textContent = nextPhrase;

      detachTransitionHandler();

      const handleTransitionEnd = (event) => {
        if (event.target !== stage || event.propertyName !== "transform") {
          return;
        }

        detachTransitionHandler();
        finalizeFlip(targetIndex);
        scheduleNext();
      };

      activeTransitionHandler = handleTransitionEnd;
      stage.addEventListener("transitionend", handleTransitionEnd);

      requestAnimationFrame(() => {
        stage.style.transform = "rotateY(-90deg)";
      });
    };

    const scheduleNext = () => {
      clearTimer();
      if (reduceMotion || phrases.length <= 1) {
        return;
      }

      timerId = window.setTimeout(() => {
        timerId = null;
        runFlip();
      }, HOLD_DURATION);
    };

    const completeAndPause = () => {
      clearTimer();
      detachTransitionHandler();
      if (isAnimating) {
        finalizeFlip(pendingIndex);
      } else {
        resetStage();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        completeAndPause();
      } else if (!reduceMotion) {
        scheduleNext();
      }
    };

    const handleMotionChange = (event) => {
      reduceMotion = event.matches;
      if (reduceMotion) {
        completeAndPause();
      } else {
        nextIndex = (currentIndex + 1) % phrases.length;
        measureDimensions();
        scheduleNext();
      }
    };

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", handleMotionChange);
    } else if (typeof motionQuery.addListener === "function") {
      motionQuery.addListener(handleMotionChange);
    }

    measureDimensions();

    if (document.fonts && typeof document.fonts.ready === "object" && typeof document.fonts.ready.then === "function") {
      document.fonts.ready.then(() => {
        measureDimensions();
      });
    }

    window.addEventListener("resize", measureDimensions, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (!reduceMotion) {
      scheduleNext();
    }
  };

  const initFormInteractions = () => {
    const form = document.querySelector("form[data-mock-submit]");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      const feedback = form.querySelector("[data-form-feedback]");

      if (button) {
        button.disabled = true;
        button.textContent = "Submitting...";
      }

      setTimeout(() => {
        if (button) {
          button.disabled = false;
          button.textContent = "Submit Application";
        }
        if (feedback) {
          feedback.textContent = "Thanks! We’ll reach out soon with next steps.";
          feedback.classList.add("visible");
        }
        form.reset();
      }, 900);
    });
  };

  const initCadenceCards = () => {
    const cards = Array.from(document.querySelectorAll("[data-card]"));
    if (!cards.length) return;

    const FLIP_IN_DURATION = 0.6;
    const FLIP_OUT_DURATION = 0.28;
    const FLIP_IN_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
    const FLIP_OUT_EASING = "cubic-bezier(0.55, 0, 0.55, 0.2)";

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    const updateAria = (card, flipped) => {
      card.setAttribute("aria-pressed", flipped ? "true" : "false");
      const label = flipped ? card.dataset.backLabel : card.dataset.frontLabel;
      if (label) {
        card.setAttribute("aria-label", label);
      }
    };

    const setFlipState = (card, flipped, options = {}) => {
      const inner = card.querySelector(".card-inner");
      if (!inner) return;

      const { animate = true, force = false } = options;
      const isCurrentlyFlipped = card.classList.contains("is-flipped");
      if (isCurrentlyFlipped === flipped && !force) {
        updateAria(card, flipped);
        return;
      }

      if (reduceMotion || !animate) {
        inner.style.setProperty("--flip-duration", "0.001s");
        inner.style.setProperty("--flip-easing", "linear");
      } else {
        inner.style.setProperty("--flip-duration", `${flipped ? FLIP_IN_DURATION : FLIP_OUT_DURATION}s`);
        inner.style.setProperty("--flip-easing", flipped ? FLIP_IN_EASING : FLIP_OUT_EASING);
      }

      card.classList.toggle("is-flipped", flipped);
      card.classList.toggle("is-engaged", flipped || card === document.activeElement);
      updateAria(card, flipped);

      if (!flipped) {
        card.style.setProperty("--layer-shift-x", "0px");
        card.style.setProperty("--layer-shift-y", "0px");
      }

      if (!flipped && !card.matches(":focus")) {
        card.classList.remove("is-engaged");
      }

      if (flipped && !reduceMotion && card.dataset.easterEgg === "clapboard") {
        const clapboard = card.querySelector("[data-clapboard]");
        if (clapboard) {
          clapboard.classList.remove("is-playing");
          void clapboard.offsetWidth;
          clapboard.classList.add("is-playing");
          window.setTimeout(() => clapboard.classList.remove("is-playing"), 650);
        }
      }
    };

    const closeCards = (exception) => {
      cards.forEach((card) => {
        if (card !== exception) {
          setFlipState(card, false, { animate: !reduceMotion });
        }
      });
    };

    const updatePointerState = (card, event) => {
      const rect = card.getBoundingClientRect();
      const pointerX = typeof event.clientX === "number" ? event.clientX : rect.left + rect.width / 2;
      const pointerY = typeof event.clientY === "number" ? event.clientY : rect.top + rect.height / 2;

      const relativeX = pointerX - rect.left;
      const relativeY = pointerY - rect.top;
      const normalizedX = relativeX / rect.width - 0.5;
      const normalizedY = relativeY / rect.height - 0.5;

      const shiftX = Math.max(Math.min(normalizedX * 4, 2), -2);
      const shiftY = Math.max(Math.min(normalizedY * 4, 2), -2);

      card.style.setProperty("--layer-shift-x", `${shiftX.toFixed(2)}px`);
      card.style.setProperty("--layer-shift-y", `${shiftY.toFixed(2)}px`);
    };

    const handleMotionChange = () => {
      reduceMotion = motionQuery.matches;
      if (reduceMotion) {
        cards.forEach((card) => {
          setFlipState(card, false, { animate: false, force: true });
          card.classList.remove("is-engaged");
          card.style.setProperty("--layer-shift-x", "0px");
          card.style.setProperty("--layer-shift-y", "0px");
        });
      }
    };

    if (typeof motionQuery.addEventListener === "function") {
      motionQuery.addEventListener("change", handleMotionChange);
    } else if (typeof motionQuery.addListener === "function") {
      motionQuery.addListener(handleMotionChange);
    }

    cards.forEach((card, index) => {
      card.style.setProperty("--card-reveal-delay", `${index * 60}ms`);
      updateAria(card, false);

      card.addEventListener("pointerenter", (event) => {
        if (reduceMotion) return;
        if (event.pointerType && event.pointerType !== "mouse") return;
        closeCards(card);
        setFlipState(card, true);
        updatePointerState(card, event);
      });

      card.addEventListener("pointermove", (event) => {
        if (reduceMotion) return;
        if (event.pointerType && event.pointerType !== "mouse") return;
        updatePointerState(card, event);
      });

      card.addEventListener("pointerleave", (event) => {
        if (reduceMotion) return;
        if (event.pointerType && event.pointerType !== "mouse") return;
        setFlipState(card, false);
      });

      card.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || event.pointerType === "pen") {
          const willFlip = !card.classList.contains("is-flipped");
          closeCards(card);
          if (willFlip && !reduceMotion) {
            updatePointerState(card, event);
          }
          setFlipState(card, willFlip, { animate: !reduceMotion });
          if (typeof card.focus === "function") {
            card.focus({ preventScroll: true });
          }
          event.preventDefault();
        }
      });

      card.addEventListener("focus", () => {
        card.classList.add("is-engaged");
      });

      card.addEventListener("blur", () => {
        if (!card.classList.contains("is-flipped")) {
          card.classList.remove("is-engaged");
        }
      });

      card.addEventListener("keydown", (event) => {
        if (event.key === " " || event.key === "Spacebar" || event.key === "Enter") {
          event.preventDefault();
          const willFlip = !card.classList.contains("is-flipped");
          if (willFlip) {
            closeCards(card);
          }
          setFlipState(card, willFlip, { animate: !reduceMotion });
        } else if (event.key === "Escape") {
          if (card.classList.contains("is-flipped")) {
            event.preventDefault();
            setFlipState(card, false, { animate: !reduceMotion });
          }
        }
      });
    });

    document.addEventListener("pointerdown", (event) => {
      if (!event.target.closest("[data-card]")) {
        closeCards();
      }
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    setActiveNav();
    initScrollAnimations();
    initHeroTitleRotator();
    initFormInteractions();
    initCadenceCards();
  });
})();

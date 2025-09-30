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
            // Add visible to the target
            entry.target.classList.add("visible");

            // If the hero title becomes visible, immediately mark the full stop
            // visible as well so the punctuation animates in perfect sync.
            try {
              if (entry.target.id === "hero-title") {
                const fullstop = document.querySelector(".hero-fullstop[data-animate]");
                if (fullstop) {
                  fullstop.classList.add("visible");
                  observer.unobserve(fullstop);
                }
              }
            } catch (e) {
              // swallow any unexpected errors to avoid breaking other observers
            }

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
    const initialText = (currentFace.innerHTML || "").trim();
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

    currentFace.innerHTML = phrases[currentIndex];

    let nextIndex = (currentIndex + 1) % phrases.length;
    let pendingIndex = nextIndex;

    // Detect mobile devices and adjust performance accordingly
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                     ('ontouchstart' in window) || 
                     (navigator.maxTouchPoints > 0);
    
    const HOLD_DURATION = isMobile ? 3200 : 2400; // Longer duration on mobile for better UX
    let timerId = null;
    let isAnimating = false;
    let activeTransitionHandler = null;
    let pendingFrameId = null;

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
      
      const performMeasurement = () => {
        document.body.appendChild(measurement);
        
        let maxWidth = 0;
        let maxHeight = 0;

        phrases.forEach((phrase) => {
          measurement.innerHTML = phrase;
          const rect = measurement.getBoundingClientRect();
          maxWidth = Math.max(maxWidth, rect.width);
          maxHeight = Math.max(maxHeight, rect.height);
        });

        measurement.remove();

        // Get container width to ensure responsiveness
        const containerWidth = rotator.parentElement?.getBoundingClientRect().width || window.innerWidth;
        const safeMaxWidth = Math.min(maxWidth, containerWidth * 0.9); // Leave 10% margin

        if (safeMaxWidth > 0) {
          rotator.style.setProperty("--rotator-width", `${Math.ceil(safeMaxWidth)}px`);
        }
        if (maxHeight > 0) {
          rotator.style.setProperty("--rotator-height", `${Math.ceil(maxHeight)}px`);
        }
      };
      
      // Use requestAnimationFrame to avoid layout thrashing on mobile
      if (typeof window.requestAnimationFrame === "function" && isMobile) {
        window.requestAnimationFrame(performMeasurement);
      } else {
        performMeasurement();
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
        nextFace.removeEventListener("transitionend", activeTransitionHandler);
        activeTransitionHandler = null;
      }
    };

    const cancelPendingFrame = () => {
      if (pendingFrameId !== null) {
        if (typeof window.cancelAnimationFrame === "function") {
          window.cancelAnimationFrame(pendingFrameId);
        }
        pendingFrameId = null;
      }
    };

    const resetStage = () => {
      cancelPendingFrame();
      currentFace.style.transition = "none";
      nextFace.style.transition = "none";
      rotator.classList.remove("is-animating");
      currentFace.style.removeProperty("transform");
      nextFace.style.removeProperty("transform");
      // Force styles to apply without animating so the next flip starts cleanly.
      void stage.offsetWidth;
      currentFace.style.removeProperty("transition");
      nextFace.style.removeProperty("transition");
    };

    const finalizeFlip = (targetIndex) => {
      currentIndex = targetIndex;
      currentFace.innerHTML = phrases[currentIndex];
      isAnimating = false;
      resetStage();
      nextFace.innerHTML = "";
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
      
      // Pre-populate the next face to avoid layout shifts
      nextFace.innerHTML = nextPhrase;

      detachTransitionHandler();
      cancelPendingFrame();

      const handleTransitionEnd = (event) => {
        if (event.target !== nextFace || event.propertyName !== "transform") {
          return;
        }

        detachTransitionHandler();
        finalizeFlip(targetIndex);
        
        // Add a larger delay on mobile to prevent rapid animations that could cause lag
        const delay = isMobile ? 200 : 50;
        setTimeout(scheduleNext, delay);
      };

      activeTransitionHandler = handleTransitionEnd;
      nextFace.addEventListener("transitionend", handleTransitionEnd);

      // Use double requestAnimationFrame on mobile for smoother animations
      const startAnimation = () => {
        if (!isAnimating) return;
        rotator.classList.add("is-animating");
      };

      if (typeof window.requestAnimationFrame === "function") {
        if (isMobile) {
          // Double RAF for mobile to ensure smooth animation start
          pendingFrameId = window.requestAnimationFrame(() => {
            pendingFrameId = window.requestAnimationFrame(() => {
              pendingFrameId = null;
              startAnimation();
            });
          });
        } else {
          pendingFrameId = window.requestAnimationFrame(() => {
            pendingFrameId = null;
            startAnimation();
          });
        }
      } else {
        startAnimation();
      }
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

    // Throttle resize events on mobile for better performance
    let resizeTimeout;
    const handleResize = () => {
      if (isMobile) {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(measureDimensions, 150);
      } else {
        measureDimensions();
      }
    };
    
    window.addEventListener("resize", handleResize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibilityChange, { passive: true });

    // Add intersection observer to pause animations when not visible (mobile optimization)
    if (isMobile && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.target === rotator) {
              if (entry.isIntersecting && !reduceMotion) {
                scheduleNext();
              } else {
                completeAndPause();
              }
            }
          });
        },
        { 
          threshold: 0.1,
          rootMargin: "50px 0px"
        }
      );
      
      observer.observe(rotator);
    } else if (!reduceMotion) {
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

  const initPdfModal = () => {
    const overlay = document.querySelector("[data-pdf-overlay]");
    const frame = overlay ? overlay.querySelector("[data-pdf-frame]") : null;
    const closeButton = overlay ? overlay.querySelector("[data-pdf-close]") : null;
    const triggers = Array.from(document.querySelectorAll("[data-pdf-trigger]"));

    if (!overlay || !frame || !closeButton || !triggers.length) {
      return;
    }

    const pdfSrc = overlay.getAttribute("data-pdf-src") || frame.getAttribute("src") || "";
    let hasLoaded = Boolean(frame.getAttribute("src"));
    let lastActiveElement = null;

    const focusableSelector =
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const getFocusableElements = () => {
      return Array.from(overlay.querySelectorAll(focusableSelector)).filter((el) =>
        !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden")
      );
    };

    const trapFocus = (event) => {
      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusableElements();
      if (!focusable.length) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const openOverlay = () => {
      lastActiveElement = document.activeElement;
      overlay.hidden = false;
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => overlay.classList.add("is-visible"));
      } else {
        overlay.classList.add("is-visible");
      }
      document.body.style.overflow = "hidden";

      if (!hasLoaded && pdfSrc) {
        frame.setAttribute("src", pdfSrc);
        hasLoaded = true;
      }

      const focusable = getFocusableElements();
      const target = focusable.find((el) => el.hasAttribute("data-pdf-close")) || focusable[0];
      if (target && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }

      overlay.addEventListener("keydown", trapFocus);
      document.addEventListener("keydown", handleEscape);
    };

    const closeOverlay = () => {
      overlay.classList.remove("is-visible");
      document.body.style.removeProperty("overflow");
      overlay.removeEventListener("keydown", trapFocus);
      document.removeEventListener("keydown", handleEscape);

      const handleTransitionEnd = (event) => {
        if (event.target !== overlay) {
          return;
        }

        if (!overlay.classList.contains("is-visible")) {
          overlay.hidden = true;
        }

        overlay.removeEventListener("transitionend", handleTransitionEnd);
      };

      overlay.addEventListener("transitionend", handleTransitionEnd);

      const computed = window.getComputedStyle(overlay);
      const totalDuration = computed.transitionDuration
        .split(",")
        .map((value) => parseFloat(value) || 0)
        .reduce((sum, value) => sum + value, 0);

      if (!totalDuration) {
        overlay.hidden = true;
      }

      if (lastActiveElement && typeof lastActiveElement.focus === "function") {
        lastActiveElement.focus({ preventScroll: true });
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        closeOverlay();
      }
    };

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        openOverlay();
      });
    });

    closeButton.addEventListener("click", () => {
      closeOverlay();
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeOverlay();
      }
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
    initPdfModal();
    initCadenceCards();
  });
})();

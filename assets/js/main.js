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
    const form = document.querySelector("[data-rsvp-form]");
    if (!form) return;

    const submitButton = form.querySelector("[data-submit-button]");
    const statusElement = form.querySelector("[data-form-feedback]");
    const honeyField = form.querySelector("[data-honey]");
    const gradYearField = form.querySelector('[data-grad-year]') || form.querySelector('[name="grad_year"]');
    const emailField = form.querySelector('[data-purdue-email]');
    const phoneField = form.querySelector('[data-phone-input]');
    const majorSelect = form.querySelector('[data-major-select]');
    const majorOtherContainer = form.querySelector('[data-major-other]');
    const majorOtherInput = form.querySelector('[data-major-other-input]');
    const consentCheckbox = form.querySelector('[data-consent-checkbox]');
    const consentFallback = form.querySelector('[data-consent-fallback]');
    const defaultButtonText = submitButton ? submitButton.textContent : "";
    const currentYear = new Date().getFullYear();
    const maxGradYear = currentYear + 5;

    if (typeof window.fetch !== "function" || typeof window.FormData !== "function") {
      return;
    }

    const enforcePurdueEmail = () => {
      if (!emailField) return;
      const value = emailField.value.trim();
      if (!value) {
        emailField.setCustomValidity("");
        return;
      }

      if (!value.toLowerCase().endsWith("@purdue.edu")) {
        emailField.setCustomValidity("Oops, this is only for Purdue students. Become a Boilermaker to join.");
      } else {
        emailField.setCustomValidity("");
      }
    };

    const enforceGradYearValidity = () => {
      if (!gradYearField) return;
      const value = gradYearField.value.trim();

      if (!value) {
        gradYearField.setCustomValidity("");
        return;
      }

      if (!/^\d{4}$/.test(value)) {
        gradYearField.setCustomValidity("Enter a four-digit graduation year (e.g., 2026).");
        return;
      }

      const numeric = Number(value);
      if (Number.isFinite(numeric) && numeric > maxGradYear) {
        gradYearField.setCustomValidity(`Please choose a year no later than ${maxGradYear}.`);
        return;
      }

      gradYearField.setCustomValidity("");
    };

    const enforcePhoneValidity = () => {
      if (!phoneField) return;
      const digitsOnly = (phoneField.value || "").replace(/\D/g, "").slice(0, 10);
      if (phoneField.value !== digitsOnly) {
        phoneField.value = digitsOnly;
      }

      if (!digitsOnly) {
        phoneField.setCustomValidity("");
        return;
      }

      if (digitsOnly.length !== 10) {
        phoneField.setCustomValidity("Enter a 10-digit U.S. phone number.");
      } else {
        phoneField.setCustomValidity("");
      }
    };

    const enforceMajorOtherValidity = () => {
      if (!majorOtherInput) return;
      if (!majorOtherInput.required) {
        majorOtherInput.setCustomValidity("");
        return;
      }

      const value = majorOtherInput.value.trim();
      if (!value) {
        majorOtherInput.setCustomValidity("Please tell us your major.");
      } else {
        majorOtherInput.setCustomValidity("");
      }
    };

    const toggleMajorOther = () => {
      if (!majorSelect) return;
      const isOther = majorSelect.value === "other";

      if (majorOtherContainer) {
        majorOtherContainer.hidden = !isOther;
      }

      if (majorOtherInput) {
        majorOtherInput.required = isOther;
        if (!isOther) {
          majorOtherInput.value = "";
          majorOtherInput.setCustomValidity("");
        }
      }
    };

    if (gradYearField) {
      gradYearField.setAttribute("max", String(maxGradYear));
      gradYearField.addEventListener("input", enforceGradYearValidity);
      gradYearField.addEventListener("blur", enforceGradYearValidity);
    }

    if (emailField) {
      emailField.addEventListener("input", enforcePurdueEmail);
      emailField.addEventListener("blur", enforcePurdueEmail);
    }

    if (phoneField) {
      const phoneHint = form.querySelector("#phone-hint");
      if (phoneHint) {
        phoneField.setAttribute("aria-describedby", phoneField.getAttribute("aria-describedby") || "phone-hint");
      } else if (phoneField.getAttribute("aria-describedby") === "phone-hint") {
        phoneField.removeAttribute("aria-describedby");
      }
      phoneField.addEventListener("input", enforcePhoneValidity);
      phoneField.addEventListener("blur", enforcePhoneValidity);
    }

    if (majorSelect) {
      majorSelect.addEventListener("change", () => {
        toggleMajorOther();
        enforceMajorOtherValidity();
      });
    }

    if (majorOtherInput) {
      majorOtherInput.addEventListener("input", enforceMajorOtherValidity);
      majorOtherInput.addEventListener("blur", enforceMajorOtherValidity);
    }

    let syncConsentValue;

    if (consentCheckbox) {
      syncConsentValue = () => {
        if (consentFallback) {
          consentFallback.disabled = consentCheckbox.checked;
        }
      };

      consentCheckbox.addEventListener("change", syncConsentValue);
      syncConsentValue();
    }

    toggleMajorOther();
    enforcePurdueEmail();
    enforceGradYearValidity();
    enforcePhoneValidity();
    enforceMajorOtherValidity();

    const clearStatus = () => {
      if (!statusElement) return;
      statusElement.classList.remove("form-status--success", "form-status--error", "is-visible");
      statusElement.textContent = "";
    };

    const renderStatus = (message, type) => {
      if (!statusElement) return;
      clearStatus();
      if (!message) return;

      const icon = document.createElement("span");
      icon.className = "form-status__icon";
      icon.setAttribute("aria-hidden", "true");

      const text = document.createElement("span");
      text.className = "form-status__text";
      text.textContent = message;

      statusElement.appendChild(icon);
      statusElement.appendChild(text);

      if (type) {
        statusElement.classList.add(`form-status--${type}`);
      }

      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(() => statusElement.classList.add("is-visible"));
      } else {
        statusElement.classList.add("is-visible");
      }
    };

    const setSubmittingState = (isSubmitting) => {
      if (!submitButton) return;
      if (isSubmitting) {
        submitButton.disabled = true;
        submitButton.dataset.state = "submitting";
        submitButton.textContent = "Submitting...";
      } else {
        submitButton.disabled = false;
        submitButton.textContent = defaultButtonText;
        delete submitButton.dataset.state;
      }
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearStatus();

      enforcePurdueEmail();
      enforceGradYearValidity();
      enforcePhoneValidity();
      enforceMajorOtherValidity();

      if (typeof form.checkValidity === "function" && !form.checkValidity()) {
        if (typeof form.reportValidity === "function") {
          form.reportValidity();
        }
        return;
      }

      const honeyValue = honeyField && typeof honeyField.value === "string" ? honeyField.value.trim() : "";
      if (honeyValue) {
        renderStatus("We couldn’t process your submission. Please try again.", "error");
        return;
      }

      const gradYearValue = gradYearField && typeof gradYearField.value === "string" ? gradYearField.value.trim() : "";
      if (gradYearValue && !/^\d{4}$/.test(gradYearValue)) {
        renderStatus("Enter a four-digit graduation year (e.g., 2026).", "error");
        if (typeof gradYearField.focus === "function") {
          gradYearField.focus({ preventScroll: true });
        }
        return;
      }

      setSubmittingState(true);

      const formData = new FormData(form);

      if (phoneField) {
        const sanitizedPhone = (phoneField.value || "").replace(/\D/g, "").slice(0, 10);
        formData.set("phone", sanitizedPhone);
      }

      if (majorOtherInput) {
        const trimmedOther = majorOtherInput.value ? majorOtherInput.value.trim() : "";
        formData.set("major_other", trimmedOther);
      }

      try {
        const endpoint = form.getAttribute("action") || "/api/rsvp.php";
        const response = await fetch(endpoint, {
          method: "POST",
          body: formData,
          headers: {
            Accept: "application/json",
          },
          credentials: "same-origin",
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        let payload = null;
        try {
          payload = await response.json();
        } catch (parseError) {
          throw new Error("Unable to parse server response.");
        }

        if (!payload || payload.ok !== true) {
          const message = (payload && (payload.error || payload.message)) ||
            "We could not save your RSVP. Please try again.";
          renderStatus(message, "error");
          setSubmittingState(false);
          return;
        }

        form.reset();
        renderStatus("You're all set! Check your email shortly.", "success");

        toggleMajorOther();
        enforcePurdueEmail();
        enforceGradYearValidity();
        enforcePhoneValidity();
        enforceMajorOtherValidity();
        if (typeof syncConsentValue === "function") {
          syncConsentValue();
        }

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.dataset.state = "success";
          submitButton.textContent = "Submitted!";
          window.setTimeout(() => {
            submitButton.disabled = false;
            submitButton.textContent = defaultButtonText;
            delete submitButton.dataset.state;
          }, 1600);
        }

        if (statusElement) {
          window.setTimeout(() => {
            statusElement.classList.remove("is-visible");
            window.setTimeout(() => {
              clearStatus();
            }, 350);
          }, 6000);
        }
      } catch (error) {
        renderStatus("We hit a network hiccup. Please try again in a moment.", "error");
        setSubmittingState(false);
      }
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
      // Prevent edge-swipe back gestures from hijacking vertical scroll in the PDF on mobile
      const touchGuard = (e) => {
        try {
          const touch = e.touches && e.touches[0];
          if (!touch) return;
          const edgeThreshold = 24; // px from left edge
          if (touch.clientX <= edgeThreshold) {
            // Prevent the browser back-swipe from initiating
            e.stopPropagation();
            e.preventDefault();
          }
        } catch (err) {
          // silent
        }
      };
      // store so we can remove later
      overlay.__pdfTouchGuard = touchGuard;
      overlay.addEventListener("touchstart", touchGuard, { passive: false });

      // Pinch-to-zoom shim: intercept two-finger gestures and scale the iframe content
      const pdfFrame = overlay.querySelector("[data-pdf-frame]");
      let pinch = {
        active: false,
        startDist: 0,
        startScale: 1,
        maxScale: 3,
        minScale: 1,
      };

      const getDistance = (t1, t2) => {
        const dx = t2.clientX - t1.clientX;
        const dy = t2.clientY - t1.clientY;
        return Math.hypot(dx, dy);
      };

      const onTouchStartPinch = (e) => {
        if (!e.touches || e.touches.length !== 2) return;
        pinch.active = true;
        pinch.startDist = getDistance(e.touches[0], e.touches[1]);
        // read current applied scale from transform
        const style = pdfFrame.style.transform || "";
        const m = style.match(/scale\(([^)]+)\)/);
        pinch.startScale = m ? parseFloat(m[1]) : 1;
        // prevent default browser handling
        e.preventDefault();
      };

      const onTouchMovePinch = (e) => {
        if (!pinch.active || !e.touches || e.touches.length !== 2) return;
        const curDist = getDistance(e.touches[0], e.touches[1]);
        const ratio = curDist / (pinch.startDist || curDist || 1);
        let newScale = pinch.startScale * ratio;
        newScale = Math.max(pinch.minScale, Math.min(pinch.maxScale, newScale));
        pdfFrame.style.transform = `scale(${newScale})`;
        // while pinching, prevent page-level pinch/scroll
        e.preventDefault();
      };

      const onTouchEndPinch = (e) => {
        if (!pinch.active) return;
        if (!e.touches || e.touches.length < 2) {
          // if scale fell below 1, reset to 1
          const s = parseFloat((pdfFrame.style.transform.match(/scale\(([^)]+)\)/) || [0, 1])[1]);
          if (s < 1.02) {
            pdfFrame.style.transform = "scale(1)";
          }
          pinch.active = false;
        }
      };

      // store handlers so we can remove them on close
      overlay.__pdfPinchHandlers = {
        start: onTouchStartPinch,
        move: onTouchMovePinch,
        end: onTouchEndPinch,
      };

      overlay.addEventListener("touchstart", onTouchStartPinch, { passive: false });
      overlay.addEventListener("touchmove", onTouchMovePinch, { passive: false });
      overlay.addEventListener("touchend", onTouchEndPinch, { passive: false });
    };

    const closeOverlay = () => {
      overlay.classList.remove("is-visible");
      document.body.style.removeProperty("overflow");
      overlay.removeEventListener("keydown", trapFocus);
      document.removeEventListener("keydown", handleEscape);
      // remove touch guard
      if (overlay.__pdfTouchGuard) {
        overlay.removeEventListener("touchstart", overlay.__pdfTouchGuard);
        delete overlay.__pdfTouchGuard;
      }
      // remove pinch handlers
      if (overlay.__pdfPinchHandlers) {
        overlay.removeEventListener("touchstart", overlay.__pdfPinchHandlers.start);
        overlay.removeEventListener("touchmove", overlay.__pdfPinchHandlers.move);
        overlay.removeEventListener("touchend", overlay.__pdfPinchHandlers.end);
        delete overlay.__pdfPinchHandlers;
      }

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

    // If on a small/mobile screen, open the PDF directly in a new tab instead
    // of showing the in-page iframe overlay. On larger screens keep the
    // existing overlay behavior so desktop users keep the same UX.
    triggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();

        // Define small screen breakpoint — matches common mobile widths.
        const isSmallScreen = window.matchMedia && window.matchMedia("(max-width: 767px)").matches;

        if (isSmallScreen) {
          // If we have a PDF URL, open it in a new tab/window. Use a user-initiated
          // click to avoid popup blockers. Null out opener for security when possible.
          if (pdfSrc) {
            const win = window.open(pdfSrc, "_blank");
            try {
              if (win) win.opener = null;
            } catch (e) {
              // ignore if setting opener is not allowed
            }
            return;
          }
          // If no pdfSrc is available, fall back to overlay as a graceful degrade.
        }

        // Default: open the in-page overlay (desktop/tablet behavior).
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

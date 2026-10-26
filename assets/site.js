// Page motion: scroll reveals, headline lines, highlighter, count-up, header rule.
(function () {
  var root = document.documentElement;
  root.classList.add("js");
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var header = document.querySelector(".site-header");
  function onScroll() {
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function countUp(el) {
    var target = parseFloat(el.dataset.count);
    var prefix = el.dataset.prefix || "";
    var suffix = el.dataset.suffix || "";
    if (reduced || !target) return;
    var start = null;
    var dur = 1400;
    function tick(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function reveal(el) {
    el.classList.add("is-in");
    el.querySelectorAll("[data-count]").forEach(countUp);
  }

  var targets = document.querySelectorAll("[data-reveal], .lines, [data-steps]");
  if (!("IntersectionObserver" in window)) {
    targets.forEach(reveal);
    return;
  }

  // Stagger siblings that enter together.
  var io = new IntersectionObserver(function (entries) {
    var batch = entries.filter(function (e) { return e.isIntersecting; });
    batch.forEach(function (e, i) {
      var el = e.target;
      if (!reduced) {
        el.style.transitionDelay = Math.min(i * 80, 320) + "ms";
        setTimeout(function () { el.style.transitionDelay = ""; }, 1400);
      }
      reveal(el);
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

  targets.forEach(function (el) { io.observe(el); });
})();

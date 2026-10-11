/**
 * Webflow + GSAP base: attribute-driven scroll reveals that respect reduced motion and breakpoints.
 *
 * Load order (Project Settings > Custom code, footer, before this file):
 *   gsap.min.js, ScrollTrigger.min.js   (both with defer, loaded once)
 * Put snippets/head.html in the site <head> so elements do not flash before they animate.
 *
 * Markup, set as custom attributes in the Designer (no classes, so Client-First stays clean):
 *   data-anim="fade-up" | "fade" | "scale"     animate this element when it scrolls into view
 *   data-anim="stagger"                        animate this element's direct children one after another
 *   data-anim-delay="0.2"                      optional delay in seconds
 */
(function () {
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    document.documentElement.classList.remove('wf-anim'); // never leave content hidden if the libraries failed to load
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  var REVEALS = {
    'fade-up': { y: 40, autoAlpha: 0 },
    fade: { autoAlpha: 0 },
    scale: { scale: 0.92, autoAlpha: 0 },
  };

  function reveal(el, vars, targets) {
    gsap.from(targets || el, Object.assign({}, vars, {
      duration: 0.8,
      ease: 'power3.out',
      delay: parseFloat(el.getAttribute('data-anim-delay')) || 0,
      stagger: targets ? 0.1 : 0,
      scrollTrigger: { trigger: el, start: 'top 85%', once: true },
    }));
  }

  function init() {
    var mm = gsap.matchMedia();

    mm.add(
      { reduce: '(prefers-reduced-motion: reduce)', motion: '(prefers-reduced-motion: no-preference)' },
      function (context) {
        var elements = gsap.utils.toArray('[data-anim]');
        if (context.conditions.reduce) {
          // Reduced motion: show everything, animate nothing.
          gsap.set(elements, { clearProps: 'all', autoAlpha: 1 });
          return;
        }
        elements.forEach(function (el) {
          var type = el.getAttribute('data-anim');
          if (type === 'stagger') reveal(el, REVEALS['fade-up'], el.children);
          else reveal(el, REVEALS[type] || REVEALS['fade-up']);
        });
        // matchMedia reverts everything created in this function when the condition stops matching.
      }
    );

    // Web fonts change layout; trigger positions must be recalculated once they have loaded.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    document.documentElement.classList.remove('wf-anim');
  }

  window.Webflow = window.Webflow || [];
  window.Webflow.push(init);
})();

// promo-band-anim.ts
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

export function initPromoAndBand() {
  const root = document.body;
  const ctx = gsap.context(() => {
    // --- PROMO: exact Vue behavior (desktop only) ---
    ScrollTrigger.matchMedia({
      "(min-width: 1101px)": () => {
        const card = document.querySelector<HTMLElement>(".promo-card");
        if (!card) return;

        // Vue pre-state
        gsap.set(card, { transformPerspective: 0, rotationX: 90 });

        // Vue trigger/toggles
        gsap.to(card, {
          rotationX: 0,
          scrollTrigger: {
            trigger: card,
            start: "bottom bottom",
            toggleActions: "play none none none",
          },
        });
      },

      // <=1100px: do nothing (same as your Vue fallback)
      "all": () => {
        const card = document.querySelector<HTMLElement>(".promo-card");
        if (!card) return;
        if (window.matchMedia("(max-width:1100px)").matches) {
          gsap.set(card, { clearProps: "transform,transformPerspective" });
        }
      },
    });

    // --- BAND reveals (unchanged) ---
    const chip = document.querySelector<HTMLElement>(".band .chip");
    if (chip) {
      gsap.from(chip, {
        x: -100,
        autoAlpha: 0,
        duration: 1,
        ease: "power2.out",
        scrollTrigger: { trigger: chip, start: "top bottom", once: true },
      });
    }

    const title = document.querySelector<HTMLElement>(".band-copy h2");
    if (title) {
      gsap.from(title, {
        y: 20,
        autoAlpha: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: { trigger: title, start: "top 90%", once: true },
      });
    }

    const grid = document.querySelector<HTMLElement>(".band-grid");
    const gridItems = gsap.utils.toArray<HTMLElement>(".band-grid > div");
    if (grid && gridItems.length) {
      gsap.from(gridItems, {
        x: -100,
        autoAlpha: 0,
        duration: 1,
        ease: "power2.out",
        stagger: 0.12,
        scrollTrigger: { trigger: grid, start: "top bottom", once: true },
      });
    }

    const bandShot = document.querySelector<HTMLElement>(".band-shot img");
    if (bandShot) {
      gsap.from(bandShot, {
        scale: 0.965,
        autoAlpha: 0,
        duration: 0.9,
        ease: "power2.out",
        scrollTrigger: { trigger: bandShot, start: "top 90%", once: true },
      });
    }

    // Reduced motion: reveal statically
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ScrollTrigger.getAll().forEach((t) => t.kill());
      gsap.set(
        ".promo-card, .band .chip, .band-copy h2, .band-grid > div, .band-shot img",
        { clearProps: "all", autoAlpha: 1, x: 0, y: 0, scale: 1, rotationX: 0 }
      );
    }
  }, root);

  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener("load", refresh);
  (document as any).fonts?.ready?.then?.(refresh);

  return () => {
    window.removeEventListener("load", refresh);
    ctx.revert();
  };
}

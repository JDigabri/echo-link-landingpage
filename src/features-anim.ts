// features-anim.ts
import gsap from "gsap";
import ScrollTrigger from "gsap/ScrollTrigger";
gsap.registerPlugin(ScrollTrigger);

export function initFeaturePods() {
  const pods = gsap.utils.toArray<HTMLElement>("#features .pod, #features .podr");
  if (!pods.length) return;

  // prevent flicker if user scrolls fast
  pods.forEach(pod => {
    const img = pod.querySelector<HTMLImageElement>(".circle img");
    const content = pod.querySelector<HTMLElement>(".pod-content");
    gsap.set([img, content], { autoAlpha: 0 });
  });

  pods.forEach((pod) => {
    const img = pod.querySelector(".circle img") as HTMLElement | null;
    const content = pod.querySelector(".pod-content") as HTMLElement | null;
    const fromX = pod.classList.contains("pod") ? 100 : -100; // mirror slide

    if (img) {
      gsap.fromTo(img,
        { scale: 0, autoAlpha: 0 },
        {
          scale: 1,
          autoAlpha: 1,
          ease: "back.out(1.4)",
          duration: 0.8,
          scrollTrigger: {
            trigger: pod,
            start: "top bottom",
            once: true
          }
        }
      );
    }

    if (content) {
      gsap.fromTo(content,
        { x: fromX, autoAlpha: 0 },
        {
          x: 0,
          autoAlpha: 1,
          ease: "power3.out",
          duration: 0.9,
          delay: 0.1,
          scrollTrigger: {
            trigger: pod,
            start: "top bottom",
            once: true
          }
        }
      );
    }
  });

  // Honor reduced motion
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    ScrollTrigger.getAll().forEach(t => t.kill());
    gsap.set("#features .pod, #features .podr .pod-content, #features .circle img", { clearProps: "all" });
  }

  // Refresh after images load
  window.addEventListener("load", () => ScrollTrigger.refresh());
}

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type Shot = { src: string; caption: string };

// Every photo on the open page, in page order, so the lightbox can step
// through them. Read from the DOM so pages don't have to register photos.
export function pagePhotos(from: Element): Shot[] {
  const root = from.closest(".page") ?? document;
  return [...root.querySelectorAll<HTMLImageElement>("img.photo-img")].map((img) => ({
    src: img.getAttribute("src") ?? "",
    caption: img.alt,
  }));
}

// A full-screen view of one photo. Uses a modal <dialog>, which keeps focus
// inside it and sits above everything else on the page.
export default function Lightbox({ shots, start, onClose }: { shots: Shot[]; start: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const swipe = useRef<number | null>(null);
  const shot = shots[i];
  const many = shots.length > 1;
  const go = (d: number) => setI((n) => (n + d + shots.length) % shots.length);

  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    document.documentElement.classList.add("lightbox-open");
    return () => {
      document.documentElement.classList.remove("lightbox-open");
      if (d.open) d.close();
    };
  }, []);

  // Preload the neighbours so stepping through is instant.
  useEffect(() => {
    if (!many) return;
    for (const d of [-1, 1]) new Image().src = shots[(i + d + shots.length) % shots.length].src;
  }, [i, many, shots]);

  function keys(e: KeyboardEvent) {
    if (e.key === "Escape") {
      // Handled here so the page underneath doesn't close as well.
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (many && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      e.preventDefault();
      go(e.key === "ArrowRight" ? 1 : -1);
    }
  }

  function swipeEnd(e: PointerEvent) {
    if (swipe.current === null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (many && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
  }

  return (
    <dialog
      ref={dialog}
      className="lightbox"
      aria-label={shot.caption || "Photo"}
      onKeyDown={keys}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // A click on the dark surround (not the photo or a button) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <figure
        onClick={(e) => e.target === e.currentTarget && onClose()}
        onPointerDown={(e) => e.pointerType !== "mouse" && (swipe.current = e.clientX)}
        onPointerUp={swipeEnd}
        onPointerCancel={() => (swipe.current = null)}
      >
        <img src={shot.src} alt={shot.caption} />
        <figcaption>
          {many && <span className="lightbox-count">{i + 1} / {shots.length}</span>}
          {shot.caption}
        </figcaption>
      </figure>
      <button type="button" className="lightbox-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      {many && (
        <>
          <button type="button" className="lightbox-nav prev" aria-label="Previous photo" onClick={() => go(-1)}>
            ‹
          </button>
          <button type="button" className="lightbox-nav next" aria-label="Next photo" onClick={() => go(1)}>
            ›
          </button>
        </>
      )}
    </dialog>
  );
}

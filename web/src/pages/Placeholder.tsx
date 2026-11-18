import { useState, type ReactNode } from "react";
import Lightbox, { pagePhotos, type Shot } from "./Lightbox";

// A photo with a caption. Leave `src` empty to show a placeholder box; to use
// a real picture, put the file in web/public/photos/ and set
// src="/photos/<file name>". Clicking a photo opens it full size, with the
// other photos on the same page a swipe or arrow key away.

// `credit` adds an attribution line under the caption; `side` floats a
// portrait picture beside the text at its natural shape instead of cropping it.
export function Photo({
  src,
  caption,
  credit,
  wide,
  side,
}: {
  src?: string;
  caption?: string;
  credit?: string;
  wide?: boolean;
  side?: boolean;
}) {
  const [open, setOpen] = useState<{ shots: Shot[]; start: number } | null>(null);

  return (
    <figure className={["photo", wide && "wide", side && "side"].filter(Boolean).join(" ")}>
      {src ? (
        <button
          type="button"
          className="photo-open"
          aria-label={caption ? `Enlarge photo: ${caption}` : "Enlarge photo"}
          onClick={(e) => {
            const img = e.currentTarget.querySelector("img")!;
            const shots = pagePhotos(e.currentTarget);
            const all = [...(e.currentTarget.closest(".page") ?? document).querySelectorAll("img.photo-img")];
            setOpen({ shots, start: Math.max(0, all.indexOf(img)) });
          }}
        >
          <img className="photo-img" src={src} alt={[caption, credit].filter(Boolean).join(". ")} loading="lazy" />
        </button>
      ) : (
        <div className="photo-slot" role="img" aria-label="Photo placeholder">
          Photo
        </div>
      )}
      {(caption || credit) && (
        <figcaption>
          {caption}
          {credit && <span className="photo-credit">{credit}</span>}
        </figcaption>
      )}
      {open && <Lightbox shots={open.shots} start={open.start} onClose={() => setOpen(null)} />}
    </figure>
  );
}

// One line of a spec table: the part on the left, its spec on the right.
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

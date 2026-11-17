// Stand-ins until the real words and photos are written in.

export function PhotoSlot({ caption, wide }: { caption?: string; wide?: boolean }) {
  return (
    <figure className={wide ? "photo wide" : "photo"}>
      <div className="photo-slot" role="img" aria-label="Photo placeholder">
        Photo
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function Lorem({ lines = 3 }: { lines?: number }) {
  const text =
    "Placeholder text. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
  return <p className="placeholder-text">{lines > 2 ? `${text} ${text}` : text}</p>;
}

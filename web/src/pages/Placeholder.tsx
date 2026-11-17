// A photo with a caption. Leave `src` empty to show a placeholder box; to use
// a real picture, put the file in web/public/photos/ and set
// src="/photos/<file name>".

export function Photo({ src, caption, wide }: { src?: string; caption?: string; wide?: boolean }) {
  return (
    <figure className={wide ? "photo wide" : "photo"}>
      {src ? (
        <img className="photo-img" src={src} alt={caption ?? ""} loading="lazy" />
      ) : (
        <div className="photo-slot" role="img" aria-label="Photo placeholder">
          Photo
        </div>
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

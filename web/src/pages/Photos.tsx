import { PhotoSlot } from "./Placeholder";

export default function Photos() {
  return (
    <>
      <h1>Photos</h1>
      <div className="photo-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <PhotoSlot key={i} caption={`Caption ${i + 1}`} />
        ))}
      </div>
    </>
  );
}

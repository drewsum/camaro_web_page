import { Lorem, PhotoSlot } from "./Placeholder";

export default function Overview() {
  return (
    <>
      <h1>1968 Camaro SS</h1>
      <PhotoSlot wide caption="Caption" />
      <Lorem />
      <h2>History</h2>
      <Lorem />
      <h2>Exterior</h2>
      <Lorem />
      <PhotoSlot wide caption="Caption" />
      <h2>Interior</h2>
      <Lorem />
      <h2>Drivetrain and suspension</h2>
      <Lorem />
    </>
  );
}

import { Photo } from "./Placeholder";

export default function Overview() {
  return (
    <>
      <h1>1968 Camaro SS</h1>

      <Photo wide src="" caption="Caption" />

      <p>Thanks for checking out my prized 1968 Camaro SS!</p>

      <h2>History</h2>
      <p>I believe the car is a true super-sport. It would have been built with a 396 Chevy Big Block. It is still the true Matador Red color. It was built with a red interior, but has been changed to black leather. I tracked it down in Joliet, Illinois</p>

      <h2>Class</h2>
      <p>None, and lots, somehow at the same time</p>

      <h2>Exterior</h2>
      <p>2" cowl hood, rally wheels, true black big block rear panel, painted sometime in the mid 2000's</p>

      <Photo wide src="" caption="Caption" />

      <h2>Interior</h2>
      <p>I've rebuilt most of the interior. The entire car has soundproofing and thermal barrier. The dash and gauges all work. The 1968 model year had the unique in-dash clock inside the tachometer. I've added a retrosound 4 channel stereo, which looks period correct but adds bluetooth. Ive retrofitted the dah with an in-dash shift light</p>

      <h2>Special Features</h2>
      <table className="sheet">
        <tbody>
          <Row label="Engine">Custom built and tuned 540ci Gen VI Chevy Big Block (see Engine Build!)</Row>
          <Row label="Clutch">Hydraulic Clutch conversion, RAM clutch</Row>
          <Row label="Transmission">Muncie 4-speed close ratio M22 Rock Crusher</Row>
          <Row label="Driveshaft">Custom truck driveshaft with Muncie to Dana 60 conversion U joints</Row>
          <Row label="Rear End">Strange Engineering Dana 60 ("Strange 60"). ~3.91 gears</Row>
          <Row label="Brakes">Wilwood dual-cylinder Disc Brakes. Hydroboost hydraulic brake booster (No brake fade under low vacuum!)</Row>
          <Row label="Suspension">OEM front suspension. Drag shocks in the rear. Caltrack traction bars link rear end and leaf springs, eliminating axle hop</Row>
          <Row label="Chassis">Bolt-on subframe connectors</Row>
        </tbody>
      </table>
    </>
  );
}

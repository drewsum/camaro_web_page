import CamProfileChart from "./CamProfileChart";
import DynoChart from "./DynoChart";
import { Photo, Row } from "./Placeholder";

export default function EngineBuild() {
  return (
    <>
      <h1>Engine build</h1>

      <Photo wide src="/photos/48.jpeg" caption="Completed engine rebuild on the dyno" />

      <Photo wide src="/photos/38.jpeg" caption="Completed short block with ARP head studs" />

      <h2>Short block</h2>
      <table className="sheet">
        <tbody>
          <Row label="Block">Gen VI Chevrolet Big Block</Row>
          <Row label="Bore × stroke">4.5" x 4.25"</Row>
          <Row label="Displacement">540 Cubic Inch</Row>
          <Row label="Crankshaft">Scat Forged Steel, Internally Balanced</Row>
          <Row label="Main Caps">4-bolt, installed with ARP Main Studs</Row>
          <Row label="Rods">Scat Forged Steel, H-Beam</Row>
          <Row label="Pistons">Mahle Forged Aluminum, Flat Top</Row>
          <Row label="Rings">Mahle, 2 compression/1 Oil</Row>
          <Row label="Compression ratio">~9.4:1</Row>
          <Row label="Oiling">Moroso deep drag oil pan, customized to fit an F-body. Moroso billet oil pump. Moroso windage tray</Row>
          
        </tbody>
      </table>

      <Photo wide src="/photos/43.jpeg" caption="Installed AFR 2110 heads with valve train" />

      <h2>Top end</h2>
      <table className="sheet">
        <tbody>
          <Row label="Cylinder Heads">Air Flow Research 2110: 345cc Rectangular Port, 117cc Chamber. 401CFM</Row>
          <Row label="Valves">AFR 2.3" Intake, AFR 1.88" Exhaust</Row>
          <Row label="Valve springs">Comp Cams G2, 140 lbs on seat. Undersprung, these need to be stiffened</Row>
          <Row label="Rocker arms">Harland Sharp Roller Rockers</Row>
          <Row label="Lifters">Comp Cams OEM Hydraulic Roller</Row>
          <Row label="Pushrods">Trick Flow Chromoly, 0.08" wall</Row>
          <Row label="Camshaft">Comp Cams custom grind, hydraulic roller</Row>
          <Row label="Lift / duration">0.622"/242 degrees intake, 0.619"/250 degrees exhaust. 292 degrees intake/302 degrees exhaust advertised</Row>
          <Row label="Lobe separation">110 degrees</Row>
          <Row label="Head Attachment">ARP Head Studs</Row>
        </tbody>
      </table>

      <h2>Cam profile</h2>
      <CamProfileChart />

      <h2>Induction and fuel</h2>
      <table className="sheet">
        <tbody>
          <Row label="Intake manifold">Air Flow Research Dual Plane</Row>
          <Row label="Carburetor">Quick Fuel Technologies 850cfm Double Pumper (will be changing soon)</Row>
          <Row label="Fuel pump">Electric</Row>
          <Row label="Induction">Naturally aspirated, with plans to supercharge eventually</Row>
        </tbody>
      </table>

      <h2>Ignition</h2>
      <table className="sheet">
        <tbody>
          <Row label="Distributor">MSD HEI Distributor</Row>
          <Row label="Plug wires">Taylor Custom</Row>
          <Row label="Timing">Mechanical only</Row>
        </tbody>
      </table>

      <h2>Exhaust</h2>
      <table className="sheet">
        <tbody>
          <Row label="Headers">Hooker Headers</Row>
          <Row label="Pipe diameter">3.25"</Row>
          <Row label="Mufflers">Magnaflow, true-dual</Row>
        </tbody>
      </table>

      <h2>Output</h2>
      <DynoChart />
      <table className="sheet">
        <tbody>
          <Row label="Horsepower">610 HP at 5400 rpm</Row>
          <Row label="Torque">615 ft-lbs at 4400 rpm</Row>
          <Row label="Dyno date">April 11th, 2026, Performance Engine and Machine, Middleton, WI</Row>
        </tbody>
      </table>

      <h2>Notes</h2>
      <p>This engine started as a ZZ502 Chevy crate engine, built in the early 2000s. All that remains is the engine block.</p>
    </>
  );
}

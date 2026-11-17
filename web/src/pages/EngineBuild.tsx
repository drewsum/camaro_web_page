import type { ReactNode } from "react";
import { Photo } from "./Placeholder";

// One line of the build sheet: the part on the left, its spec on the right.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

export default function EngineBuild() {
  return (
    <>
      <h1>Engine build</h1>

      <Photo wide src="" caption="Caption" />

      <p>Placeholder text. An overview of the engine and the goals of the build.</p>

      <h2>Short block</h2>
      <table className="sheet">
        <tbody>
          <Row label="Block">TBD</Row>
          <Row label="Bore × stroke">TBD</Row>
          <Row label="Displacement">TBD</Row>
          <Row label="Crankshaft">TBD</Row>
          <Row label="Rods">TBD</Row>
          <Row label="Pistons">TBD</Row>
          <Row label="Rings">TBD</Row>
          <Row label="Compression ratio">TBD</Row>
        </tbody>
      </table>

      <h2>Top end</h2>
      <table className="sheet">
        <tbody>
          <Row label="Cylinder heads">TBD</Row>
          <Row label="Valves">TBD</Row>
          <Row label="Valve springs">TBD</Row>
          <Row label="Rocker arms">TBD</Row>
          <Row label="Pushrods">TBD</Row>
          <Row label="Camshaft">TBD</Row>
          <Row label="Lift / duration">TBD</Row>
          <Row label="Lobe separation">TBD</Row>
        </tbody>
      </table>

      <h2>Induction and fuel</h2>
      <table className="sheet">
        <tbody>
          <Row label="Intake manifold">TBD</Row>
          <Row label="Carburetor / injection">TBD</Row>
          <Row label="Fuel pump">TBD</Row>
          <Row label="Air cleaner">TBD</Row>
        </tbody>
      </table>

      <h2>Ignition</h2>
      <table className="sheet">
        <tbody>
          <Row label="Distributor">TBD</Row>
          <Row label="Coil">TBD</Row>
          <Row label="Plug wires">TBD</Row>
          <Row label="Spark plugs">TBD</Row>
          <Row label="Timing">TBD</Row>
        </tbody>
      </table>

      <h2>Exhaust</h2>
      <table className="sheet">
        <tbody>
          <Row label="Headers">TBD</Row>
          <Row label="Pipe diameter">TBD</Row>
          <Row label="Mufflers">TBD</Row>
        </tbody>
      </table>

      <h2>Output</h2>
      <table className="sheet">
        <tbody>
          <Row label="Horsepower">TBD</Row>
          <Row label="Torque">TBD</Row>
          <Row label="Dyno date">TBD</Row>
        </tbody>
      </table>

      <h2>Notes</h2>
      <p>Placeholder text. Break-in, tuning, and anything else worth noting.</p>
    </>
  );
}

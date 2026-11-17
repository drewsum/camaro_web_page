import { Lorem, PhotoSlot } from "./Placeholder";

// The build sheet: one table per group of parts, values to be filled in.
const SHEET: [string, string[]][] = [
  ["Short block", ["Block", "Bore × stroke", "Displacement", "Crankshaft", "Rods", "Pistons", "Rings", "Compression ratio"]],
  ["Top end", ["Cylinder heads", "Valves", "Valve springs", "Rocker arms", "Pushrods", "Camshaft", "Lift / duration", "Lobe separation"]],
  ["Induction and fuel", ["Intake manifold", "Carburetor / injection", "Fuel pump", "Air cleaner"]],
  ["Ignition", ["Distributor", "Coil", "Plug wires", "Spark plugs", "Timing"]],
  ["Exhaust", ["Headers", "Pipe diameter", "Mufflers"]],
  ["Output", ["Horsepower", "Torque", "Dyno date"]],
];

export default function EngineBuild() {
  return (
    <>
      <h1>Engine build</h1>
      <PhotoSlot wide caption="Caption" />
      <Lorem />
      {SHEET.map(([group, rows]) => (
        <section key={group}>
          <h2>{group}</h2>
          <table className="sheet">
            <tbody>
              {rows.map((r) => (
                <tr key={r}>
                  <th scope="row">{r}</th>
                  <td>TBD</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <h2>Notes</h2>
      <Lorem />
    </>
  );
}

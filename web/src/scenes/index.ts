import { lazy, type ComponentType } from "react";
import ShowroomScene from "./ShowroomScene";
import { CREDITS, type Credit } from "./credits";

export interface SceneProps {
  lightsOn: boolean;
  domeOn: boolean;
  night?: boolean; // after dark: a moonlit sky and the street lights on
}

export interface SceneDef {
  id: string;
  label: string;
  Component: ComponentType<SceneProps>;
  night: boolean; // night scenes always run with the car's lights on
  nightOption?: boolean; // offers a Night tickbox (see SceneProps.night)
  credits?: Credit[]; // third-party assets the scene loads
}

// Environments offered in the scene dropdown. The first one is the default.
export const SCENES: SceneDef[] = [
  { id: "showroom", label: "Showroom", Component: ShowroomScene, night: false },
  { id: "coast", label: "Coastal highway", Component: lazy(() => import("./CoastScene")), night: false, nightOption: true, credits: [CREDITS.polyHaven] },
  { id: "mountain", label: "Mountain pass", Component: lazy(() => import("./MountainScene")), night: false, nightOption: true, credits: [CREDITS.polyHaven] },
  { id: "desert", label: "Desert two-lane", Component: lazy(() => import("./DesertScene")), night: false, nightOption: true, credits: [CREDITS.polyHaven] },
  { id: "saltflats", label: "Salt flats", Component: lazy(() => import("./SaltFlatsScene")), night: false, credits: [CREDITS.polyHaven] },
  { id: "drag", label: "Drag strip", Component: lazy(() => import("./DragScene")), night: false, nightOption: true, credits: [CREDITS.mach1, CREDITS.polyHaven] },
  {
    id: "capitol",
    label: "Capitol Square",
    Component: lazy(() => import("./CapitolScene")),
    night: false,
    nightOption: true,
    credits: [CREDITS.osm, CREDITS.elevation, CREDITS.polyHaven],
  },
  {
    id: "carshow",
    label: "Car show",
    Component: lazy(() => import("./CarShowScene")),
    night: false,
    credits: [CREDITS.challenger, CREDITS.charger, CREDITS.mach1, CREDITS.quaternius, CREDITS.polyHaven],
  },
  {
    id: "gasstation",
    label: "Old gas station",
    Component: lazy(() => import("./GasStationScene")),
    night: false,
    nightOption: true,
    credits: [CREDITS.mach1, CREDITS.polyHaven],
  },
  {
    id: "drivein",
    label: "Drive-in theater",
    Component: lazy(() => import("./DriveInScene")),
    night: false, // always night, but headlights off for the show unless asked
    credits: [CREDITS.challenger, CREDITS.charger, CREDITS.mach1, CREDITS.polyHaven],
  },
  {
    id: "burnout",
    label: "Burnout contest",
    Component: lazy(() => import("./BurnoutScene")),
    night: false,
    nightOption: true,
    credits: [CREDITS.challenger, CREDITS.charger, CREDITS.mach1, CREDITS.polyHaven],
  },
  {
    id: "goldengate",
    label: "Golden Gate Bridge",
    Component: lazy(() => import("./GoldenGateScene")),
    night: false,
    nightOption: true,
    credits: [CREDITS.mach1, CREDITS.charger, CREDITS.polyHaven],
  },
  { id: "outrun", label: "Outrun grid", Component: lazy(() => import("./OutrunScene")), night: true },
];

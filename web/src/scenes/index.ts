import { lazy, type ComponentType } from "react";
import ShowroomScene from "./ShowroomScene";
import { CREDITS, type Credit } from "./credits";

export interface SceneProps {
  lightsOn: boolean;
  domeOn: boolean;
}

export interface SceneDef {
  id: string;
  label: string;
  Component: ComponentType<SceneProps>;
  night: boolean; // night scenes always run with the car's lights on
  credits?: Credit[]; // third-party assets the scene loads
}

// Environments offered in the scene dropdown. The first one is the default.
export const SCENES: SceneDef[] = [
  { id: "showroom", label: "Showroom", Component: ShowroomScene, night: false },
  { id: "coast", label: "Coastal highway", Component: lazy(() => import("./CoastScene")), night: false, credits: [CREDITS.polyHaven] },
  { id: "drag", label: "Drag strip", Component: lazy(() => import("./DragScene")), night: false, credits: [CREDITS.mustang, CREDITS.polyHaven] },
  {
    id: "capitol",
    label: "Capitol Square",
    Component: lazy(() => import("./CapitolScene")),
    night: false,
    credits: [CREDITS.osm, CREDITS.elevation, CREDITS.polyHaven],
  },
  {
    id: "carshow",
    label: "Car show",
    Component: lazy(() => import("./CarShowScene")),
    night: false,
    credits: [CREDITS.chevelle, CREDITS.challenger, CREDITS.mustang, CREDITS.quaternius, CREDITS.polyHaven],
  },
  { id: "outrun", label: "Outrun grid", Component: lazy(() => import("./OutrunScene")), night: true },
];

import { lazy, type ComponentType } from "react";
import ShowroomScene from "./ShowroomScene";

export interface SceneProps {
  lightsOn: boolean;
}

export interface SceneDef {
  id: string;
  label: string;
  Component: ComponentType<SceneProps>;
  night: boolean; // night scenes always run with the car's lights on
}

// Environments offered in the scene dropdown. The first one is the default.
export const SCENES: SceneDef[] = [
  { id: "showroom", label: "Showroom", Component: ShowroomScene, night: false },
  { id: "outrun", label: "Outrun grid", Component: lazy(() => import("./OutrunScene")), night: true },
];

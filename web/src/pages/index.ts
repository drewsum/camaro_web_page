import type { ComponentType } from "react";
import Overview from "./Overview";
import Photos from "./Photos";
import EngineBuild from "./EngineBuild";
import EngineModel from "./EngineModel";

export interface PageDef {
  id: string; // also the URL hash, e.g. #photos
  label: string;
  Component: ComponentType;
  viewer?: boolean; // a full-screen 3D view of its own, shown in place of the car's
}

// Content pages, listed down the left side and opened over the 3D viewer.
export const PAGES: PageDef[] = [
  { id: "overview", label: "Overview", Component: Overview },
  { id: "photos", label: "Photos", Component: Photos },
  { id: "engine", label: "Engine Build", Component: EngineBuild },
  { id: "engine-model", label: "Engine Model", Component: EngineModel, viewer: true },
];

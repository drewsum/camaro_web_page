import type { ComponentType } from "react";
import Overview from "./Overview";
import Photos from "./Photos";
import EngineBuild from "./EngineBuild";

export interface PageDef {
  id: string; // also the URL hash, e.g. #photos
  label: string;
  Component: ComponentType;
}

// Content pages, listed down the left side and opened over the 3D viewer.
export const PAGES: PageDef[] = [
  { id: "overview", label: "Overview", Component: Overview },
  { id: "photos", label: "Photos", Component: Photos },
  { id: "engine", label: "Engine Build", Component: EngineBuild },
];

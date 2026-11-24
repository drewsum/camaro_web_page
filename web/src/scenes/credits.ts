// Third-party assets each scene loads at runtime, for the attribution line.
// The CC BY models require it; the CC0 ones (Poly Haven) don't,
// but are credited anyway.

export interface Credit {
  title: string;
  href: string;
  author?: string;
  license: string;
  licenseUrl?: string;
}

const CC_BY_NC_SA = "http://creativecommons.org/licenses/by-nc-sa/4.0/";

export const CREDITS = {
  charger: { title: "1969 Dodge Charger R/T", href: "https://sketchfab.com/3d-models/1969-dodge-charger-rt-261de8013c4e4fb0884a8106bd3212a7", author: "Ddiaz Design", license: "CC BY-NC-SA 4.0", licenseUrl: CC_BY_NC_SA },
  challenger: { title: "1970 Dodge Challenger R/T", href: "https://sketchfab.com/ddiaz-design", author: "Ddiaz Design", license: "CC BY-NC-SA 4.0", licenseUrl: CC_BY_NC_SA },
  mach1: { title: "1969 Ford Mustang Mach-1 428 Cobra Jet", href: "https://sketchfab.com/3d-models/1969-ford-mustang-mach-1-428-cobra-jet-679cdf81b9854759860b0afe9d1e4012", author: "Ddiaz Design", license: "CC BY-NC-SA 4.0", licenseUrl: CC_BY_NC_SA },
  polyHaven: { title: "Skies, plants and rocks", href: "https://polyhaven.com", author: "Poly Haven", license: "CC0" },
  osm: { title: "Map data", href: "https://www.openstreetmap.org/copyright", author: "OpenStreetMap contributors", license: "ODbL", licenseUrl: "https://opendatacommons.org/licenses/odbl/" },
  elevation: { title: "Elevation", href: "https://registry.opendata.aws/terrain-tiles/", author: "USGS 3DEP via AWS Terrain Tiles", license: "Public domain" },
} satisfies Record<string, Credit>;

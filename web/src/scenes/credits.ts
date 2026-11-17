// Third-party assets each scene loads at runtime, for the attribution line.
// The CC BY models require it; the CC0 ones (Poly Haven, Quaternius) don't,
// but are credited anyway.

export interface Credit {
  title: string;
  href: string;
  author?: string;
  license: string;
  licenseUrl?: string;
}

const CC_BY = "http://creativecommons.org/licenses/by/4.0/";
const CC_BY_NC_SA = "http://creativecommons.org/licenses/by-nc-sa/4.0/";

export const CREDITS = {
  chevelle: { title: "Chevrolet Chevelle SS", href: "https://sketchfab.com/890244234", author: "BadKarma™", license: "CC BY 4.0", licenseUrl: CC_BY },
  challenger: { title: "1970 Dodge Challenger R/T", href: "https://sketchfab.com/ddiaz-design", author: "Ddiaz Design", license: "CC BY-NC-SA 4.0", licenseUrl: CC_BY_NC_SA },
  mustang: { title: "'67 Mustang (High poly)", href: "https://sketchfab.com/nickbroad", author: "Nick Broad", license: "CC BY 4.0", licenseUrl: CC_BY },
  polyHaven: { title: "Skies, plants and rocks", href: "https://polyhaven.com", author: "Poly Haven", license: "CC0" },
  quaternius: { title: "Ultimate Modular Men", href: "https://quaternius.com", author: "Quaternius", license: "CC0" },
} satisfies Record<string, Credit>;

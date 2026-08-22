export interface Texture {
  name: string;
  url: string;
  thumbnail?: string;
}

export const TEXTURES: Texture[] = [
  { name: "No Texture", url: "" },
  { name: "Carbon Fiber", url: "/bg/carbonfibre/carbon-slice.svg" },
  { name: "Leather", url: "/bg/leather/leather-slice.svg" },
  { name: "Marble", url: "/bg/marble/marble-slice.svg" },
  { name: "Metal", url: "/bg/metal/metal-slice.svg" },
  { name: "Plastic", url: "/bg/plastic/plastic-slice.svg" },
  { name: "Wood", url: "/bg/wood/wood-slice.svg" },
];

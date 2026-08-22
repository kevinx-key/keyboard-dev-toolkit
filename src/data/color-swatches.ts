export interface ColorSwatch {
  name: string;
  hex: string;
}

export interface ColorSet {
  name: string;
  colors: ColorSwatch[];
}

export const COLOR_SWATCHES: ColorSet[] = [
  {
    name: "GMK / Uniqey Colors",
    colors: [
      { name: "CR (Black)", hex: "#111111" },
      { name: "WS1 (White)", hex: "#ffffff" },
      { name: "WS2 (Off White)", hex: "#f5f5dc" },
      { name: "WS3 (Cream)", hex: "#fffdd0" },
      { name: "WS4 (Beige)", hex: "#e8d5b4" },
      { name: "L9 (Bone)", hex: "#d9d1b8" },
      { name: "V2 (Light Gray)", hex: "#bfc1c2" },
      { name: "G3 (Medium Gray)", hex: "#b5b5b5" },
      { name: "G7 (Dark Gray)", hex: "#8b8b8b" },
      { name: "TU2 (Blue)", hex: "#3175b2" },
      { name: "V4 (Red)", hex: "#c41a1a" },
      { name: "DY (Yellow)", hex: "#edd400" },
      { name: "DZ (Orange)", hex: "#e65c00" },
      { name: "DA (Green)", hex: "#3c9b3c" },
      { name: "DV (Purple)", hex: "#8a5ead" },
      { name: "DT (Teal)", hex: "#008080" },
      { name: "N6 (Dark Blue)", hex: "#1a3a5c" },
      { name: "RO2 (Rose)", hex: "#e8a0a0" },
    ],
  },
  {
    name: "Signature Plastics ABS",
    colors: [
      { name: "YYW (Yellow)", hex: "#fedb5e" },
      { name: "RA (Red)", hex: "#d90000" },
      { name: "BFP (Blue)", hex: "#0088db" },
      { name: "GR (Green)", hex: "#00a651" },
      { name: "PUR (Purple)", hex: "#8b5cf6" },
      { name: "OR (Orange)", hex: "#ff6600" },
      { name: "WAN (Warm White)", hex: "#f5e6d0" },
      { name: "WCK (Cool White)", hex: "#e8e8e8" },
      { name: "GPA (Gray)", hex: "#a0a0a0" },
      { name: "GD (Dark Gray)", hex: "#666666" },
      { name: "BBJ (Black)", hex: "#1a1a1a" },
      { name: "RAS (Rose)", hex: "#e8a0b0" },
    ],
  },
  {
    name: "Signature Plastics PBT",
    colors: [
      { name: "RB (Royal Blue)", hex: "#3050f0" },
      { name: "RED", hex: "#d91010" },
      { name: "YEL (Yellow)", hex: "#f0d000" },
      { name: "GRN (Green)", hex: "#10a010" },
      { name: "ORG (Orange)", hex: "#f07000" },
      { name: "PPL (Purple)", hex: "#8030c0" },
      { name: "WHT (White)", hex: "#f0f0f0" },
      { name: "TBL (Ice Blue)", hex: "#90d0f0" },
      { name: "BGE (Beige)", hex: "#e8dcc8" },
      { name: "GRA (Gray)", hex: "#808080" },
      { name: "BLK (Black)", hex: "#202020" },
    ],
  },
  {
    name: "WASD Keyboards",
    colors: [
      { name: "Beige", hex: "#e8dcc4" },
      { name: "Light Gray", hex: "#c8c8c8" },
      { name: "Dark Gray", hex: "#888888" },
      { name: "Black", hex: "#222222" },
      { name: "Red", hex: "#cc0000" },
      { name: "Orange", hex: "#ff8800" },
      { name: "Yellow", hex: "#ffdd00" },
      { name: "Green", hex: "#44bb00" },
      { name: "Blue", hex: "#0066cc" },
      { name: "Purple", hex: "#8844cc" },
    ],
  },
];

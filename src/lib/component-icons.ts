/**
 * PCB 编辑器元件图标（Type-C / MCU）
 *
 * 由 docs/typec.svg、docs/mcu.svg（CorelDRAW 2020 导出）自动转换而来：
 *  - 坐标单位 = 0.01 mm（画稿原始单位），Y 轴向下，原点在画稿左上角
 *  - 保留画稿原渐变（defs 内 id 已加 tc-/mc- 前缀，避免两图标同处一个 SVG 时 id 冲突）
 *  - 保留画稿自带文字；仅用于 SVG 预览
 *  - Type-C 的 4 个「跑道圆」是真实 PCB 挖孔（见 TYPEC_HOLES）
 *
 * 重新生成：见提交说明 / docs（勿手改 markup / defs 内的坐标）
 */

export interface ComponentIcon {
  /** 渐变等 <defs> 内容（id 已加前缀） */
  defs: string;
  /** SVG 图形标记（画稿原始单位，Y 向下） */
  markup: string;
  /** 画稿视口宽（原始单位 = 0.01 mm） */
  viewW: number;
  /** 画稿视口高（原始单位 = 0.01 mm） */
  viewH: number;
}

/** Type-C 连接器（外壳 + 12 引脚 + TYPE-C 文字）。视口 956 × 795.9 → 9.56 × 7.959 mm */
export const TYPEC_ICON: ComponentIcon = {
  defs: `<linearGradient id="tcid0" gradientUnits="userSpaceOnUse" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
   <stop offset="0" style="stop-opacity:1; stop-color:#5F5D5D"/>
   <stop offset="1" style="stop-opacity:1; stop-color:#A3A3A4"/>
  </linearGradient>
  <linearGradient id="tcid1" gradientUnits="userSpaceOnUse" x1="25.89" y1="330.73" x2="917.22" y2="330.69">
   <stop offset="0" style="stop-opacity:1; stop-color:#828182"/>
   <stop offset="0.0588235" style="stop-opacity:1; stop-color:#F8F8F8"/>
   <stop offset="0.141176" style="stop-opacity:1; stop-color:#C9CACA"/>
   <stop offset="0.878431" style="stop-opacity:1; stop-color:#C9CACA"/>
   <stop offset="0.94902" style="stop-opacity:1; stop-color:#F8F8F8"/>
   <stop offset="1" style="stop-opacity:1; stop-color:#828182"/>
  </linearGradient>
  <linearGradient id="tcid2" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid3" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid4" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid5" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid6" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid7" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid8" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid9" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid10" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid11" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>
  <linearGradient id="tcid12" gradientUnits="userSpaceOnUse" href="#tcid0" x1="499.45" y1="676.89" x2="499.49" y2="795.89">
  </linearGradient>`,
  markup: `  <polygon points="668.36,671.88 668.36,795.89 628.36,795.89 628.36,671.88 " fill="url(#tcid10)"/>
  <polygon points="618.35,671.88 618.35,795.89 578.35,795.89 578.35,671.88 " fill="url(#tcid5)"/>
  <polygon points="568.36,671.88 568.36,795.89 528.36,795.89 528.36,671.88 " fill="url(#tcid9)"/>
  <polygon points="518.35,671.88 518.35,795.89 478.35,795.89 478.35,671.88 " fill="url(#tcid4)"/>
  <polygon points="468.36,671.88 468.36,795.89 428.36,795.89 428.36,671.88 " fill="url(#tcid8)"/>
  <polygon points="418.35,671.88 418.35,795.89 378.35,795.89 378.35,671.88 " fill="url(#tcid11)"/>
  <polygon points="368.36,671.88 368.36,795.89 328.36,795.89 328.36,671.88 " fill="url(#tcid6)"/>
  <polygon points="318.35,671.88 318.35,795.89 278.35,795.89 278.35,671.88 " fill="url(#tcid12)"/>
  <polygon points="268.35,671.88 268.35,795.89 198.35,795.89 198.35,671.88 " fill="url(#tcid0)"/>
  <polygon points="188.37,671.88 188.37,795.89 118.37,795.89 118.37,671.88 " fill="url(#tcid3)"/>
  <polygon points="748.36,671.88 748.36,795.89 678.36,795.89 678.36,671.88 " fill="url(#tcid2)"/>
  <polygon points="828.37,671.88 828.37,795.89 758.37,795.89 758.37,671.88 " fill="url(#tcid7)"/>
  <polygon points="26.36,0 920.36,0 920.36,676.89 26.36,676.89 " fill="url(#tcid1)"/>
  <path d="M141.84 408.07l0 -122.9 -45.9 0 0 -16.33 110.26 0 0 16.33 -45.89 0 0 122.9 -18.47 0zm133.44 0l0 -58.99 -53.67 -80.24 22.17 0 27.52 42.13c5.12,7.81 9.88,15.62 14.22,23.43 4.25,-7.29 9.4,-15.46 15.4,-24.53l26.96 -41.03 21.49 0 -55.61 80.24 0 58.99 -18.48 0zm101.26 0l0 -139.23 52.57 0c9.24,0 16.3,0.45 21.2,1.33 6.84,1.13 12.57,3.3 17.21,6.48 4.63,3.21 8.36,7.68 11.18,13.42 2.82,5.73 4.21,12.05 4.21,18.96 0,11.79 -3.76,21.81 -11.31,29.97 -7.52,8.2 -21.16,12.29 -40.87,12.29l-35.71 0 0 56.78 -18.48 0zm18.48 -73.12l35.97 0c11.93,0 20.36,-2.2 25.38,-6.64 4.99,-4.44 7.49,-10.66 7.49,-18.73 0,-5.81 -1.46,-10.8 -4.41,-14.94 -2.95,-4.15 -6.84,-6.91 -11.64,-8.24 -3.11,-0.81 -8.84,-1.23 -17.17,-1.23l-35.62 0 0 49.78zm122.42 73.12l0 -139.23 100.54 0 0 16.33 -82.06 0 0 42.78 76.81 0 0 16.34 -76.81 0 0 47.45 85.36 0 0 16.33 -103.84 0zm131.18 -41.81l0 -17.11 52.89 0 0 17.11 -52.89 0zm183.69 -7.03l18.47 4.67c-3.86,15.13 -10.79,26.64 -20.81,34.58 -10.01,7.94 -22.26,11.92 -36.75,11.92 -14.97,0 -27.16,-3.04 -36.56,-9.17 -9.4,-6.09 -16.53,-14.94 -21.42,-26.51 -4.89,-11.6 -7.36,-24.02 -7.36,-37.3 0,-14.49 2.76,-27.13 8.3,-37.92 5.54,-10.8 13.42,-19 23.63,-24.6 10.21,-5.61 21.45,-8.4 33.7,-8.4 13.94,0 25.64,3.54 35.1,10.63 9.5,7.1 16.11,17.05 19.84,29.89l-18.09 4.27c-3.21,-10.11 -7.9,-17.5 -14.03,-22.1 -6.13,-4.63 -13.84,-6.94 -23.14,-6.94 -10.66,0 -19.61,2.56 -26.77,7.69 -7.16,5.12 -12.22,12.02 -15.1,20.64 -2.92,8.65 -4.38,17.57 -4.38,26.74 0,11.83 1.72,22.17 5.15,30.98 3.44,8.85 8.79,15.43 16.05,19.81 7.26,4.37 15.1,6.54 23.56,6.54 10.3,0 18.99,-2.98 26.12,-8.91 7.13,-5.96 11.96,-14.78 14.49,-26.51z" fill="#8B8B8C" fill-rule="nonzero"/>`,
  viewW: 956,
  viewH: 795.9,
};

/**
 * Type-C 4 个「跑道圆」开孔（画稿原始单位: x, y, w, h, rx, ry），圆角为椭圆角。
 * 这些是**真实 PCB 挖孔**：进 SVG 预览（白孔）+ DXF 切割 + STP 挤出挖孔。
 */
export const TYPEC_HOLES: [number, number, number, number, number, number][] = [
  [-4.59, 174.8, 92.05, 168.13, 46.02, 49.23],
  [859.34, 174.8, 92.05, 168.13, 46.02, 49.23],
  [-4.59, 577.51, 92.05, 195.33, 46.02, 57.2],
  [859.34, 577.51, 92.05, 195.33, 46.02, 57.2],
];

/** MCU（芯片体 + 4 边引脚 + Pin1 圆点 + MCU 文字）。视口 933 × 933 → 9.33 × 9.33 mm */
export const MCU_ICON: ComponentIcon = {
  defs: `<linearGradient id="mcid0" gradientUnits="userSpaceOnUse" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
   <stop offset="0" style="stop-opacity:1; stop-color:#8B8B8C"/>
   <stop offset="0.258824" style="stop-opacity:1; stop-color:#8B8B8C"/>
   <stop offset="0.45098" style="stop-opacity:1; stop-color:#F8F8F8"/>
   <stop offset="0.831373" style="stop-opacity:1; stop-color:#828182"/>
   <stop offset="1" style="stop-opacity:1; stop-color:#5F5D5D"/>
  </linearGradient>
  <linearGradient id="mcid1" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid2" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid3" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid4" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid5" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid6" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid7" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid8" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid9" gradientUnits="objectBoundingBox" href="#mcid0" x1="49.9838%" y1="100%" x2="50.1134%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid10" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid11" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid12" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid13" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid14" gradientUnits="objectBoundingBox" href="#mcid0" x1="980.985%" y1="100%" x2="981.114%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid15" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid16" gradientUnits="objectBoundingBox" href="#mcid0" x1="0%" y1="100%" x2="0%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid17" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid18" gradientUnits="objectBoundingBox" href="#mcid0" x1="205.151%" y1="100%" x2="205.28%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid19" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid20" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid21" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid22" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid23" gradientUnits="objectBoundingBox" href="#mcid0" x1="0%" y1="100%" x2="0%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid24" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid25" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid26" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid27" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid28" gradientUnits="objectBoundingBox" href="#mcid0" x1="825.818%" y1="100%" x2="825.948%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid29" gradientUnits="objectBoundingBox" href="#mcid0" x1="0%" y1="100%" x2="0%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid30" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid31" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid32" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid33" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid34" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid35" gradientUnits="objectBoundingBox" href="#mcid0" x1="670.651%" y1="100%" x2="670.781%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid36" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid37" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid38" gradientUnits="userSpaceOnUse" x1="209.39" y1="725.13" x2="249.63" y2="684.34">
   <stop offset="0" style="stop-opacity:1; stop-color:#828182"/>
   <stop offset="1" style="stop-opacity:1; stop-color:#A3A3A4"/>
  </linearGradient>
  <linearGradient id="mcid39" gradientUnits="userSpaceOnUse" x1="717.46" y1="141.45" x2="-42.88" y2="1061.92">
   <stop offset="0" style="stop-opacity:1; stop-color:#6E6D6D"/>
   <stop offset="1" style="stop-opacity:1; stop-color:#FEFEFE"/>
  </linearGradient>
  <linearGradient id="mcid40" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid41" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid42" gradientUnits="userSpaceOnUse" href="#mcid0" x1="435.29" y1="810.28" x2="435.25" y2="927.82">
  </linearGradient>
  <linearGradient id="mcid43" gradientUnits="objectBoundingBox" href="#mcid0" x1="515.484%" y1="100%" x2="515.614%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid44" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid45" gradientUnits="userSpaceOnUse" href="#mcid0" x1="793.64" y1="498.65" x2="911.18" y2="498.69">
  </linearGradient>
  <linearGradient id="mcid46" gradientUnits="userSpaceOnUse" href="#mcid0" x1="124.1" y1="450.83" x2="6.56" y2="450.79">
  </linearGradient>
  <linearGradient id="mcid47" gradientUnits="objectBoundingBox" href="#mcid0" x1="360.317%" y1="100%" x2="360.447%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid48" gradientUnits="objectBoundingBox" href="#mcid0" x1="0%" y1="100%" x2="0%" y2="9.97243%">
  </linearGradient>
  <linearGradient id="mcid49" gradientUnits="objectBoundingBox" href="#mcid0" x1="0%" y1="100%" x2="0%" y2="9.97243%">
  </linearGradient>`,
  markup: `  <rect x="180.27" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid14)"/>
  <rect x="228.17" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid28)"/>
  <rect x="276.07" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid35)"/>
  <rect x="371.88" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid47)"/>
  <rect x="467.68" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid9)"/>
  <rect x="515.58" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid29)"/>
  <rect x="563.48" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid48)"/>
  <rect x="611.38" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid23)"/>
  <rect x="707.25" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid49)"/>
  <rect x="419.77" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid18)"/>
  <rect x="659.27" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid16)"/>
  <rect x="323.98" y="33.75" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid43)"/>
  <rect x="180.27" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid14)"/>
  <rect x="228.17" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid28)"/>
  <rect x="276.07" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid35)"/>
  <rect x="371.88" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid47)"/>
  <rect x="467.68" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid9)"/>
  <rect x="515.58" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid29)"/>
  <rect x="563.48" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid48)"/>
  <rect x="611.38" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid23)"/>
  <rect x="707.25" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid49)"/>
  <rect x="419.77" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid18)"/>
  <rect x="659.27" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid16)"/>
  <rect x="323.98" y="7.43" width="30.87" height="130.56" rx="15.44" ry="15.44" fill="url(#mcid43)"/>
  <path d="M124.1 738.23l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid7)"/>
  <path d="M124.1 690.33l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid32)"/>
  <path d="M124.1 642.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid4)"/>
  <path d="M124.1 546.63l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid37)"/>
  <path d="M124.1 450.83l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid6)"/>
  <path d="M124.1 402.93l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid21)"/>
  <path d="M124.1 355.03l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid5)"/>
  <path d="M124.1 307.13l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid20)"/>
  <path d="M124.1 211.26l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid15)"/>
  <path d="M124.1 498.73l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid22)"/>
  <path d="M124.1 259.23l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid33)"/>
  <path d="M124.1 594.53l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43z" fill="url(#mcid46)"/>
  <path d="M722.69 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid13)"/>
  <path d="M674.79 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid25)"/>
  <path d="M626.89 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid34)"/>
  <path d="M531.09 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid41)"/>
  <path d="M435.29 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid8)"/>
  <path d="M387.39 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid42)"/>
  <path d="M339.49 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid11)"/>
  <path d="M291.59 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid24)"/>
  <path d="M195.72 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid12)"/>
  <path d="M483.19 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid10)"/>
  <path d="M243.69 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid17)"/>
  <path d="M578.99 810.28l-0.01 0c-8.49,0 -15.43,6.94 -15.43,15.43l0 99.7c0,8.49 6.94,15.43 15.43,15.43l0.01 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -99.7c0,-8.49 -6.94,-15.43 -15.43,-15.43z" fill="url(#mcid40)"/>
  <path d="M793.64 211.25l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid44)"/>
  <path d="M793.64 259.15l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid2)"/>
  <path d="M793.64 307.05l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid36)"/>
  <path d="M793.64 402.85l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid27)"/>
  <path d="M793.64 498.65l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid26)"/>
  <path d="M793.64 546.55l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid1)"/>
  <path d="M793.64 594.45l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid30)"/>
  <path d="M793.64 642.35l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid0)"/>
  <path d="M793.64 738.22l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid45)"/>
  <path d="M793.64 450.75l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid3)"/>
  <path d="M793.64 690.25l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid19)"/>
  <path d="M793.64 354.95l0 0.01c0,8.49 6.94,15.43 15.43,15.43l99.7 0c8.49,0 15.43,-6.94 15.43,-15.43l0 -0.01c0,-8.49 -6.94,-15.43 -15.43,-15.43l-99.7 0c-8.49,0 -15.43,6.94 -15.43,15.43z" fill="url(#mcid31)"/>
  <rect x="109.2" y="124.73" width="700" height="700.01" rx="41.42" ry="45.1" fill="#5F5D5D"/>
  <rect x="124.2" y="139.74" width="670" height="669.99" rx="33.95" ry="36.96" fill="url(#mcid39)"/>
  <circle cx="214.79" cy="722.22" r="55.67" fill="url(#mcid38)"/>
  <text x="187.33" y="556.45" font-family="Arial, sans-serif" font-size="228.24" fill="#434343">MCU</text>`,
  viewW: 933,
  viewH: 933,
};

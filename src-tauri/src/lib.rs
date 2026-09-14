//! Keyboard Dev Toolkit — Tauri Rust 后端

//!

//! Supports:

//! - DXF → STP 3D model export through OpenCASCADE (cadrum)

//! - 3D model placement (hotswap sockets, Type-C, 4P connector, MCU)

use serde::{Deserialize, Serialize};

use cadrum::{Boolean, DVec3, Edge, Solid};

use tauri::Emitter;

// ═══════════════════════════════════════════════════════════════════

// Request / Response 类型

// ═══════════════════════════════════════════════════════════════════

/// 模型放置描述

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]

struct ModelPlacement {
    /// "hotswap" | "typec" | "4p"

    #[serde(rename = "type")]
    model_type: String,

    /// Position X in absolute mm (Y-up PCB coordinates)
    x: f64,

    /// Position Y in absolute mm (Y-up PCB coordinates, already negated)
    y: f64,

    /// Z-rotation in degrees
    rotation: f64,

    /// Z offset from PCB bottom (mm). Negative = below PCB.

    #[serde(default)]
    z_offset: f64,

    /// Flip 180° around X axis (for bottom-mounted components)

    #[serde(default)]
    flip: bool,
}

/// 前端传来的 2D 挤出几何数据

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]

struct StpExtrudeRequest {
    boundary: Vec<[f64; 2]>,

    #[serde(default)]
    poly_holes: Vec<Vec<[f64; 2]>>,

    #[serde(default)]
    circle_holes: Vec<[f64; 3]>,

    /// 额外 3D 模型放置

    #[serde(default)]
    model_placements: Vec<ModelPlacement>,
}

// ═══════════════════════════════════════════════════════════════════

// 编译时嵌入的 STEP 模型文件

// ═══════════════════════════════════════════════════════════════════

/// 热插拔轴座 3D 模型 (完整版——供手动下载)

#[allow(dead_code)]

const HOTSWAP_MODEL: &[u8] = include_bytes!("../models/hotswap-3d.stp");

/// 热插拔轴座 3D 模型 (简化版——用于 PCB STP 导出)

const HOTSWAP_PCB_MODEL: &[u8] = include_bytes!("../models/hotswap-pcb.stp");

/// Type-C 母座 3D 模型

const TYPEC_MODEL: &[u8] = include_bytes!("../models/type-c-connector-3d.stp");

/// 4P 连接器 3D 模型

const FOURP_MODEL: &[u8] = include_bytes!("../models/4p-connector-3d.stp");

/// MCU 3D 模型

const MCU_MODEL: &[u8] = include_bytes!("../models/mcu-3d.step");

/// T4 轴体 3D 模型

const T4_MODEL: &[u8] = include_bytes!("../models/T4-3d.step");

/// RGB LED 3D 模型

const RGB_MODEL: &[u8] = include_bytes!("../models/RGB-3d.step");

// ═══════════════════════════════════════════════════════════════════

// 模型对齐偏移常量

//

// ⚠️  ⚠️  ⚠️  重要规则  ⚠️  ⚠️  ⚠️

//   每个模块（Type-C / 4P / Hotswap）的偏移是独立实测定标的。

//   它们之间没有任何联动关系。

//   修改时一次只改一个模块，改完验证通过后才能改下一个。

//   绝不要因为"顺便有数据"就把无关模块也改了——上次就是这么翻车的。

//

// 所有单位均为 mm。

//

// 坐标系约定:

//   X → 右, Y → 上, Z → 垂直于 PCB (Z=0 = PCB 底面)

//

// 如何测量偏移:

//   用 CAD 打开 STP 模型，找到模型上需要对齐的特征点(引脚/定位柱)

//   测量该特征点在模型坐标系中的 (x, y) 坐标。

//   在 PCB 中找到对应的焊接孔/定位孔位置(相对开关中心)。

//   偏移量 = PCB孔位 - 模型特征点

// ═══════════════════════════════════════════════════════════════════

/// Hotswap 模型偏移 (Z 减 0.385539)

const HOTSWAP_OFFSET_X: f64 = -10.895239;

const HOTSWAP_OFFSET_Y: f64 = 7.884726;

const HOTSWAP_Z_OFFSET: f64 = 2.454049;

/// Type-C 模型偏移

const TYPEC_OFFSET_X: f64 = -74.782579;

const TYPEC_OFFSET_Y: f64 = 59.295036;

const TYPEC_Z_OFFSET: f64 = -4.8;

/// Type-C 绕自身 Z 轴中心额外旋转角度 (度)

const TYPEC_ROTATION_OFFSET: f64 = 180.0;

/// 4P 连接器模型偏移

const FOURP_OFFSET_X: f64 = -75.004507;

const FOURP_OFFSET_Y: f64 = 70.692816;

const FOURP_Z_OFFSET: f64 = -4.341554;

const FOURP_ROTATION_OFFSET: f64 = 0.0;

/// MCU 模型偏移

const MCU_OFFSET_X: f64 = -3.53201;

const MCU_OFFSET_Y: f64 = -5.54028;

const MCU_Z_OFFSET: f64 = -1.33418;

const MCU_ROTATION_OFFSET: f64 = 0.0;

/// T4 轴体模型偏移 (X+6, Y-3, Z不变)

const T4_OFFSET_X: f64 = 6.0;

const T4_OFFSET_Y: f64 = -3.0;

const T4_Z_OFFSET: f64 = 0.0;

const T4_ROTATION_OFFSET: f64 = 0.0;

/// RGB LED 模型偏移 (绕自身Z顺时针90°, Z-1.065)

const RGB_OFFSET_X: f64 = -1.88804;

const RGB_OFFSET_Y: f64 = -2.87598;

const RGB_Z_OFFSET: f64 = -1.065;

const RGB_ROTATION_OFFSET: f64 = 90.0;

/// 从嵌入的字节加载 STEP 模型，返回 Solid 向量

fn load_embedded_model(data: &[u8], label: &str) -> Result<Vec<Solid>, String> {
    let mut cursor = std::io::Cursor::new(data);

    Solid::read_step(&mut cursor).map_err(|e| format!("{label} STEP 读取失败: {e}"))
}

// ═══════════════════════════════════════════════════════════════════

// Progress payload type — 发射给前端的事件载荷

// ═══════════════════════════════════════════════════════════════════

#[derive(Serialize, Clone)]

struct StpProgressPayload {
    percentage: u32,

    phase: u32,

    phase_label: String,

    message: String,
}

fn emit_progress(app: &tauri::AppHandle, pct: u32, phase: u32, label: &str, msg: &str) {
    let _ = app.emit(
        "stp-progress",
        StpProgressPayload {
            percentage: pct.min(100),

            phase,

            phase_label: label.to_string(),

            message: msg.to_string(),
        },
    );
}

// ═══════════════════════════════════════════════════════════════════

// 模块化辅助函数

// ═══════════════════════════════════════════════════════════════════

/// 挤出底板: 从边界多边形挤出为指定厚度的实体

fn extrude_base_plate(boundary: &[[f64; 2]], thickness: f64) -> Result<Solid, String> {
    let boundary_pts: Vec<DVec3> = boundary
        .iter()
        .map(|&[x, y]| DVec3::new(x, y, 0.0))
        .collect();

    let outer_profile =
        Edge::polygon(&boundary_pts).map_err(|e| format!("外边界多边形无效: {e}"))?;

    Solid::extrude(&outer_profile, DVec3::Z * thickness).map_err(|e| format!("挤出底板失败: {e}"))
}

/// 在实体上减去多边形孔洞和圆形孔洞

fn cut_holes(
    body: &mut Solid,
    poly_holes: &[Vec<[f64; 2]>],
    circle_holes: &[[f64; 3]],
    thickness: f64,
    app_handle: &tauri::AppHandle,
) -> Result<(), String> {
    let hole_height = thickness + 2.0;

    let hole_z_base = -1.0;

    let poly_count = poly_holes.len();

    let circle_count = circle_holes.len();

    let total = poly_count + circle_count;

    if total == 0 {
        return Ok(());
    }

    // 一阶段布尔求值: 将所有孔洞添加到同一个 Boolean<Solid> 表达式树,

    // 最后调用 boolean_build 一次 (BOPAlgo_CellsBuilder 单次扫描).

    // 原方案对每个孔洞执行 boolean_build (N 次 OCC 遍历), 孔洞 > 100 时卡死.

    let mut cut_expr: Boolean<Solid> = body.clone().into();

    // 多边形孔洞 (构建阶段)

    for (i, hole_pts) in poly_holes.iter().enumerate() {
        if hole_pts.len() < 3 {
            continue;
        }

        let dvec_pts: Vec<DVec3> = hole_pts
            .iter()
            .map(|&[x, y]| DVec3::new(x, y, hole_z_base))
            .collect();

        let hole_profile = match Edge::polygon(&dvec_pts) {
            Ok(p) => p,

            Err(e) => {
                eprintln!("警告: 孔洞 #{} 多边形无效: {e}，跳过。", i + 1);
                continue;
            }
        };

        let hole_solid = match Solid::extrude(&hole_profile, DVec3::Z * hole_height) {
            Ok(s) => s,

            Err(e) => {
                eprintln!("警告: 孔洞 #{} 挤出失败: {e}，跳过。", i + 1);
                continue;
            }
        };

        cut_expr = cut_expr - &hole_solid;

        if i % 2 == 0 {
            emit_progress(
                app_handle,
                10 + ((i as u32 * 5) / poly_count.max(1) as u32).min(5),
                1,
                "多边形孔洞",
                &format!("多边形孔洞 {}/{}", i + 1, poly_count),
            );
        }
    }

    // 圆形孔洞 (构建阶段)

    let circle_base = 15;

    for (i, &[cx, cy, radius]) in circle_holes.iter().enumerate() {
        if radius <= 0.0 {
            continue;
        }

        let circle_profile = match Edge::circle(radius, DVec3::Z) {
            Ok(c) => c,

            Err(e) => {
                eprintln!("警告: 圆孔 #{} 创建失败 (r={}): {e}，跳过。", i + 1, radius);
                continue;
            }
        };

        let cylinder = match Solid::extrude(&[circle_profile], DVec3::Z * hole_height) {
            Ok(c) => c,

            Err(e) => {
                eprintln!("警告: 圆孔 #{} 挤出失败: {e}，跳过。", i + 1);
                continue;
            }
        };

        let positioned = cylinder.translate(DVec3::new(cx, cy, hole_z_base));

        cut_expr = cut_expr - &positioned;

        if i % 10 == 0 {
            emit_progress(
                app_handle,
                circle_base + ((i as u32 * 5) / circle_count.max(1) as u32).min(5),
                2,
                "圆形孔洞",
                &format!("圆形孔洞 {}/{}", i + 1, circle_count),
            );
        }
    }

    // 单次 OCC CellsBuilder 扫描执行全部布尔减法

    emit_progress(
        app_handle,
        20,
        1,
        "布尔运算",
        "正在执行布尔减法 (单次求值)...",
    );

    let built = Solid::boolean_build(&cut_expr).map_err(|e| format!("布尔减法失败: {e}"))?;

    if built.is_empty() {
        return Ok(());
    }

    *body = built
        .into_iter()
        .max_by(|a, b| {
            a.volume()
                .partial_cmp(&b.volume())
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .unwrap();

    emit_progress(app_handle, 25, 2, "布尔运算", "布尔减法完成");

    Ok(())
}

/// 组装额外 3D 模型 (热插拔、Type-C、4P、MCU、T4、RGB) 到底板

fn assemble_models(
    base_body: Solid,
    model_placements: &[ModelPlacement],
    app_handle: &tauri::AppHandle,
) -> Result<Vec<Solid>, String> {
    let mut all_solids: Vec<Solid> = Vec::new();

    all_solids.push(base_body);

    if model_placements.is_empty() {
        return Ok(all_solids);
    }

    emit_progress(app_handle, 25, 3, "加载模型", "正在加载 3D 模型文件...");

    let hotswap_solids = if model_placements.iter().any(|m| m.model_type == "hotswap") {
        Some(load_embedded_model(HOTSWAP_PCB_MODEL, "Hotswap-PCB")?)
    } else {
        None
    };

    let typec_solids = if model_placements.iter().any(|m| m.model_type == "typec") {
        Some(load_embedded_model(TYPEC_MODEL, "Type-C")?)
    } else {
        None
    };

    let fourp_solids = if model_placements.iter().any(|m| m.model_type == "4p") {
        Some(load_embedded_model(FOURP_MODEL, "4P")?)
    } else {
        None
    };

    let mcu_solids = if model_placements.iter().any(|m| m.model_type == "mcu") {
        Some(load_embedded_model(MCU_MODEL, "MCU")?)
    } else {
        None
    };

    let t4_solids = if model_placements.iter().any(|m| m.model_type == "t4") {
        Some(load_embedded_model(T4_MODEL, "T4")?)
    } else {
        None
    };

    let rgb_solids = if model_placements.iter().any(|m| m.model_type == "rgb") {
        Some(load_embedded_model(RGB_MODEL, "RGB")?)
    } else {
        None
    };

    let total = model_placements.len();

    for (i, placement) in model_placements.iter().enumerate() {
        let base_solids: &[Solid] = match placement.model_type.as_str() {
            "hotswap" => match &hotswap_solids {
                Some(s) => s.as_slice(),
                None => {
                    eprintln!("警告: hotswap 模型未加载，跳过 #{}", i);
                    continue;
                }
            },

            "typec" => match &typec_solids {
                Some(s) => s.as_slice(),
                None => {
                    eprintln!("警告: Type-C 模型未加载，跳过 #{}", i);
                    continue;
                }
            },

            "4p" => match &fourp_solids {
                Some(s) => s.as_slice(),
                None => {
                    eprintln!("警告: 4P 模型未加载，跳过 #{}", i);
                    continue;
                }
            },

            "mcu" => match &mcu_solids {
                Some(s) => s.as_slice(),
                None => {
                    eprintln!("警告: MCU 模型未加载，跳过 #{}", i);
                    continue;
                }
            },

            "t4" => match &t4_solids {
                Some(s) => s.as_slice(),
                None => {
                    eprintln!("警告: T4 模型未加载，跳过 #{}", i);
                    continue;
                }
            },

            "rgb" => match &rgb_solids {
                Some(s) => s.as_slice(),
                None => {
                    eprintln!("警告: RGB 模型未加载，跳过 #{}", i);
                    continue;
                }
            },

            _ => {
                eprintln!("警告: 未知模型类型 '{}', 跳过", placement.model_type);
                continue;
            }
        };

        let rot_rad = placement.rotation * std::f64::consts::PI / 180.0;

        let solid_count = base_solids.len();

        for solid in base_solids.iter() {
            let (off_x, off_y, off_z, rot_off_deg) = match placement.model_type.as_str() {
                "hotswap" => (HOTSWAP_OFFSET_X, HOTSWAP_OFFSET_Y, HOTSWAP_Z_OFFSET, 0.0),

                "typec" => (
                    TYPEC_OFFSET_X,
                    TYPEC_OFFSET_Y,
                    TYPEC_Z_OFFSET,
                    TYPEC_ROTATION_OFFSET,
                ),

                "4p" => (
                    FOURP_OFFSET_X,
                    FOURP_OFFSET_Y,
                    FOURP_Z_OFFSET,
                    FOURP_ROTATION_OFFSET,
                ),

                "mcu" => (
                    MCU_OFFSET_X,
                    MCU_OFFSET_Y,
                    MCU_Z_OFFSET,
                    MCU_ROTATION_OFFSET,
                ),

                "t4" => (T4_OFFSET_X, T4_OFFSET_Y, T4_Z_OFFSET, T4_ROTATION_OFFSET),

                "rgb" => (
                    RGB_OFFSET_X,
                    RGB_OFFSET_Y,
                    RGB_Z_OFFSET,
                    RGB_ROTATION_OFFSET,
                ),

                _ => (0.0, 0.0, 0.0, 0.0),
            };

            let combined_rot_rad = rot_rad + rot_off_deg * std::f64::consts::PI / 180.0;

            let needs_flip = placement.flip;

            let needs_z_rot = combined_rot_rad != 0.0;

            if needs_flip || needs_z_rot {
                if needs_flip {
                    // Type-C / 4P / MCU: flip + rotate around model centroid.
                    // rotate_x(PI) must pivot on the centroid so Z stays correct.
                    // Frontend already negates rotation for these (CW→CCW), so no negation here.
                    let center = solid.center();
                    let mut centered = solid.clone().translate(-center);
                    centered = centered.rotate_x(std::f64::consts::PI);
                    if needs_z_rot {
                        centered = centered.rotate_z(combined_rot_rad);
                    }
                    let placed = centered.translate(DVec3::new(
                        center.x + placement.x + off_x,
                        center.y + placement.y + off_y,
                        center.z + placement.z_offset + off_z,
                    ));
                    all_solids.push(placed);
                } else {
                    // hotswap / T4 / RGB: rotate around key-center reference point.
                    // The reference point is (-off_x, -off_y, 0) — the point on the model
                    // that should be pinned to the key center. Rotating around this point
                    // prevents orbital drift when the key is rotated.
                    // Frontend rotation is CW (SVG Y-down), cadrum rotate_z is CCW → negate.
                    let ref_point = DVec3::new(-off_x, -off_y, 0.0);
                    let mut centered = solid.clone().translate(-ref_point);
                    if needs_z_rot {
                        centered = centered.rotate_z(-combined_rot_rad);
                    }
                    let placed = centered.translate(DVec3::new(
                        placement.x,
                        placement.y,
                        placement.z_offset + off_z,
                    ));
                    all_solids.push(placed);
                }
            } else {
                let placed = solid.clone().translate(DVec3::new(
                    placement.x + off_x,
                    placement.y + off_y,
                    placement.z_offset + off_z,
                ));

                all_solids.push(placed);
            }
        }

        let pct = 25 + ((i as u32 + 1) * 55) / total.max(1) as u32;

        emit_progress(
            app_handle,
            pct.min(80),
            3,
            "放置组件",
            &format!(
                "组件 {}/{}: {} × {} 实体",
                i + 1,
                total,
                placement.model_type,
                solid_count
            ),
        );
    }

    Ok(all_solids)
}

// ═══════════════════════════════════════════════════════════════════

// Tauri 命令: generate_stp

// ═══════════════════════════════════════════════════════════════════

#[tauri::command]

fn generate_stp(
    app_handle: tauri::AppHandle,
    data: StpExtrudeRequest,
    thickness: f64,
    output_path: String,
) -> Result<String, String> {
    // ── 1. 验证 ──

    if data.boundary.len() < 3 {
        return Err("错误: 外边界多边形至少需要 3 个顶点。".into());
    }

    if thickness <= 0.0 || thickness > 100.0 {
        return Err(format!(
            "错误: 厚度必须在 0.1–100 mm 之间，收到 {} mm。",
            thickness
        ));
    }

    // ── 2. 挤出底板 ──

    emit_progress(&app_handle, 5, 1, "底板挤出", "正在计算边界多边形...");

    let mut body = extrude_base_plate(&data.boundary, thickness)?;

    emit_progress(
        &app_handle,
        10,
        1,
        "底板挤出",
        "底板挤出完成，正在处理孔洞...",
    );

    // ── 3. 减去孔洞 ──

    cut_holes(
        &mut body,
        &data.poly_holes,
        &data.circle_holes,
        thickness,
        &app_handle,
    )?;

    // ── 4. 组装额外 3D 模型 ──

    let all_solids = assemble_models(body, &data.model_placements, &app_handle)?;

    // ── 5. 导出 STEP 直接写盘 ──
    // 文件较大时 (104配列可达 50-100MB+)，通过 IPC 返回字符串会导致
    // JS 端 JSON.parse 触发 RangeError: Invalid array length。
    // 因此 Rust 直接写入用户指定路径，仅返回成功消息。

    emit_progress(
        &app_handle,
        82,
        4,
        "导出STEP",
        "正在生成 STEP AP203 文件...",
    );

    let mut buffer: Vec<u8> = Vec::new();
    Solid::write_step(&all_solids, &mut buffer)
        .map_err(|e| format!("STEP 导出失败: {e}"))?;

    emit_progress(
        &app_handle,
        92,
        4,
        "写入文件",
        "正在写入文件到磁盘...",
    );

    std::fs::write(&output_path, &buffer)
        .map_err(|e| format!("文件写入失败 {output_path}: {e}"))?;

    emit_progress(
        &app_handle,
        100,
        4,
        "完成",
        "STEP 文件已保存到磁盘。",
    );

    Ok(format!("✅ 导出成功！\n文件: {output_path}"))
}

// ═══════════════════════════════════════════════════════════════════

// Windows 绿色版（portable）自更新

// ═══════════════════════════════════════════════════════════════════

/// 绿色版更新清单（release.yml 生成，指向 *-portable.exe + 其 .sig）
const PORTABLE_MANIFEST_URL: &str =
    "https://github.com/kevinx-key/keyboard-dev-toolkit/releases/latest/download/latest-portable.json";

/// NSIS 安装版的卸载注册表键（PRODUCTNAME = tauri.conf.json 的 productName）
const NSIS_UNINSTALL_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Keyboard Dev Toolkit";

/// 下载进度（通过 Channel 推给前端）
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PortableProgress {
    chunk_length: usize,
    content_length: Option<u64>,
}

/// 绿色版判定：
/// 1. 文件名含 "portable"（发布资产固定命名 `..._x64-portable.exe`）→ 绿色版；
/// 2. 否则查 NSIS 卸载注册表键：存在 → 安装版；不存在 → 绿色版（用户拷走的裸 exe）；
/// 3. reg 查询异常 → 保守按安装版处理（走标准 NSIS 更新流程）。
#[cfg(windows)]
fn detect_portable() -> bool {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    if let Ok(exe) = std::env::current_exe() {
        if let Some(name) = exe.file_name().and_then(|n| n.to_str()) {
            if name.to_lowercase().contains("portable") {
                return true;
            }
        }
    }

    for root in ["HKCU", "HKLM"] {
        let key = format!(r"{root}\{NSIS_UNINSTALL_KEY}");
        match std::process::Command::new("reg")
            .args(["query", &key])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            Ok(o) if o.status.success() => return false, // 已安装
            Ok(_) => continue,                            // 键不存在 → 继续
            Err(_) => return false,                       // 查询失败 → 保守
        }
    }
    true
}

#[cfg(not(windows))]
fn detect_portable() -> bool {
    false
}

#[tauri::command]
fn is_portable_install() -> bool {
    detect_portable()
}

/// 用「绿色版清单」构建 updater（复用插件的签名校验：公钥取自 tauri.conf.json）
fn portable_updater(app: &tauri::AppHandle) -> Result<tauri_plugin_updater::Updater, String> {
    use tauri_plugin_updater::UpdaterExt;

    let endpoint = url::Url::parse(PORTABLE_MANIFEST_URL).map_err(|e| e.to_string())?;
    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

/// 检查绿色版更新，返回新版本号（无更新 → None）
#[tauri::command]
async fn check_portable_update(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let updater = portable_updater(&app)?;
    let update = updater.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| u.version))
}

/// 下载绿色版新程序 → 写临时文件 → 由独立脚本在应用退出后原地替换 → 应用退出重启
#[tauri::command]
async fn install_portable_update(
    app: tauri::AppHandle,
    on_progress: tauri::ipc::Channel<PortableProgress>,
) -> Result<(), String> {
    let updater = portable_updater(&app)?;
    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no portable update available".to_string())?;

    let bytes = update
        .download(
            |chunk_length, content_length| {
                let _ = on_progress.send(PortableProgress {
                    chunk_length,
                    content_length,
                });
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;

    let current = std::env::current_exe().map_err(|e| e.to_string())?;
    let staged = std::env::temp_dir().join(format!("kdt-portable-{}.exe", update.version));
    std::fs::write(&staged, &bytes).map_err(|e| e.to_string())?;

    spawn_portable_replace(&current, &staged)?;

    // 留一点时间让前端显示「下载完成」，随后退出（替换脚本会等本进程退出）
    let handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(900));
        handle.exit(0);
    });
    Ok(())
}

/// 生成并后台运行「等本进程退出 → 覆盖 exe → 重启」批处理（仅 Windows）
#[cfg(windows)]
fn spawn_portable_replace(current: &std::path::Path, staged: &std::path::Path) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const DETACHED_PROCESS: u32 = 0x0000_0008;

    let bat = std::env::temp_dir().join("kdt-portable-update.bat");
    let script = format!(
        "@echo off\r\n\
         setlocal\r\n\
         set /a tries=0\r\n\
         :wait\r\n\
         timeout /t 1 /nobreak >nul\r\n\
         move /y \"{staged}\" \"{current}\" >nul 2>&1\r\n\
         if not errorlevel 1 goto done\r\n\
         set /a tries+=1\r\n\
         if %tries% lss 120 goto wait\r\n\
         :done\r\n\
         start \"\" \"{current}\"\r\n\
         del \"%~f0\"\r\n",
        staged = staged.display(),
        current = current.display()
    );
    std::fs::write(&bat, script).map_err(|e| e.to_string())?;
    std::process::Command::new("cmd.exe")
        .arg("/C")
        .arg(&bat)
        .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(not(windows))]
fn spawn_portable_replace(_current: &std::path::Path, _staged: &std::path::Path) -> Result<(), String> {
    Err("portable update is only supported on Windows".into())
}

// ═══════════════════════════════════════════════════════════════════

// Tauri 应用入口

// ═══════════════════════════════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            generate_stp,
            is_portable_install,
            check_portable_update,
            install_portable_update
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

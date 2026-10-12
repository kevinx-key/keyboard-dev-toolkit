//! Keyboard Dev Toolkit — Tauri Rust 后端
//!
//! 桌面端仅保留 Windows 绿色版（portable）自更新。
//! 3D / STP 导出已上云（见 `src/lib/stp-export.ts` / `geometry-api.ts`）——
//! **桌面不再本地生成 STP**（防复制 §G-A1b/§G-B9），故不再链接 OpenCASCADE（cadrum）。

use serde::Serialize;

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

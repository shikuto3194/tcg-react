#[cfg(any(not(target_os = "android"), debug_assertions))]
pub mod bridge;
#[cfg(any(not(target_os = "android"), debug_assertions))]
pub mod stdio;
#[cfg(any(not(target_os = "android"), debug_assertions))]
mod ai_setup;
#[cfg(any(not(target_os = "android"), debug_assertions))]
mod ai_plugin;
#[cfg(target_os = "windows")]
mod taskbar;
#[cfg(target_os = "windows")]
pub mod storage;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    #[cfg(target_os = "windows")]
    let storage = match storage::prepare() {
        Ok(storage) => storage,
        Err(error) => { storage::show_error(&error); return; }
    };
    #[cfg(target_os = "windows")]
    for window in &mut context.config_mut().app.windows { window.create = false; }
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_tcg_folder::init())
        .plugin(tauri_plugin_dialog::init());
    // Android products contain no MCP commands or listener. Debug builds retain them.
    #[cfg(any(not(target_os = "android"), debug_assertions))]
    let builder = builder
        .manage(bridge::Bridge::default())
        .invoke_handler(tauri::generate_handler![
            bridge::enable_ai,
            bridge::disable_ai,
            bridge::mcp_reply,
            bridge::save_ai_files,
            bridge::ai_connection_diagnostics,
            ai_setup::ai_setup_info,
            ai_setup::configure_ai_client,
            ai_plugin::ai_plugin_files,
            ai_plugin::open_work_plugin
        ])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                use tauri::Manager;
                bridge::disable_ai(window.state::<bridge::Bridge>());
            }
        });
    builder.setup(move |app| {
            #[cfg(target_os = "windows")]
            {
                use tauri::Manager;
                let directory = storage.directory.clone();
                app.manage(storage);
                for window in &app.config().app.windows {
                    tauri::WebviewWindowBuilder::from_config(app, window)?
                        .data_directory(directory.clone()).build()?;
                }
            }
            #[cfg(target_os = "windows")]
            if let Err(error) = taskbar::configure(app) {
                log::warn!("Could not configure taskbar identity: {error}");
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(context)
        .expect("error while building tauri application");
}

#[cfg(target_os = "android")]
use tauri::Manager;
use tauri::{
    Runtime,
    plugin::{Builder, TauriPlugin},
};

#[tauri::command]
async fn pick_folder<R: Runtime>(_app: tauri::AppHandle<R>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        _app.state::<tauri::plugin::PluginHandle<R>>()
            .run_mobile_plugin("pickFolder", ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        Err("この操作はAndroid専用です。".into())
    }
}
#[tauri::command]
async fn open_file<R: Runtime>(
    _app: tauri::AppHandle<R>,
    file: serde_json::Value,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        _app.state::<tauri::plugin::PluginHandle<R>>()
            .run_mobile_plugin::<serde_json::Value>("openFile", file)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = file;
        Err("この操作はAndroid専用です。".into())
    }
}
#[tauri::command]
async fn copy_document<R: Runtime>(
    _app: tauri::AppHandle<R>,
    file: serde_json::Value,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        _app.state::<tauri::plugin::PluginHandle<R>>()
            .run_mobile_plugin::<serde_json::Value>("copyDocument", file)
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = file;
        Err("この操作はAndroid専用です。".into())
    }
}
#[tauri::command]
async fn save_files<R: Runtime>(
    _app: tauri::AppHandle<R>,
    batch: serde_json::Value,
) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        _app.state::<tauri::plugin::PluginHandle<R>>()
            .run_mobile_plugin("saveFiles", batch)
            .map_err(|error| error.to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = batch;
        Err("この操作はAndroid専用です。".into())
    }
}
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("tcg-folder")
        .invoke_handler(tauri::generate_handler![pick_folder, open_file, copy_document, save_files])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _app.manage(_api.register_android_plugin("local.tcg.folder", "FolderPlugin")?);
            Ok(())
        })
        .build()
}

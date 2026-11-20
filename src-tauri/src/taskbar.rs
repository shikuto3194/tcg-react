use tauri::Manager;
use windows::core::w;
use windows::Win32::{
    Foundation::{HINSTANCE, HWND, LPARAM, WPARAM},
    Storage::EnhancedStorage::{PKEY_AppUserModel_ID, PKEY_AppUserModel_RelaunchCommand, PKEY_AppUserModel_RelaunchDisplayNameResource, PKEY_AppUserModel_RelaunchIconResource},
    System::{Com::StructuredStorage::PROPVARIANT, LibraryLoader::GetModuleHandleW},
    UI::{Shell::PropertiesSystem::{IPropertyStore, SHGetPropertyStoreForWindow},
        WindowsAndMessaging::{LoadImageW, SendMessageW, ICON_BIG, IMAGE_ICON, LR_DEFAULTSIZE, LR_SHARED, WM_GETICON, WM_SETICON}},
};

// The Shell can cache a different icon from the title bar. Supply its identity and
// relaunch icon explicitly, including for windows started directly from the exe.
pub fn configure(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let window = app.get_webview_window("main").ok_or("Main window is missing")?;
    let exe = std::env::current_exe()?;
    let icon = app.path().resource_dir()?.join("tcg-manager-card.ico");
    let icon = if icon.is_file() { icon } else { exe.clone() };
    let properties = [
        (PKEY_AppUserModel_ID, crate::bridge::IDENTIFIER.to_string()),
        (PKEY_AppUserModel_RelaunchCommand, format!("\"{}\"", exe.display())),
        (PKEY_AppUserModel_RelaunchDisplayNameResource, "TCG マネージャー".into()),
        (PKEY_AppUserModel_RelaunchIconResource, format!("{},0", icon.display())),
    ];
    unsafe {
        let hwnd = HWND(window.hwnd()?.0);
        // Tauri's window icon sets ICON_SMALL only. Load the exe's generated icon
        // resource for ICON_BIG too. LR_SHARED gives it process lifetime without
        // handing ownership to Tao, which manages the separate small icon.
        let module = GetModuleHandleW(None)?;
        let large = LoadImageW(Some(HINSTANCE(module.0)), w!("#32512"), IMAGE_ICON, 0, 0, LR_DEFAULTSIZE | LR_SHARED)?;
        SendMessageW(hwnd, WM_SETICON, Some(WPARAM(ICON_BIG as usize)), Some(LPARAM(large.0 as isize)));
        if SendMessageW(hwnd, WM_GETICON, Some(WPARAM(ICON_BIG as usize)), None).0 != large.0 as isize {
            return Err("Could not set the large window icon".into());
        }
        let store: IPropertyStore = SHGetPropertyStoreForWindow(hwnd)?;
        for (key, text) in properties { store.SetValue(&key, &PROPVARIANT::from(text.as_str()))?; }
        store.Commit()?;
    }
    Ok(())
}

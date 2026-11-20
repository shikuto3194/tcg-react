const COMMANDS: &[&str] = &["pick_folder", "open_file", "copy_document", "save_files"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}

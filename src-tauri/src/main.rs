// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "windows")]
    if std::env::args().any(|arg| arg == "--storage-diagnose") {
        println!("{}", app_lib::storage::diagnose());
        return;
    }
    #[cfg(any(not(target_os = "android"), debug_assertions))]
    if std::env::args().any(|arg| arg == "--mcp-diagnose") {
        let result = app_lib::stdio::diagnose();
        println!("{result}");
        if result["ok"] != true { std::process::exit(1); }
        return;
    }
    #[cfg(any(not(target_os = "android"), debug_assertions))]
    if std::env::args().any(|arg| arg == "--mcp") {
        if let Err(error) = app_lib::stdio::run_stdio() {
            eprintln!("{error}");
            std::process::exit(1);
        }
        return;
    }
    app_lib::run();
}

use std::{collections::BTreeMap, fs, path::Path};
use serde_json::{Value, json};
use tauri_plugin_opener::OpenerExt;

const README: &str = include_str!("../resources/ai-plugin-readme.md");

fn plugin_files(server: &Value) -> BTreeMap<String, String> {
    let manifest = json!({
        "name": "tcg-manager", "version": "0.1.1",
        "description": "このWindows PCのTCG マネージャーでカード・デッキ・戦績を確認・編集します。",
        "mcpServers": "./.mcp.json"
    });
    let mut codex = manifest.clone();
    codex["interface"] = json!({"displayName": "TCG マネージャー", "shortDescription": "このPCのカード・デッキ・戦績を操作", "category": "Productivity"});
    BTreeMap::from([
        (".claude-plugin/plugin.json".into(), manifest.to_string()),
        (".codex-plugin/plugin.json".into(), codex.to_string()),
        (".mcp.json".into(), json!({"mcpServers": {"tcg_local": server}}).to_string()),
        ("README.md".into(), README.into()),
    ])
}

fn windows_plugin_files(app: tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    if !cfg!(target_os = "windows") { return Err("このプラグインはWindows版で使えます。".into()); }
    let info = crate::ai_setup::ai_setup_info(app)?;
    Ok(plugin_files(&info["server"]))
}

#[tauri::command]
pub fn ai_plugin_files(app: tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    windows_plugin_files(app)
}

// Each preparation owns a fresh directory. No AI settings or existing plugin files are overwritten.
fn write_marketplace(root: &Path, files: &BTreeMap<String, String>) -> std::io::Result<std::path::PathBuf> {
    for (name, text) in files {
        let path = root.join("tcg-manager").join(name);
        fs::create_dir_all(path.parent().unwrap())?;
        fs::write(path, text)?;
    }
    let catalog = root.join(".agents/plugins/marketplace.json");
    fs::create_dir_all(catalog.parent().unwrap())?;
    fs::write(&catalog, json!({
        "name": "tcg-manager-local",
        "interface": {"displayName": "TCG マネージャー"},
        "plugins": [{"name": "tcg-manager", "source": {"source": "local", "path": "./tcg-manager"},
            "policy": {"installation": "AVAILABLE", "authentication": "ON_INSTALL"}, "category": "Productivity"}]
    }).to_string())?;
    Ok(catalog)
}

#[tauri::command]
pub fn open_work_plugin(app: tauri::AppHandle) -> Result<(), String> {
    let files = windows_plugin_files(app.clone())?;
    let connection = crate::bridge::app_connection_path(&app)?;
    let root = connection.parent().ok_or("保存先を取得できませんでした。")?
        .join("ai-plugins").join(uuid::Uuid::new_v4().to_string());
    let catalog = write_marketplace(&root, &files).map_err(|_| "プラグインを準備できませんでした。")?;
    let mut url = tauri::Url::parse("codex://plugins/tcg-manager").unwrap();
    url.query_pairs_mut().append_pair("marketplacePath", &catalog.to_string_lossy());
    app.opener().open_url(url.as_str(), None::<&str>).map_err(|_| "導入画面を開けませんでした。ChatGPTのPCアプリがインストールされているか確認してください。".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn local_plugin_preserves_paths_and_only_references_the_existing_stdio_bridge() {
        let server = json!({"command": "C:\\TCG アプリ\\tcg-local.exe", "args": ["--mcp"], "env": {"TCG_CONNECTION_FILE": "C:\\利用者\\ai-connection.json"}});
        let files = plugin_files(&server);
        let mcp: Value = serde_json::from_str(&files[".mcp.json"]).unwrap();
        assert_eq!(mcp["mcpServers"]["tcg_local"], server);
        for manifest in [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"] {
            let manifest: Value = serde_json::from_str(&files[manifest]).unwrap();
            assert_eq!(manifest["mcpServers"], "./.mcp.json");
            assert!(manifest.get("hooks").is_none());
        }
        let temp = tempfile::tempdir().unwrap();
        let catalog = write_marketplace(temp.path(), &files).unwrap();
        let catalog: Value = serde_json::from_str(&fs::read_to_string(catalog).unwrap()).unwrap();
        let plugin = temp.path().join(catalog["plugins"][0]["source"]["path"].as_str().unwrap());
        for (path, expected) in files { assert_eq!(fs::read_to_string(plugin.join(path)).unwrap(), expected); }
    }
}

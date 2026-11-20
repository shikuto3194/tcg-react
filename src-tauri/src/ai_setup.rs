use serde_json::{Value, json};
use std::{fs, io::Write, path::Path, sync::Mutex};

const SERVER: &str = "tcg_local";
const CONFLICT: &str =
    "同名のTCG接続に別の設定があります。AIアプリで既存のTCG接続を確認してください。";
static SETUP_LOCK: Mutex<()> = Mutex::new(());

fn same_path(left: Option<&str>, right: Option<&str>, connection: bool) -> bool {
    let (Some(left), Some(right)) = (left, right) else { return false; };
    if !cfg!(target_os = "windows") { return left == right; }
    let normalize = |path: &str| if connection {
        crate::bridge::normalize_connection_path(Some(path.into())).to_string_lossy().into_owned()
    } else { path.to_string() }.replace('/', "\\");
    normalize(left).eq_ignore_ascii_case(&normalize(right))
}

// Only these two known client files can be written. No path or command is accepted from JS.
#[tauri::command]
pub fn ai_setup_info(app: tauri::AppHandle) -> Result<Value, String> {
    if !cfg!(target_os = "windows") {
        return Ok(json!({"clients": []}));
    }
    let home = dirs::home_dir().ok_or("ユーザーフォルダが見つかりません。")?;
    let codex = std::env::var_os("CODEX_HOME")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| home.join(".codex"));
    if !codex.is_absolute() {
        return Err("Codexの保存先が絶対パスではありません。".into());
    }
    let roaming = dirs::config_dir().ok_or("設定フォルダが見つかりません。")?;
    let command = std::env::current_exe().map_err(|_| "アプリの場所を取得できませんでした。")?;
    let connection = crate::bridge::app_connection_path(&app)?;
    let plugin_enabled = fs::read_to_string(codex.join("config.toml")).ok()
        .and_then(|source| source.parse::<toml_edit::DocumentMut>().ok())
        .and_then(|doc| doc.get("plugins")?.get("tcg-manager@tcg-manager-local")?.get("enabled")?.as_bool())
        .unwrap_or(false);
    Ok(json!({
        "preferredClient": if plugin_enabled { "work" } else { "codex" },
        "clients": [
            {"id": "codex", "name": "Codex", "configPath": codex.join("config.toml")},
            {"id": "claude", "name": "Claude Desktop", "configPath": roaming.join("Claude/claude_desktop_config.json")}
        ],
        "plugins": [
            {"id": "Claude Cowork", "name": "Claude Cowork（PC）"},
            {"id": "work", "name": "Codex / ChatGPT Work（プラグイン）"}
        ],
        "serverName": SERVER,
        "server": {"command": command, "args": ["--mcp"], "env": {"TCG_CONNECTION_FILE": connection}}
    }))
}

fn merge_config(client: &str, source: &str, server: &Value) -> Result<String, String> {
    if client == "codex" {
        let mut doc = source
            .parse::<toml_edit::DocumentMut>()
            .map_err(|_| "Codexの設定を読めませんでした。設定は変更していません。")?;
        if doc.get("mcp_servers").is_none() {
            doc["mcp_servers"] = toml_edit::Item::Table(toml_edit::Table::new());
        }
        let servers = doc["mcp_servers"]
            .as_table_like_mut()
            .ok_or("CodexのMCP設定の形式を確認してください。")?;
        let mut entry = toml_edit::Table::new();
        entry["command"] = toml_edit::value(
            server["command"]
                .as_str()
                .ok_or("アプリの場所がありません。")?,
        );
        let mut args = toml_edit::Array::new();
        args.push("--mcp");
        entry["args"] = toml_edit::value(args);
        let mut env = toml_edit::Table::new();
        env["TCG_CONNECTION_FILE"] = toml_edit::value(
            server["env"]["TCG_CONNECTION_FILE"]
                .as_str()
                .ok_or("接続先がありません。")?,
        );
        entry["env"] = toml_edit::Item::Table(env);
        if let Some(existing) = servers.get(SERVER) {
            // Existing entries are never replaced, including user-defined tool/approval settings.
            let same = same_path(existing.get("command").and_then(|x| x.as_str()), server["command"].as_str(), false)
                && existing
                    .get("args")
                    .and_then(|x| x.as_array())
                    .is_some_and(|x| {
                        x.len() == 1 && x.get(0).and_then(|x| x.as_str()) == Some("--mcp")
                    })
                && same_path(existing
                    .get("env")
                    .and_then(|x| x.get("TCG_CONNECTION_FILE"))
                    .and_then(|x| x.as_str()), server["env"]["TCG_CONNECTION_FILE"].as_str(), true)
                && existing.get("url").is_none()
                && existing.get("enabled").and_then(|x| x.as_bool()) != Some(false);
            return if same {
                Ok(source.to_string())
            } else {
                Err(CONFLICT.into())
            };
        }
        servers.insert(SERVER, toml_edit::Item::Table(entry));
        Ok(doc.to_string())
    } else if client == "claude" {
        let mut doc: Value = if source.trim().is_empty() {
            json!({})
        } else {
            serde_json::from_str(source)
                .map_err(|_| "Claude Desktopの設定を読めませんでした。設定は変更していません。")?
        };
        let root = doc
            .as_object_mut()
            .ok_or("Claude Desktopの設定の形式を確認してください。")?;
        let servers = root
            .entry("mcpServers")
            .or_insert(json!({}))
            .as_object_mut()
            .ok_or("Claude DesktopのMCP設定の形式を確認してください。")?;
        if let Some(existing) = servers.get(SERVER) {
            return if existing == server {
                Ok(source.to_string())
            } else {
                Err(CONFLICT.into())
            };
        }
        servers.insert(SERVER.into(), server.clone());
        Ok(format!(
            "{}\n",
            serde_json::to_string_pretty(&doc).map_err(|_| "設定を作成できませんでした。")?
        ))
    } else {
        Err("このAIアプリの自動設定には対応していません。".into())
    }
}

fn read_config(path: &Path) -> Result<Option<String>, String> {
    match fs::symlink_metadata(path) {
        Ok(meta) => {
            if !meta.is_file() || meta.file_type().is_symlink() || meta.len() > 2 * 1024 * 1024 {
                return Err("設定ファイルの種類またはサイズを確認してください。".into());
            }
            fs::read_to_string(path)
                .map(Some)
                .map_err(|_| "設定ファイルを読めませんでした。")
                .map_err(String::from)
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("設定ファイルを確認できませんでした。".into()),
    }
}

fn install_config(client: &str, path: &Path, server: &Value) -> Result<bool, String> {
    let original = read_config(path)?;
    let updated = merge_config(client, original.as_deref().unwrap_or(""), server)?;
    if original.as_deref() == Some(&updated) {
        return Ok(false);
    }
    let parent = path.parent().ok_or("設定の保存先がありません。")?;
    fs::create_dir_all(parent).map_err(|_| "設定フォルダを作成できませんでした。")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "設定の保存を準備できませんでした。")?;
    temp.write_all(updated.as_bytes())
        .and_then(|_| temp.as_file().sync_all())
        .map_err(|_| "設定を保存できませんでした。")?;
    if let Some(ref source) = original {
        let backup = parent.join(format!(
            "{}.tcg-backup-{}",
            path.file_name().unwrap().to_string_lossy(),
            uuid::Uuid::new_v4()
        ));
        fs::copy(path, &backup)
            .map_err(|_| "元の設定を保管できませんでした。設定は変更していません。")?;
        if fs::read_to_string(&backup).ok().as_deref() != Some(source) {
            return Err("設定が変わりました。もう一度お試しください。".into());
        }
    }
    if read_config(path)? != original {
        return Err("設定が変わりました。もう一度お試しください。".into());
    }
    if original.is_none() {
        temp.persist_noclobber(path)
    } else {
        temp.persist(path)
    }
    .map_err(|_| "設定を保存できませんでした。AIアプリを終了して、もう一度お試しください。")?;
    Ok(true)
}

#[tauri::command]
pub fn configure_ai_client(app: tauri::AppHandle, client: String) -> Result<Value, String> {
    let _guard = SETUP_LOCK
        .lock()
        .map_err(|_| "設定処理を再開できませんでした。")?;
    let info = ai_setup_info(app)?;
    let profile = info["clients"]
        .as_array()
        .and_then(|rows| rows.iter().find(|row| row["id"] == client))
        .ok_or("自動設定はWindows版のCodex・Claude Desktopで使えます。")?;
    let path = Path::new(
        profile["configPath"]
            .as_str()
            .ok_or("設定先がありません。")?,
    );
    let changed = install_config(&client, path, &info["server"])?;
    Ok(json!({"changed": changed, "client": profile["name"]}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn server() -> Value {
        json!({"command": "C:\\TCG App\\tcg-local.exe", "args": ["--mcp"], "env": {"TCG_CONNECTION_FILE": "C:\\TCG Data\\ai-connection.json"}})
    }

    #[test]
    fn codex_preserves_comments_and_other_settings_and_is_idempotent() {
        let source = "# keep\nmodel = 'test'\n[mcp_servers.other]\ncommand = 'other'\n";
        let next = merge_config("codex", source, &server()).unwrap();
        assert!(next.contains("# keep"));
        let parsed = next.parse::<toml_edit::DocumentMut>().unwrap();
        assert_eq!(parsed["model"].as_str(), Some("test"));
        assert_eq!(
            parsed["mcp_servers"]["other"]["command"].as_str(),
            Some("other")
        );
        assert_eq!(
            parsed["mcp_servers"][SERVER]["command"].as_str(),
            server()["command"].as_str()
        );
        assert_eq!(merge_config("codex", &next, &server()).unwrap(), next);
    }
    #[test]
    fn claude_preserves_preferences_and_other_servers() {
        let source =
            r#"{"preferences":{"theme":"dark"},"mcpServers":{"other":{"command":"other"}}}"#;
        let next = merge_config("claude", source, &server()).unwrap();
        let parsed: Value = serde_json::from_str(&next).unwrap();
        assert_eq!(parsed["preferences"]["theme"], "dark");
        assert_eq!(parsed["mcpServers"]["other"]["command"], "other");
        assert_eq!(parsed["mcpServers"][SERVER], server());
        assert_eq!(merge_config("claude", &next, &server()).unwrap(), next);
    }
    #[test]
    #[cfg(target_os = "windows")]
    fn codex_recognizes_legacy_connection_without_replacing_settings() {
        let legacy = dirs::data_dir().unwrap().join(crate::bridge::IDENTIFIER).join("ai-connection.json");
        let mut old = server();
        old["env"]["TCG_CONNECTION_FILE"] = json!(legacy);
        let source = format!("{}\n[other]\nkeep = true\n", merge_config("codex", "", &old).unwrap());
        let mut current = old.clone();
        current["command"] = json!("c:/tcg app/TCG-LOCAL.EXE");
        current["env"]["TCG_CONNECTION_FILE"] = json!(crate::bridge::normalize_connection_path(None));
        assert_eq!(merge_config("codex", &source, &current).unwrap(), source);
    }
    #[test]
    fn invalid_or_conflicting_settings_are_never_overwritten() {
        for (client, source) in [
            ("codex", "bad = ["),
            ("codex", "[mcp_servers.tcg_local]\ncommand='other'"),
            ("claude", "{"),
            ("claude", "[]"),
            (
                "claude",
                r#"{"mcpServers":{"tcg_local":{"command":"other"}}}"#,
            ),
        ] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("config");
            fs::write(&path, source).unwrap();
            assert!(install_config(client, &path, &server()).is_err());
            assert_eq!(fs::read_to_string(&path).unwrap(), source);
        }
    }
    #[test]
    fn writes_backup_once_and_supports_new_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config");
        let source = "# original\nmodel='test'\n";
        fs::write(&path, source).unwrap();
        assert!(install_config("codex", &path, &server()).unwrap());
        assert!(!install_config("codex", &path, &server()).unwrap());
        let backup = fs::read_dir(dir.path())
            .unwrap()
            .map(|x| x.unwrap().path())
            .find(|p| p != &path)
            .unwrap();
        assert_eq!(fs::read_to_string(backup).unwrap(), source);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 2);
        assert!(install_config("claude", &dir.path().join("new/config.json"), &server()).unwrap());
    }
}

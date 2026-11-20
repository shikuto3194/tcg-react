use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::Ipv4Addr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    time::Duration,
};
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

const LIMIT: u64 = 700 * 1024 * 1024;
pub const IDENTIFIER: &str = "local.tcg.manager";
#[derive(Clone, PartialEq, Serialize, Deserialize)]
pub struct Connection {
    pub url: String,
    pub token: String,
    pub port: u16,
}
struct Running {
    stop: Arc<AtomicBool>,
    info: Connection,
    path: std::path::PathBuf,
    _owner: std::fs::File,
}
#[derive(Default)]
pub struct Bridge {
    running: Mutex<Option<Running>>,
    pending: Mutex<HashMap<String, mpsc::Sender<Value>>>,
}

pub fn connection_path() -> std::path::PathBuf {
    normalize_connection_path(std::env::var_os("TCG_CONNECTION_FILE").map(Into::into))
}
pub(crate) fn normalize_connection_path(explicit: Option<std::path::PathBuf>) -> std::path::PathBuf {
    let legacy = dirs::data_dir()
        .unwrap_or_default()
        .join(IDENTIFIER)
        .join("ai-connection.json");
    resolve_connection_path(explicit, &legacy)
}
fn resolve_connection_path(explicit: Option<std::path::PathBuf>, legacy: &std::path::Path) -> std::path::PathBuf {
    let standard = if cfg!(target_os = "windows") {
        dirs::home_dir().expect("Windows user profile is required").join(".tcg-manager").join("ai-connection.json")
    } else { legacy.to_path_buf() };
    match explicit {
        // Only migrate the known default. Custom test/portable paths stay explicit.
        Some(path) if !path.to_string_lossy().replace('/', "\\").eq_ignore_ascii_case(&legacy.to_string_lossy().replace('/', "\\")) => path,
        _ => standard,
    }
}
pub fn app_connection_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if cfg!(target_os = "windows") {
        return dirs::home_dir().map(|home| home.join(".tcg-manager").join("ai-connection.json"))
            .ok_or_else(|| "ユーザーフォルダを取得できませんでした。".into());
    }
    app.path().app_data_dir().map(|path| path.join("ai-connection.json"))
        .map_err(|_| "接続ファイルの保存先を取得できませんでした。".into())
}

fn publish_connection(path: &std::path::Path, info: &Connection) -> Result<(), String> {
    let dir = path.parent().ok_or("接続ファイルの保存先を確認してください。")?;
    std::fs::create_dir_all(dir).map_err(|_| "接続ファイルの保存先を作れませんでした。")?;
    let mut file = tempfile::NamedTempFile::new_in(dir).map_err(|_| "接続ファイルを準備できませんでした。")?;
    file.write_all(&serde_json::to_vec(info).unwrap()).map_err(|_| "接続ファイルを書き込めませんでした。")?;
    file.as_file().sync_all().map_err(|_| "接続ファイルを保存できませんでした。")?;
    file.persist(path).map_err(|_| "接続ファイルを更新できませんでした。保存先のアクセス権を確認してください。")?;
    Ok(())
}

impl Drop for Running {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        // A different process's newer connection must never be removed.
        if crate::stdio::read_connection(&self.path).ok().as_ref() == Some(&self.info) {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

#[tauri::command]
pub fn ai_connection_diagnostics(app: tauri::AppHandle, bridge: tauri::State<Bridge>) -> Result<Value, String> {
    let path = app_connection_path(&app)?;
    let running = bridge.running.lock().map_err(|_| "接続状態を確認できませんでした。")?;
    let stored = crate::stdio::read_connection(&path);
    Ok(json!({
        "connectionFile": path,
        "listening": running.is_some(),
        "fileMatches": running.as_ref().map(|current| stored.as_ref().ok() == Some(&current.info)).unwrap_or(false),
        "fileError": stored.err(),
        "toolAvailability": "AIアプリの会話でtcg_statusを実行して確認してください。"
    }))
}
fn header(request: &tiny_http::Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|header| header.value.as_str().to_string())
}
fn reply(request: tiny_http::Request, status: u16, body: Value, session: &str) {
    let mut response = tiny_http::Response::from_string(if status == 202 {
        String::new()
    } else {
        body.to_string()
    })
    .with_status_code(status)
    .with_header(tiny_http::Header::from_bytes("Content-Type", "application/json").unwrap());
    if !session.is_empty() {
        response.add_header(tiny_http::Header::from_bytes("Mcp-Session-Id", session).unwrap());
    }
    let _ = request.respond(response);
}
fn handle(
    mut request: tiny_http::Request,
    app: tauri::AppHandle,
    info: Connection,
    stop: Arc<AtomicBool>,
) {
    let host = format!("127.0.0.1:{}", info.port);
    if stop.load(Ordering::Relaxed)
        || request.url() != "/mcp"
        || header(&request, "Host").as_deref() != Some(&host)
    {
        reply(request, 403, json!({"error":"Forbidden"}), "");
        return;
    }
    if header(&request, "Origin").is_some()
        || header(&request, "Authorization") != Some(format!("Bearer {}", info.token))
    {
        reply(request, 401, json!({"error":"Unauthorized"}), "");
        return;
    }
    if request.method().as_str() == "DELETE" {
        if let Some(session) = header(&request, "Mcp-Session-Id") {
            let _ = app.emit("tcg-mcp-request", json!({"sessionId":session,"close":true}));
        }
        reply(request, 202, Value::Null, "");
        return;
    }
    if request.method().as_str() != "POST" {
        reply(request, 405, json!({"error":"POST required"}), "");
        return;
    }
    if request
        .body_length()
        .map(|len| len as u64 > LIMIT)
        .unwrap_or(false)
    {
        reply(request, 413, json!({"error":"Too large"}), "");
        return;
    }
    let mut body = Vec::new();
    if request
        .as_reader()
        .take(LIMIT + 1)
        .read_to_end(&mut body)
        .is_err()
        || body.len() as u64 > LIMIT
    {
        reply(request, 413, json!({"error":"Too large"}), "");
        return;
    }
    let message: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(_) => {
            reply(request, 400, json!({"error":"Invalid JSON"}), "");
            return;
        }
    };
    let session =
        header(&request, "Mcp-Session-Id").unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    if session.len() > 128
        || !session
            .bytes()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == b'-')
    {
        reply(request, 400, json!({"error":"Invalid session"}), "");
        return;
    }
    let exchange = uuid::Uuid::new_v4().to_string();
    let has_id = message.get("id").is_some();
    let (tx, rx) = mpsc::channel();
    {
        let bridge = app.state::<Bridge>();
        let mut pending = bridge.pending.lock().unwrap();
        if pending.len() >= 16 {
            reply(request, 429, json!({"error":"Busy"}), &session);
            return;
        }
        if has_id {
            pending.insert(exchange.clone(), tx);
        }
    }
    if app
        .emit(
            "tcg-mcp-request",
            json!({"exchangeId":exchange,"sessionId":session,"message":message}),
        )
        .is_err()
    {
        app.state::<Bridge>()
            .pending
            .lock()
            .unwrap()
            .remove(&exchange);
        reply(request, 503, json!({"error":"App unavailable"}), &session);
        return;
    }
    if !has_id {
        reply(request, 202, Value::Null, &session);
        return;
    }
    match rx.recv_timeout(Duration::from_secs(120)) {
        Ok(response) => reply(request, 200, response, &session),
        Err(_) => {
            app.state::<Bridge>()
                .pending
                .lock()
                .unwrap()
                .remove(&exchange);
            reply(
                request,
                504,
                json!({"error":"Result unknown; retry with the same requestId"}),
                &session,
            );
        }
    }
}
#[tauri::command]
pub fn enable_ai(
    app: tauri::AppHandle,
    bridge: tauri::State<Bridge>,
) -> Result<Connection, String> {
    let mut running = bridge.running.lock().map_err(|error| error.to_string())?;
    if let Some(current) = running.as_ref() {
        return Ok(current.info.clone());
    }
    let path = app_connection_path(&app)?;
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|_| "接続ファイルの保存先を作れませんでした。")?;
    let owner = std::fs::OpenOptions::new().read(true).write(true).create(true).truncate(false)
        .open(path.with_extension("lock")).map_err(|_| "接続ファイルの使用状況を確認できませんでした。")?;
    owner.try_lock().map_err(|_| "別のTCG マネージャーが接続を受け付けています。そちらの接続を使うか、停止してから開始してください。")?;
    let server =
        tiny_http::Server::http((Ipv4Addr::LOCALHOST, 0)).map_err(|error| error.to_string())?;
    let port = server
        .server_addr()
        .to_ip()
        .ok_or("No local address")?
        .port();
    let info = Connection {
        url: format!("http://127.0.0.1:{port}/mcp"),
        token: format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        ),
        port,
    };
    publish_connection(&path, &info)?;
    let stop = Arc::new(AtomicBool::new(false));
    *running = Some(Running {
        stop: stop.clone(),
        info: info.clone(),
        path,
        _owner: owner,
    });
    let copied = info.clone();
    std::thread::spawn(move || {
        while !stop.load(Ordering::Relaxed) {
            if let Ok(Some(request)) = server.recv_timeout(Duration::from_millis(250)) {
                let app = app.clone();
                let info = copied.clone();
                let stop = stop.clone();
                std::thread::spawn(move || handle(request, app, info, stop));
            }
        }
    });
    Ok(info)
}
#[tauri::command]
pub fn disable_ai(bridge: tauri::State<Bridge>) {
    bridge.running.lock().unwrap().take();
    bridge.pending.lock().unwrap().clear();
}
#[tauri::command]
pub fn mcp_reply(bridge: tauri::State<Bridge>, exchange_id: String, message: Value) {
    if let Some(sender) = bridge.pending.lock().unwrap().remove(&exchange_id) {
        let _ = sender.send(message);
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputFile {
    name: String,
    data_url: String,
}
#[tauri::command]
pub fn save_ai_files(app: tauri::AppHandle, files: Vec<OutputFile>) -> Result<Value, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("ai-exports")
        .join(uuid::Uuid::new_v4().to_string());
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    let mut results = Vec::new();
    for (index, file) in files.iter().enumerate() {
        let (_, encoded) = file
            .data_url
            .split_once(";base64,")
            .ok_or("Invalid file data")?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| error.to_string())?;
        let name: String = file
            .name
            .chars()
            .map(|ch| {
                if ch.is_control() || "<>:\"/\\|?*".contains(ch) {
                    '_'
                } else {
                    ch
                }
            })
            .take(150)
            .collect();
        let path = dir.join(format!("{}-{}", index + 1, name));
        std::fs::write(&path, &bytes).map_err(|error| error.to_string())?;
        // Allow the WebView to save this specific native-generated file.
        app.fs_scope()
            .allow_file(&path)
            .map_err(|error| error.to_string())?;
        results.push(json!({"name":file.name,"path":path,"bytes":bytes.len()}));
    }
    Ok(json!(results))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use crate::stdio::forward_stdio;

    #[test]
    fn connection_publication_is_atomic_owned_and_migrates_only_the_standard_path() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("ai-connection.json");
        let (_server, info) = test_server();
        publish_connection(&path, &info).unwrap();
        assert!(crate::stdio::read_connection(&path).unwrap() == info);
        let owner = std::fs::OpenOptions::new().read(true).write(true).create(true).truncate(false).open(path.with_extension("lock")).unwrap();
        owner.try_lock().unwrap();
        let another = std::fs::OpenOptions::new().read(true).write(true).open(path.with_extension("lock")).unwrap();
        assert!(another.try_lock().is_err());
        let stop = Arc::new(AtomicBool::new(false));
        drop(Running { stop: stop.clone(), info: info.clone(), path: path.clone(), _owner: owner });
        assert!(stop.load(Ordering::Relaxed));
        assert!(!path.exists());
        another.try_lock().unwrap();
        publish_connection(&path, &info).unwrap();
        let mut newer = info.clone(); newer.token = "test-newer".into();
        publish_connection(&path, &newer).unwrap();
        drop(Running { stop, info, path: path.clone(), _owner: another });
        assert!(crate::stdio::read_connection(&path).unwrap() == newer);
        let legacy = dirs::data_dir().unwrap().join(IDENTIFIER).join("ai-connection.json");
        assert!(resolve_connection_path(Some(legacy.clone()), &legacy) == resolve_connection_path(None, &legacy));
        assert!(resolve_connection_path(Some(path.clone()), &legacy) == path);
        if cfg!(target_os = "windows") { assert!(resolve_connection_path(None, &legacy).starts_with(dirs::home_dir().unwrap().join(".tcg-manager"))); }
    }

    #[test]
    fn stdio_reloads_rotated_connection_and_reports_missing_file_without_replaying() {
        let (first, initial) = test_server();
        let (second, mut rotated) = test_server();
        rotated.token = "rotated-test-only".into();
        let serve = |server: tiny_http::Server, info: Connection, requests: usize| std::thread::spawn(move || {
            let mut methods = Vec::new();
            for _ in 0..requests {
                let mut request = server.recv_timeout(Duration::from_secs(5)).unwrap().unwrap();
                assert!(header(&request, "Authorization") == Some(format!("Bearer {}", info.token)));
                if request.method().as_str() == "DELETE" { reply(request, 202, Value::Null, ""); methods.push("DELETE".to_string()); continue; }
                let mut body = String::new(); request.as_reader().read_to_string(&mut body).unwrap();
                let message: Value = serde_json::from_str(&body).unwrap();
                methods.push(message["method"].as_str().unwrap().to_string());
                if message.get("id").is_some() { reply(request, 200, json!({"jsonrpc":"2.0","id":message["id"],"result":{}}), "test-session"); }
                else { reply(request, 202, Value::Null, "test-session"); }
            }
            methods
        });
        let first_worker = serve(first, initial.clone(), 3);
        let second_worker = serve(second, rotated.clone(), 8);
        let input = b"{\"id\":1,\"method\":\"initialize\"}\n{\"method\":\"notifications/initialized\"}\n{\"id\":2,\"method\":\"tools/list\"}\n{\"id\":3,\"method\":\"tools/call\"}\n{\"id\":4,\"method\":\"tools/call\"}\n";
        let mut count = 0;
        let mut output = Vec::new();
        forward_stdio(|| { count += 1; match count { 1 | 2 => Ok(initial.clone()), 4 => Err("CONNECTION_FILE_MISSING".into()), _ => Ok(rotated.clone()) } }, Cursor::new(input), &mut output).unwrap();
        assert_eq!(first_worker.join().unwrap(), ["initialize", "notifications/initialized", "DELETE"]);
        assert_eq!(second_worker.join().unwrap(), ["initialize", "notifications/initialized", "tools/list", "DELETE", "initialize", "notifications/initialized", "tools/call", "DELETE"]);
        let replies: Vec<Value> = String::from_utf8(output).unwrap().lines().map(|line| serde_json::from_str(line).unwrap()).collect();
        assert_eq!(replies.iter().map(|r| r["id"].as_u64().unwrap()).collect::<Vec<_>>(), [1, 2, 3, 4]);
        assert_eq!(replies[2]["error"]["message"], "CONNECTION_FILE_MISSING");
        assert!(replies[3].get("result").is_some());
    }

    fn test_server() -> (tiny_http::Server, Connection) {
        let server = tiny_http::Server::http((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = server.server_addr().to_ip().unwrap().port();
        (
            server,
            Connection {
                url: format!("http://127.0.0.1:{port}/mcp"),
                token: "test-only".into(),
                port,
            },
        )
    }

    #[test]
    fn stdio_forwards_large_native_responses_as_one_json_line() {
        let (server, info) = test_server();
        let expected =
            json!({"jsonrpc":"2.0","id":1,"result":{"cards":"赤のカード\n".repeat(20000)}});
        let response = expected.clone();
        let worker = std::thread::spawn(move || {
            let request = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
            // The real native server changes to chunked HTTP/1.1 above 32 KiB.
            reply(request, 200, response, "test-session");
            let close = server
                .recv_timeout(Duration::from_secs(5))
                .unwrap()
                .unwrap();
            assert_eq!(close.method().as_str(), "DELETE");
            assert_eq!(
                header(&close, "Mcp-Session-Id").as_deref(),
                Some("test-session")
            );
            reply(close, 202, Value::Null, "");
        });
        let mut output = Vec::new();
        forward_stdio(
            || Ok(info.clone()),
            Cursor::new(b"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\"}\n"),
            &mut output,
        )
        .unwrap_or_else(|error| panic!("{error}"));
        worker.join().unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&output).unwrap(), expected);
        assert_eq!(output.iter().filter(|&&byte| byte == b'\n').count(), 1);
    }

    #[test]
    fn stdio_releases_session_on_http_or_json_failure() {
        for malformed in [false, true] {
            let (server, info) = test_server();
            let worker = std::thread::spawn(move || {
                let request = server
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .unwrap();
                reply(
                    request,
                    200,
                    json!({"jsonrpc":"2.0","id":1,"result":{}}),
                    "test-session",
                );
                let request = server
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .unwrap();
                assert_eq!(
                    header(&request, "Mcp-Session-Id").as_deref(),
                    Some("test-session")
                );
                if malformed {
                    request
                        .respond(tiny_http::Response::from_string("invalid json"))
                        .unwrap();
                } else {
                    reply(request, 503, json!({"error":"unavailable"}), "test-session");
                }
                let close = server
                    .recv_timeout(Duration::from_secs(5))
                    .unwrap()
                    .expect("error path must DELETE the session");
                assert_eq!(close.method().as_str(), "DELETE");
                reply(close, 202, Value::Null, "");
            });
            let mut output = Vec::new();
            assert!(
                forward_stdio(|| Ok(info.clone()), Cursor::new(b"{\"id\":1}\n{\"id\":2}\n"), &mut output)
                    .is_ok()
            );
            worker.join().unwrap();
            let replies: Vec<Value> = String::from_utf8(output).unwrap().lines().map(|line| serde_json::from_str(line).unwrap()).collect();
            assert_eq!(replies[0]["id"], 1);
            assert_eq!(replies[1]["error"]["code"], -32001);
        }
    }
}

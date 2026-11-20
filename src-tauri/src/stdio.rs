use crate::bridge::{Connection, connection_path};
use serde_json::{Value, json};
use std::{io::{BufRead, Read, Write}, net::{Ipv4Addr, SocketAddrV4, TcpStream}, path::Path, time::Duration};

const LIMIT: u64 = 700 * 1024 * 1024;

pub fn read_connection(path: &Path) -> Result<Connection, String> {
    let bytes = std::fs::read(path).map_err(|error| if error.kind() == std::io::ErrorKind::NotFound {
        "CONNECTION_FILE_MISSING: 接続ファイルがありません。TCGで停止中なら接続を開始してください。開始済みなら、同じWindowsユーザーのアプリと登録先を確認してください。".to_string()
    } else { "CONNECTION_FILE_UNREADABLE: 接続ファイルを読めません。登録先とアクセス権を確認してください。".into() })?;
    let info: Connection = serde_json::from_slice(&bytes).map_err(|_| "CONNECTION_FILE_INVALID: 接続ファイルの形式が不正です。TCGの接続状態を確認してください。")?;
    if info.port == 0 || info.url != format!("http://127.0.0.1:{}/mcp", info.port)
        || info.token.is_empty() || info.token.len() > 256 || !info.token.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_') {
        return Err("CONNECTION_FILE_INVALID: 接続先・キーの形式が不正です。TCGの接続状態を確認してください。".into());
    }
    Ok(info)
}

fn exchange(info: &Connection, session: &mut String, method: &str, message: &str) -> Result<Option<Value>, String> {
    let address = SocketAddrV4::new(Ipv4Addr::LOCALHOST, info.port).into();
    let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(2))
        .map_err(|_| "APP_UNREACHABLE: 記録された接続先に届きません。TCGで開始済みなら、アプリの接続ファイルとAI側の登録先を確認してください。")?;
    stream.set_read_timeout(Some(Duration::from_secs(125))).map_err(|_| "BRIDGE_IO: 中継を準備できません。")?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|_| "BRIDGE_IO: 中継を準備できません。")?;
    let session_header = if session.is_empty() { String::new() } else { format!("Mcp-Session-Id: {session}\r\n") };
    write!(stream, "{method} /mcp HTTP/1.0\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nAccept: application/json\r\n{}Content-Length: {}\r\nConnection: close\r\n\r\n{}", info.port, info.token, session_header, message.len(), message)
        .map_err(|_| "RESULT_UNKNOWN: 送信中に切断しました。更新は同じrequestIdと引数で再試行し、結果を読み直してください。")?;
    let mut bytes = Vec::new();
    stream.take(LIMIT + 1).read_to_end(&mut bytes)
        .map_err(|_| "RESULT_UNKNOWN: 応答を確認できませんでした。更新は同じrequestIdと引数で再試行し、結果を読み直してください。")?;
    if bytes.len() as u64 > LIMIT { return Err("RESPONSE_TOO_LARGE: AI応答が大きすぎます。取得する件数を減らしてください。".into()); }
    let response = String::from_utf8(bytes).map_err(|_| "INVALID_RESPONSE: 応答の文字形式が不正です。")?;
    let (headers, body) = response.split_once("\r\n\r\n").ok_or("INVALID_RESPONSE: HTTP応答を確認できませんでした。")?;
    let status = headers.split_whitespace().nth(1).unwrap_or("");
    for row in headers.lines().skip(1) {
        if let Some((name, value)) = row.split_once(':') {
            if name.eq_ignore_ascii_case("mcp-session-id") {
                let value = value.trim();
                if value.len() > 128 || !value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') { return Err("INVALID_RESPONSE: 接続識別子の形式が不正です。".into()); }
                *session = value.into();
            }
        }
    }
    match status {
        "200" | "202" | "204" => {},
        "401" => return Err("AUTH_REJECTED: 接続先には届きましたが認証されませんでした。開始操作を繰り返さず、接続ファイルの保存先とAI側の登録先を確認してください。".into()),
        "403" => return Err("CONNECTION_REJECTED: 接続が停止済みか、接続先・要求形式が一致しません。TCGの接続状態を確認してください。".into()),
        "429" => return Err("APP_BUSY: 処理が混み合っています。同じ内容で後から再試行してください。".into()),
        "504" => return Err("RESULT_UNKNOWN: アプリの応答が時間内に届きませんでした。更新は同じrequestIdと引数で再試行し、結果を読み直してください。".into()),
        _ => return Err("APP_UNAVAILABLE: アプリの操作受付で失敗しました。TCGの画面とエラーを確認してください。".into()),
    }
    if body.trim().is_empty() { Ok(None) } else {
        serde_json::from_str(body).map(Some).map_err(|_| "INVALID_RESPONSE: MCP応答の形式が不正です。".into())
    }
}

fn close(info: &Connection, session: &str) {
    if session.is_empty() { return; }
    if let Ok(mut stream) = TcpStream::connect_timeout(&SocketAddrV4::new(Ipv4Addr::LOCALHOST, info.port).into(), Duration::from_secs(1)) {
        let _ = stream.set_write_timeout(Some(Duration::from_secs(1)));
        let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
        let _ = write!(stream, "DELETE /mcp HTTP/1.0\r\nHost: 127.0.0.1:{}\r\nAuthorization: Bearer {}\r\nMcp-Session-Id: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n", info.port, info.token, session);
        let _ = stream.read(&mut [0; 64]);
    }
}

pub fn run_stdio() -> Result<(), Box<dyn std::error::Error>> {
    let path = connection_path();
    forward_stdio(|| read_connection(&path), std::io::stdin().lock(), std::io::stdout().lock())
}

// Read-only protocol checks. Never print credentials, raw HTTP, or game data.
pub fn diagnose() -> Value {
    let path = connection_path();
    let mut report = json!({"ok":false,"connectionFile":path,"stage":"connection_file","aiToolAvailability":"not_verified"});
    let info = match read_connection(&path) { Ok(info) => info, Err(error) => { report["error"] = json!(error); return report; } };
    let mut session = String::new();
    let result = (|| -> Result<(), String> {
        report["stage"] = json!("initialize");
        let initialize = json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"tcg-connection-diagnostic","version":"1"}}});
        let response = exchange(&info, &mut session, "POST", &initialize.to_string())?.ok_or("INITIALIZE_FAILED: 初期化応答がありません。")?;
        if response.get("result").is_none() { return Err("INITIALIZE_FAILED: MCP初期化が拒否されました。".into()); }
        report["authenticated"] = json!(true);
        exchange(&info, &mut session, "POST", r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#)?;
        report["stage"] = json!("tools_list");
        let response = exchange(&info, &mut session, "POST", r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#)?.ok_or("TOOLS_UNAVAILABLE: ツール一覧の応答がありません。")?;
        let tools = response["result"]["tools"].as_array().ok_or("TOOLS_UNAVAILABLE: ツール一覧を取得できません。")?;
        if !tools.iter().any(|tool| tool["name"] == "tcg_status") { return Err("TOOLS_UNAVAILABLE: tcg_statusが一覧にありません。".into()); }
        report["toolCount"] = json!(tools.len());
        report["stage"] = json!("tcg_status");
        let response = exchange(&info, &mut session, "POST", r#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"tcg_status","arguments":{}}}"#)?.ok_or("STATUS_FAILED: tcg_statusの応答がありません。")?;
        if response["result"]["structuredContent"]["status"] != "ready" { return Err("STATUS_FAILED: tcg_statusが成功していません。".into()); }
        Ok(())
    })();
    close(&info, &session);
    match result { Ok(()) => { report["ok"] = json!(true); }, Err(error) => { report["error"] = json!(error); } }
    report
}

pub(crate) fn forward_stdio(mut read: impl FnMut() -> Result<Connection, String>, input: impl BufRead, mut output: impl Write) -> Result<(), Box<dyn std::error::Error>> {
    let mut active: Option<Connection> = None;
    let mut session = String::new();
    let mut initialization: Option<Value> = None;
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        for line in input.lines() {
            let line = line?;
            if line.trim().is_empty() { continue; }
            let message: Value = serde_json::from_str(&line).map_err(|_| "INVALID_REQUEST: MCP要求の形式が不正です。")?;
            let response = (|| -> Result<Option<Value>, String> {
                // Do not hold a startup snapshot, including while stopped or restarting.
                let info = read()?;
                if active.as_ref() != Some(&info) {
                    if let Some(previous) = active.take() { close(&previous, &session); }
                    session.clear();
                    active = Some(info.clone());
                    if message["method"] != "initialize" {
                        if let Some(initialize) = &initialization {
                            let reply = exchange(&info, &mut session, "POST", &initialize.to_string())?;
                            if !reply.as_ref().is_some_and(|r| r.get("result").is_some()) { return Err("INITIALIZE_FAILED: MCPの再初期化に失敗しました。AI側の接続を開き直してください。".into()); }
                            exchange(&info, &mut session, "POST", r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#)?;
                        }
                    }
                }
                let reply = exchange(&info, &mut session, "POST", &line)?;
                if message["method"] == "initialize" && reply.as_ref().is_some_and(|r| r.get("result").is_some()) { initialization = Some(message.clone()); }
                Ok(reply)
            })();
            let reply = match response {
                Ok(reply) => reply,
                Err(error) => {
                    if let Some(previous) = active.take() { close(&previous, &session); }
                    session.clear();
                    // No automatic replay: a lost response may already have saved data.
                    if let Some(id) = message.get("id") { Some(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32001,"message":error}})) }
                    else { eprintln!("{error}"); None }
                }
            };
            if let Some(reply) = reply { writeln!(output, "{reply}")?; output.flush()?; }
        }
        Ok(())
    })();
    if let Some(info) = active { close(&info, &session); }
    result
}

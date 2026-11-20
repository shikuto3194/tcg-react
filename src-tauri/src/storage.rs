//! Windows WebView storage must not inherit a launcher's MSIX AppData view.
//! Copy a closed, unredirected legacy profile once; never merge or remove it.
use serde_json::{Value, json};
use std::{fs::{self, File, OpenOptions}, io::{self, Write}, path::{Path, PathBuf}};
use std::os::windows::fs::OpenOptionsExt;

const MARKER: &str = "storage.json";
const REDIRECTED: &str = "起動元によって別の保存場所が参照されています。初回の更新は、TCGを閉じて普段のショートカットから開いてください。元のデータは変更していません。";
pub struct Storage {
    pub directory: PathBuf,
    _owner: File,
}
fn failure(message: &str) -> io::Error { io::Error::other(message) }
fn paths() -> io::Result<(PathBuf, PathBuf)> {
    let root = dirs::home_dir().ok_or_else(|| failure("ユーザーフォルダを取得できませんでした。"))?.join(".tcg-manager");
    let legacy = dirs::data_local_dir().ok_or_else(|| failure("以前の保存場所を取得できませんでした。"))?.join(crate::bridge::IDENTIFIER);
    Ok((root, legacy))
}
fn same_path(left: &Path, right: &Path) -> bool {
    let normalize = |path: &Path| {
        let path = path.as_os_str().to_string_lossy().replace('/', "\\");
        path.strip_prefix(r"\\?\").unwrap_or(&path).to_owned()
    };
    normalize(left).eq_ignore_ascii_case(&normalize(right))
}
fn require_same_path(expected: &Path, physical: &Path) -> io::Result<()> {
    if !same_path(expected, physical) { return Err(failure(REDIRECTED)); }
    Ok(())
}

// Keep a read handle to every source file. Denying write/delete sharing rejects
// live WebViews and prevents the copied files from changing during migration.
struct SourceFile { relative: PathBuf, handle: File }
fn source_files(root: &Path, directory: &Path, files: &mut Vec<SourceFile>) -> io::Result<()> {
    let expected_root = fs::canonicalize(root)?;
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        let kind = entry.file_type()?;
        if kind.is_symlink() { return Err(failure("以前の保存場所にリンクがあるため、更新を中止しました。元のデータは変更していません。")); }
        let relative = path.strip_prefix(root).map_err(|_| failure("保存場所を確認できませんでした。"))?.to_path_buf();
        require_same_path(&expected_root.join(&relative), &fs::canonicalize(&path)?)?;
        if kind.is_dir() { source_files(root, &path, files)?; }
        else if kind.is_file() {
            let handle = OpenOptions::new().read(true).share_mode(1).open(&path)
                .map_err(|_| failure("以前の保存データを読み取れませんでした。TCGをすべて閉じ、少し待って開き直してください。続く場合は保存先のアクセス権を確認してください。"))?;
            files.push(SourceFile { relative, handle });
        } else { return Err(failure("以前の保存場所に未対応のファイルがあります。")); }
    }
    Ok(())
}

pub fn prepare() -> io::Result<Storage> {
    let (root, legacy) = paths()?;
    prepare_at(&root, &legacy)
}
fn prepare_at(root: &Path, legacy: &Path) -> io::Result<Storage> {
    fs::create_dir_all(root)?;
    let owner = OpenOptions::new().read(true).write(true).create(true).truncate(false).open(root.join("storage.lock"))?;
    owner.try_lock().map_err(|_| failure("TCGは起動済みか、保存場所の準備中です。開いているTCGの画面を確認してください。"))?;
    let directory = root.join("webview");
    if directory.try_exists()? {
        let marker: Value = serde_json::from_slice(&fs::read(directory.join(MARKER))?)?;
        if marker["schemaVersion"] != 1 || marker["application"] != crate::bridge::IDENTIFIER {
            return Err(failure("保存場所の記録を確認できませんでした。データを保護するため起動を中止しました。"));
        }
        return Ok(Storage { directory, _owner: owner });
    }
    let source = legacy.join("EBWebView");
    let mut files = Vec::new();
    let migrated = source.try_exists()?;
    if migrated {
        require_same_path(&source, &fs::canonicalize(&source)?)?;
        source_files(&source, &source, &mut files)?;
    }
    let staging = tempfile::Builder::new().prefix("webview-migration-").tempdir_in(root)?;
    let mut bytes = 0_u64;
    for source_file in &mut files {
        let destination = staging.path().join("EBWebView").join(&source_file.relative);
        fs::create_dir_all(destination.parent().ok_or_else(|| failure("保存先を確認できませんでした。"))?)?;
        let mut output = File::create(destination)?;
        bytes += io::copy(&mut source_file.handle, &mut output)?;
        output.sync_all()?;
    }
    let marker = json!({"schemaVersion":1,"application":crate::bridge::IDENTIFIER,"migrated":migrated,"source":if migrated {Some(source)}else{None},"files":files.len(),"bytes":bytes});
    let mut output = File::create(staging.path().join(MARKER))?;
    output.write_all(serde_json::to_string_pretty(&marker)?.as_bytes())?;
    output.sync_all()?;
    drop(output);
    // The destination is never exposed with an incomplete profile or marker.
    fs::rename(staging.path(), &directory)?;
    Ok(Storage { directory, _owner: owner })
}

/// Read-only diagnosis usable before opening a WebView. No card data or keys.
pub fn diagnose() -> Value {
    let (root, legacy) = match paths() { Ok(paths) => paths, Err(error) => return json!({"ok":false,"error":error.to_string()}) };
    let source = legacy.join("EBWebView");
    let stable = root.join("webview");
    let mut probes = Vec::new();
    for relative in ["Default/Preferences", "Default/IndexedDB/http_tauri.localhost_0.indexeddb.leveldb/CURRENT"] {
        let logical = source.join(relative);
        if let Ok(physical) = fs::canonicalize(&logical) {
            let expected = fs::canonicalize(&source).ok().map(|base| base.join(relative));
            let redirected = expected.as_ref().is_some_and(|expected| !same_path(expected, &physical));
            probes.push(json!({"logical":logical,"physical":physical,"redirected":redirected}));
        }
    }
    json!({"ok":true,"dataDirectory":stable,"initialized":stable.join(MARKER).is_file(),"legacyProbes":probes})
}

pub fn show_error(error: &io::Error) {
    use windows::{core::HSTRING, Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK}};
    let text = HSTRING::from(format!("保存場所を準備できませんでした。\n\n{error}\n\n保存データの削除や初期化は行っていません。"));
    unsafe { MessageBoxW(None, &text, &HSTRING::from("TCG マネージャー"), MB_OK | MB_ICONERROR); }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (tempfile::TempDir, PathBuf, PathBuf) {
        let temp = tempfile::tempdir().unwrap();
        let physical = fs::canonicalize(temp.path()).unwrap();
        let root = physical.join("stable");
        let legacy = physical.join("legacy");
        fs::create_dir_all(legacy.join("EBWebView/Default/IndexedDB/test")).unwrap();
        fs::write(legacy.join("EBWebView/Default/IndexedDB/test/CURRENT"), b"original-data").unwrap();
        (temp, root, legacy)
    }
    #[test]
    fn copies_once_preserves_legacy_and_never_merges_on_restart() {
        let (_temp, root, legacy) = fixture();
        let file = "EBWebView/Default/IndexedDB/test/CURRENT";
        let storage = prepare_at(&root, &legacy).unwrap();
        assert_eq!(fs::read(storage.directory.join(file)).unwrap(), b"original-data");
        assert_eq!(fs::read(legacy.join(file)).unwrap(), b"original-data");
        fs::write(storage.directory.join(file), b"newer-data").unwrap();
        drop(storage);
        let storage = prepare_at(&root, &legacy).unwrap();
        assert_eq!(fs::read(storage.directory.join(file)).unwrap(), b"newer-data");
    }
    #[test]
    fn active_source_is_rejected_without_publishing_partial_data() {
        let (_temp, root, legacy) = fixture();
        let _writer = OpenOptions::new().read(true).write(true).open(legacy.join("EBWebView/Default/IndexedDB/test/CURRENT")).unwrap();
        assert!(prepare_at(&root, &legacy).is_err());
        assert!(!root.join("webview").exists());
    }
    #[test]
    fn second_instance_cannot_open_the_profile() {
        let (_temp, root, legacy) = fixture();
        let _storage = prepare_at(&root, &legacy).unwrap();
        assert!(prepare_at(&root, &legacy).is_err());
    }
    #[test]
    fn unknown_existing_destination_is_never_replaced() {
        let (_temp, root, legacy) = fixture();
        fs::create_dir_all(root.join("webview")).unwrap();
        fs::write(root.join("webview/keep"), b"keep").unwrap();
        assert!(prepare_at(&root, &legacy).is_err());
        assert_eq!(fs::read(root.join("webview/keep")).unwrap(), b"keep");
    }
    #[test]
    fn detects_redirected_files_even_if_parent_directory_is_unchanged() {
        let expected = Path::new(r"\\?\C:\Users\user\AppData\Local\local.tcg.manager\EBWebView\Default\CURRENT");
        let physical = Path::new(r"\\?\C:\Users\user\AppData\Local\Packages\launcher\LocalCache\Local\local.tcg.manager\EBWebView\Default\CURRENT");
        assert!(require_same_path(expected, physical).is_err());
        assert!(require_same_path(expected, Path::new(&expected.to_string_lossy().to_uppercase())).is_ok());
        assert!(require_same_path(Path::new(r"C:\Users\user\AppData\Local\local.tcg.manager\EBWebView"), Path::new(r"\\?\C:\Users\user\AppData\Local\local.tcg.manager\EBWebView")).is_ok());
        assert!(require_same_path(Path::new(r"C:\Users\user\AppData\Local\local.tcg.manager\EBWebView"), Path::new(r"\\?\C:\Users\user\AppData\Local\Packages\launcher\LocalCache\Local\local.tcg.manager\EBWebView")).is_err());
    }
    #[test]
    fn fresh_install_initializes_stable_storage_without_legacy() {
        let temp = tempfile::tempdir().unwrap();
        let storage = prepare_at(&temp.path().join("stable"), &temp.path().join("absent")).unwrap();
        let marker: Value = serde_json::from_slice(&fs::read(storage.directory.join(MARKER)).unwrap()).unwrap();
        assert_eq!(marker["migrated"], false);
    }
}

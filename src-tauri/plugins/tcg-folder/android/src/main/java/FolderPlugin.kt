package local.tcg.folder

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.util.Base64
import androidx.activity.result.ActivityResult
import androidx.documentfile.provider.DocumentFile
import androidx.core.content.FileProvider
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.io.File
import java.util.UUID

@InvokeArg
class OpenFileArgs {
    var name: String = ""
    var mime: String = ""
    var base64: String = ""
}

@InvokeArg
class CopyDocumentArgs {
    var path: String = ""
    var uri: String = ""
}

@InvokeArg
class ExportFileArgs {
    var name: String = ""
    var path: String = ""
}

@InvokeArg
class ExportBatchArgs {
    var name: String = ""
    var files: Array<ExportFileArgs> = emptyArray()
}

@TauriPlugin
class FolderPlugin(private val activity: Activity): Plugin(activity) {
    private fun exportSource(path: String): File {
        val source = File(path).canonicalFile
        val roots = listOf(File(activity.cacheDir, "tcg-exports"), File(activity.applicationInfo.dataDir, "ai-exports"))
        check(source.isFile && roots.any { source.path.startsWith(it.canonicalPath + File.separator) }) { "保存元のファイルを確認してください。" }
        return source
    }
    private fun copyToDocument(source: File, uri: Uri) {
        check(uri.scheme == "content") { "保存先を選び直してください。" }
        source.inputStream().use { input ->
            // Keep ownership of the provider stream so close updates its size.
            activity.contentResolver.openOutputStream(uri, "wt")?.use { output ->
                input.copyTo(output, 65536)
            } ?: error("保存先を開けませんでした。")
        }
    }
    @Command
    fun saveFiles(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        startActivityForResult(invoke, intent, "saveFilesResult")
    }
    @ActivityCallback
    fun saveFilesResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) { invoke.resolve(JSObject().put("status", "cancelled")); return }
        val uri = result.data?.data
        if (uri == null) { invoke.reject("保存先を選び直してください。"); return }
        Thread {
            var count = 0
            var total = 0
            var destination: DocumentFile? = null
            var current: DocumentFile? = null
            try {
                val args = invoke.parseArgs(ExportBatchArgs::class.java)
                total = args.files.size
                fun safeName(name: String) = name.isNotBlank() && name != "." && name != ".." && name.none { it.code < 32 || it in "<>:\"/\\|?*" }
                check(total > 0 && safeName(args.name) && args.files.all { safeName(it.name) }) { "保存するファイル名を確認してください。" }
                check(args.files.map { it.name.lowercase() }.toSet().size == total) { "ファイル名が重複しています。" }
                val sources = args.files.map { exportSource(it.path) }
                val parent = DocumentFile.fromTreeUri(activity, uri) ?: error("保存先を開けませんでした。")
                check(parent.findFile(args.name) == null) { "同じ名前のフォルダがあります。もう一度保存してください。" }
                val folder = parent.createDirectory(args.name) ?: error("出力フォルダを作成できませんでした。")
                destination = folder
                for ((index, file) in args.files.withIndex()) {
                    val mime = when (file.name.substringAfterLast('.').lowercase()) {
                        "pdf" -> "application/pdf"
                        "png" -> "image/png"
                        "svg" -> "image/svg+xml"
                        "json" -> "application/json"
                        else -> "application/octet-stream"
                    }
                    val document = folder.createFile(mime, file.name) ?: error("ファイルを作成できませんでした。")
                    current = document
                    copyToDocument(sources[index], document.uri)
                    count++
                    current = null
                }
                invoke.resolve(JSObject().put("status", "saved").put("count", count).put("path", folder.uri.toString()))
            } catch (error: Exception) {
                try { current?.delete() } catch (_: Exception) { }
                val detail = if (destination != null) "${total}件中${count}件を保存しました。保存先：${destination.name}。残りは保存できませんでした。" else ""
                invoke.reject(detail + (error.message ?: "ファイルを保存できませんでした。"))
            }
        }.start()
    }
    @Command
    fun copyDocument(invoke: Invoke) {
        Thread {
            try {
                val args = invoke.parseArgs(CopyDocumentArgs::class.java)
                copyToDocument(exportSource(args.path), Uri.parse(args.uri))
                invoke.resolve()
            } catch (error: Exception) { invoke.reject(error.message ?: "ファイルを保存できませんでした。") }
        }.start()
    }
    @Command
    fun openFile(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(OpenFileArgs::class.java)
            check(args.name.matches(Regex(".*\\.(png|svg|pdf|json)$", RegexOption.IGNORE_CASE))) { "対応していない出力形式です。" }
            check(args.base64.length <= 140 * 1024 * 1024) { "出力ファイルが大きすぎます。" }
            val dir = File(activity.cacheDir, "tcg-exports").apply { mkdirs() }
            val file = File(dir, "${UUID.randomUUID()}-${args.name.replace(Regex("[^\\p{L}\\p{N}_. -]"), "_").takeLast(150)}")
            file.writeBytes(Base64.decode(args.base64, Base64.DEFAULT))
            val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", file)
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, args.mime)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.startActivity(intent)
            invoke.resolve()
        } catch (error: Exception) { invoke.reject(error.message ?: "ファイルを開けませんでした。") }
    }
    @Command
    fun pickFolder(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivityForResult(invoke, intent, "folderResult")
    }
    @ActivityCallback
    fun folderResult(invoke: Invoke, result: ActivityResult) {
        if (result.resultCode != Activity.RESULT_OK) { invoke.resolve(JSObject().put("files", JSONArray())); return }
        val uri = result.data?.data
        if (uri == null) { invoke.reject("フォルダを開けませんでした。"); return }
        Thread {
            try {
                val root = DocumentFile.fromTreeUri(activity, uri) ?: error("フォルダを開けませんでした。")
                val files = JSONArray()
                var total = 0L
                var visited = 0
                fun walk(file: DocumentFile, path: String, depth: Int) {
                    visited++
                    check(depth <= 32 && visited <= 20000) { "フォルダ内のファイルが多すぎます。分けて読み込んでください。" }
                    if (file.isDirectory) {
                        for (child in file.listFiles()) walk(child, "$path/${child.name ?: "file"}", depth + 1)
                    } else if (Regex(".*\\.(png|jpe?g|webp|gif|csv|json)$", RegexOption.IGNORE_CASE).matches(path)) {
                        val remaining = 100L * 1024 * 1024 - total
                        check(file.length() <= remaining && files.length() < 10000) { "1回に読み込めるのは100MB・10000ファイルまでです。" }
                        val bytes = activity.contentResolver.openInputStream(file.uri)?.use { input ->
                            val output = java.io.ByteArrayOutputStream()
                            val buffer = ByteArray(65536)
                            while (true) {
                                val count = input.read(buffer)
                                if (count < 0) break
                                check(output.size().toLong() + count <= remaining) { "1回に読み込めるのは100MBまでです。" }
                                output.write(buffer, 0, count)
                            }
                            output.toByteArray()
                        } ?: error("ファイルを開けませんでした。")
                        total += bytes.size
                        files.put(JSObject().put("path", path).put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP)))
                    }
                }
                walk(root, root.name ?: "folder", 0)
                invoke.resolve(JSObject().put("files", files))
            } catch (error: Exception) { invoke.reject(error.message ?: "フォルダを読み込めませんでした。") }
        }.start()
    }
}

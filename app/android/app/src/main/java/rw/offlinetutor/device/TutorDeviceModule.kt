package rw.offlinetutor.device

import android.app.Activity
import android.content.ClipData
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.os.StatFs
import android.provider.MediaStore
import android.provider.OpenableColumns
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import java.util.UUID
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread
import rw.offlinetutor.BuildConfig

/**
 * Build identity, model installation from a picked file, and research
 * exports to Downloads (src/native/NativeTutorDevice.ts is the contract).
 *
 * The model is copied to `<filesDir>/models/<name>.part` while its SHA-256
 * is computed, and renamed over the old file only when its size and hash
 * match, so a cancelled or damaged copy never replaces a working model.
 */
class TutorDeviceModule(private val context: ReactApplicationContext) :
  NativeTutorDeviceSpec(context), ActivityEventListener {

  private class Pending(val fileName: String, val sha256: String, val bytes: Long, val promise: Promise)

  private class Cancelled : Exception()

  private val phase = AtomicReference("idle")
  private val copied = AtomicLong(0)
  private val total = AtomicLong(-1)
  private val cancel = AtomicBoolean(false)

  @Volatile private var pending: Pending? = null

  private class PendingImport(val maxBytes: Int, val promise: Promise)

  @Volatile private var pendingImport: PendingImport? = null

  init {
    context.addActivityEventListener(this)
  }

  override fun getName(): String = NAME

  override fun getTypedExportedConstants(): MutableMap<String, Any> =
    mutableMapOf(
      "versionName" to BuildConfig.VERSION_NAME,
      "versionCode" to BuildConfig.VERSION_CODE,
      "buildType" to BuildConfig.BUILD_TYPE,
      "applicationId" to BuildConfig.APPLICATION_ID,
      "gitCommit" to BuildConfig.GIT_COMMIT,
      "filesDir" to context.filesDir.absolutePath,
      "pilot" to BuildConfig.PILOT,
      "sdkInt" to Build.VERSION.SDK_INT,
      "deviceModel" to "${Build.MANUFACTURER} ${Build.MODEL}",
      "installId" to installId(),
    )

  /** Made once and kept: it names this tablet in the progress it shares. */
  private fun installId(): String {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    return prefs.getString(KEY_INSTALL_ID, null)
      ?: UUID.randomUUID().toString().also { prefs.edit().putString(KEY_INSTALL_ID, it).apply() }
  }

  override fun pickAndInstallModel(fileName: String, expectedSha256: String, expectedBytes: Double, promise: Promise) {
    if (pending != null || phase.get() == "copying") {
      promise.resolve(result(false, "An installation is already running.", "", 0))
      return
    }
    val activity = context.currentActivity
    if (activity == null) {
      promise.resolve(result(false, "The app is not in the foreground.", "", 0))
      return
    }
    pending = Pending(fileName, expectedSha256.lowercase(), expectedBytes.toLong(), promise)
    copied.set(0)
    total.set(-1)
    cancel.set(false)
    phase.set("picking")
    val intent =
      Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
      }
    try {
      activity.startActivityForResult(intent, REQUEST_PICK)
    } catch (e: Exception) {
      pending = null
      phase.set("idle")
      promise.resolve(result(false, "The file picker could not be opened: ${e.message}", "", 0))
    }
  }

  override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQUEST_IMPORT) {
      onImportResult(resultCode, data)
      return
    }
    if (requestCode != REQUEST_PICK) {
      return
    }
    val p = pending ?: return
    val uri = data?.data
    if (resultCode != Activity.RESULT_OK || uri == null) {
      finish(p, false, "No file was chosen.", "", 0)
      return
    }
    thread(name = "model-install") { copy(p, uri) }
  }

  override fun onNewIntent(intent: Intent) = Unit

  private fun copy(p: Pending, uri: Uri) {
    val dir = File(context.filesDir, "models").apply { mkdirs() }
    val part = File(dir, "${p.fileName}.part")
    val target = File(dir, p.fileName)
    val marker = File(dir, "${p.fileName}.sha256")
    try {
      val size = sizeOf(uri)
      total.set(size)
      if (size > 0 && StatFs(dir.absolutePath).availableBytes < size + SPARE_BYTES) {
        finish(p, false, "There is not enough free storage on this tablet for the model.", "", 0)
        return
      }
      phase.set("copying")
      val digest = MessageDigest.getInstance("SHA-256")
      val input = context.contentResolver.openInputStream(uri) ?: throw IOException("The file could not be opened.")
      input.use { inp ->
        FileOutputStream(part).use { out ->
          val buf = ByteArray(1 shl 20)
          while (true) {
            if (cancel.get()) {
              throw Cancelled()
            }
            val n = inp.read(buf)
            if (n < 0) {
              break
            }
            out.write(buf, 0, n)
            digest.update(buf, 0, n)
            copied.addAndGet(n.toLong())
          }
          out.fd.sync()
        }
      }
      val sha = digest.digest().joinToString("") { "%02x".format(it) }
      val bytes = part.length()
      if (p.bytes > 0 && bytes != p.bytes) {
        part.delete()
        finish(p, false, "The file has $bytes bytes, not ${p.bytes}: it is not the tutor model, or it is incomplete.", sha, bytes)
        return
      }
      if (p.sha256.isNotEmpty() && sha != p.sha256) {
        part.delete()
        finish(p, false, "The file's checksum does not match the tutor model: it is damaged or a different file.", sha, bytes)
        return
      }
      marker.delete()
      if (target.exists() && !target.delete()) {
        throw IOException("The old model file could not be replaced.")
      }
      if (!part.renameTo(target)) {
        throw IOException("The model file could not be moved into place.")
      }
      marker.writeText(sha)
      finish(p, true, "", sha, bytes)
    } catch (e: Cancelled) {
      part.delete()
      finish(p, false, "cancelled", "", copied.get())
    } catch (e: Exception) {
      part.delete()
      finish(p, false, e.message ?: e.javaClass.simpleName, "", copied.get())
    }
  }

  private fun sizeOf(uri: Uri): Long =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { c ->
      if (c.moveToFirst() && !c.isNull(0)) c.getLong(0) else -1L
    } ?: -1L

  private fun finish(p: Pending, ok: Boolean, reason: String, sha: String, bytes: Long) {
    pending = null
    phase.set(if (ok) "done" else "idle")
    p.promise.resolve(result(ok, reason, sha, bytes))
  }

  private fun result(ok: Boolean, reason: String, sha: String, bytes: Long): WritableMap =
    Arguments.createMap().apply {
      putBoolean("ok", ok)
      putString("reason", reason)
      putString("sha256", sha)
      putDouble("bytes", bytes.toDouble())
    }

  override fun installProgress(): WritableMap =
    Arguments.createMap().apply {
      putString("phase", phase.get())
      putDouble("copied", copied.get().toDouble())
      putDouble("total", total.get().toDouble())
    }

  override fun cancelModelInstall() {
    cancel.set(true)
  }

  override fun modelFileInfo(fileName: String): WritableMap {
    val dir = File(context.filesDir, "models")
    val file = File(dir, fileName)
    val marker = File(dir, "$fileName.sha256")
    return Arguments.createMap().apply {
      putBoolean("exists", file.isFile)
      putDouble("bytes", if (file.isFile) file.length().toDouble() else 0.0)
      putString("verifiedSha256", if (marker.isFile) marker.readText().trim() else "")
    }
  }

  override fun writeDownload(folder: String, fileName: String, mimeType: String, content: String, promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
      promise.reject("E_SDK", "Exporting needs Android 10 or later.")
      return
    }
    thread(name = "export-write") {
      try {
        val relative = "${Environment.DIRECTORY_DOWNLOADS}/$folder"
        val values =
          ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
            put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relative)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
          }
        val resolver = context.contentResolver
        val uri =
          resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("$fileName could not be created.")
        val out = resolver.openOutputStream(uri) ?: throw IOException("$fileName could not be written.")
        out.use { it.write(content.toByteArray(Charsets.UTF_8)) }
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        promise.resolve("$relative/$fileName")
      } catch (e: Exception) {
        promise.reject("E_WRITE", e.message ?: "The export could not be written.", e)
      }
    }
  }

  override fun freeBytes(): Double = StatFs(context.filesDir.absolutePath).availableBytes.toDouble()

  override fun shareText(fileName: String, mimeType: String, content: String, title: String, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.resolve(false)
      return
    }
    try {
      val dir = File(context.cacheDir, "share").apply { mkdirs() }
      dir.listFiles()?.forEach { it.delete() }
      val file = File(dir, fileName)
      file.writeText(content, Charsets.UTF_8)
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
      val send =
        Intent(Intent.ACTION_SEND).apply {
          type = mimeType
          putExtra(Intent.EXTRA_STREAM, uri)
          putExtra(Intent.EXTRA_TITLE, fileName)
          clipData = ClipData.newRawUri(fileName, uri)
          addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
      activity.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_SHARE", e.message ?: "The file could not be shared.", e)
    }
  }

  override fun pickTextFiles(maxBytes: Double, promise: Promise) {
    val activity = context.currentActivity
    if (activity == null) {
      promise.resolve(Arguments.createArray())
      return
    }
    if (pendingImport != null) {
      promise.reject("E_BUSY", "A file picker is already open.")
      return
    }
    pendingImport = PendingImport(maxBytes.toInt(), promise)
    val intent =
      Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      }
    try {
      activity.startActivityForResult(intent, REQUEST_IMPORT)
    } catch (e: Exception) {
      pendingImport = null
      promise.reject("E_PICK", "The file picker could not be opened: ${e.message}", e)
    }
  }

  private fun onImportResult(resultCode: Int, data: Intent?) {
    val p = pendingImport ?: return
    pendingImport = null
    val uris = mutableListOf<Uri>()
    if (resultCode == Activity.RESULT_OK && data != null) {
      val clip = data.clipData
      if (clip != null) {
        for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { uris.add(it) }
      } else {
        data.data?.let { uris.add(it) }
      }
    }
    thread(name = "progress-import") {
      val out = Arguments.createArray()
      for (uri in uris) {
        val name = nameOf(uri)
        val item = Arguments.createMap()
        item.putString("name", name)
        try {
          val bytes = readAtMost(uri, p.maxBytes + 1)
          if (bytes.size > p.maxBytes) {
            item.putString("content", "")
            item.putString("error", "The file is larger than a progress file can be.")
          } else {
            item.putString("content", String(bytes, Charsets.UTF_8))
            item.putString("error", "")
          }
        } catch (e: Exception) {
          item.putString("content", "")
          item.putString("error", e.message ?: "The file could not be read.")
        }
        out.pushMap(item)
      }
      p.promise.resolve(out)
    }
  }

  private fun nameOf(uri: Uri): String =
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
      if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
    } ?: (uri.lastPathSegment ?: "file")

  private fun readAtMost(uri: Uri, limit: Int): ByteArray {
    val input = context.contentResolver.openInputStream(uri) ?: throw IOException("The file could not be opened.")
    input.use { inp ->
      val out = ByteArrayOutputStream()
      val buf = ByteArray(64 * 1024)
      while (out.size() < limit) {
        val n = inp.read(buf, 0, minOf(buf.size, limit - out.size()))
        if (n < 0) {
          break
        }
        out.write(buf, 0, n)
      }
      return out.toByteArray()
    }
  }

  companion object {
    const val NAME = "TutorDevice"
    private const val REQUEST_PICK = 4207
    private const val REQUEST_IMPORT = 4208
    private const val PREFS = "tutor_device"
    private const val KEY_INSTALL_ID = "install_id"
    // Room left over after the model is copied, for the database and the OS.
    private const val SPARE_BYTES = 200L * 1024 * 1024
  }
}

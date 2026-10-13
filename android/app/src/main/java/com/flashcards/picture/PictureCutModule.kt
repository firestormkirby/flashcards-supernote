package com.flashcards.picture

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream

/**
 * Cuts a card's picture down to its marked area and saves it as a PNG, so
 * "Put in note" can insert exactly that part (PluginNoteAPI.insertImage takes
 * a whole PNG or JPG file, and JS on the device can't write images).
 *
 * The idea follows philips/supernote-insert-screenshot-plugin, which crops
 * screenshots the same way with Bitmap.createBitmap.
 */
class PictureCutModule(context: ReactApplicationContext) :
    ReactContextBaseJavaModule(context) {

    override fun getName(): String = "FlashcardsPicture"

    /**
     * The area x, y, width, height (in the image's pixels) of [src], as a new
     * PNG in the cache. A width or height of 0 or less means the whole image.
     * Resolves with the new file's path.
     */
    @ReactMethod
    fun cut(src: String, x: Double, y: Double, width: Double, height: Double, promise: Promise) {
        var full: Bitmap? = null
        var part: Bitmap? = null
        try {
            val path = src.removePrefix("file://")
            full = BitmapFactory.decodeFile(path)
            if (full == null) {
                promise.reject("CUT", "Couldn't read the picture: $path")
                return
            }
            val whole = width <= 0 || height <= 0
            val cx = if (whole) 0 else x.toInt().coerceIn(0, full.width - 1)
            val cy = if (whole) 0 else y.toInt().coerceIn(0, full.height - 1)
            val cw = if (whole) full.width else width.toInt().coerceIn(1, full.width - cx)
            val ch = if (whole) full.height else height.toInt().coerceIn(1, full.height - cy)
            part = if (whole) full else Bitmap.createBitmap(full, cx, cy, cw, ch)

            val dir = File(reactApplicationContext.cacheDir, "flashcards-note")
            if (!dir.exists() && !dir.mkdirs()) {
                promise.reject("CUT", "Couldn't make a folder for the picture")
                return
            }
            // Only the latest few are ever needed; clear older ones.
            dir.listFiles()?.filter {
                System.currentTimeMillis() - it.lastModified() > 60 * 60 * 1000L
            }?.forEach { it.delete() }

            val out = File(dir, "card-${System.currentTimeMillis()}.png")
            FileOutputStream(out).use { stream ->
                part.compress(Bitmap.CompressFormat.PNG, 100, stream)
            }
            promise.resolve(out.absolutePath)
        } catch (e: Exception) {
            promise.reject("CUT", e.message, e)
        } finally {
            if (part != null && part !== full) part.recycle()
            full?.recycle()
        }
    }
}

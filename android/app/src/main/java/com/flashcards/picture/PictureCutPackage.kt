package com.flashcards.picture

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * Registers PictureCutModule. buildPlugin finds this class (it implements
 * ReactPackage) and the `add(PictureCutPackage())` line in MainApplication,
 * and lists it in PluginConfig.json's reactPackages.
 */
class PictureCutPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(PictureCutModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext,
    ): List<ViewManager<in Nothing, in Nothing>> = emptyList()
}

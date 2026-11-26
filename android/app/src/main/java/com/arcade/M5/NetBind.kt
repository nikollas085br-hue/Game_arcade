package com.arcade.m5

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiNetworkSpecifier
import android.os.Build

/**
 * Melhora a conexao com o M5: o Android costuma mandar o trafego para o 4G quando o Wi-Fi
 * "nao tem internet" (caso da rede propria do M5). Aqui o app prende suas conexoes ao Wi-Fi.
 * Tambem consegue entrar na rede propria do M5 so para este app (Android 10+), sem derrubar
 * a internet do resto do celular.
 */
object NetBind {
    private var wifiCb: ConnectivityManager.NetworkCallback? = null
    private var apCb: ConnectivityManager.NetworkCallback? = null
    @Volatile private var pinned: Network? = null
    @Volatile var internet: Network? = null      // rede que realmente tem internet (4G ou Wi-Fi de casa)
    private var netCb: ConnectivityManager.NetworkCallback? = null

    private fun cm(ctx: Context) =
        ctx.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    /** Liga o "prender no Wi-Fi" e acompanha a rede com internet. Pode chamar varias vezes. */
    fun start(ctx: Context) {
        if (wifiCb != null) return
        val m = cm(ctx)
        try {
            val ireq = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .addCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
                .build()
            val icb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) { internet = network }
                override fun onLost(network: Network) { if (internet == network) internet = null }
            }
            m.registerNetworkCallback(ireq, icb)
            netCb = icb
        } catch (e: Exception) { }
        val req = NetworkRequest.Builder().addTransportType(NetworkCapabilities.TRANSPORT_WIFI).build()
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                if (pinned == null) try { m.bindProcessToNetwork(network) } catch (e: Exception) { }
            }
            override fun onLost(network: Network) {
                if (pinned == null) try { m.bindProcessToNetwork(null) } catch (e: Exception) { }
            }
        }
        try {
            m.registerNetworkCallback(req, cb)
            wifiCb = cb
        } catch (e: Exception) { }
    }

    /** Entra na rede propria do M5 so para este app. onUp/onFail rodam em outra thread. */
    fun joinAp(ctx: Context, ssid: String, pass: String, onUp: () -> Unit, onFail: (String) -> Unit) {
        if (Build.VERSION.SDK_INT < 29) {
            onFail("Neste Android, entre na rede \"$ssid\" pelas configuracoes de Wi-Fi do celular.")
            return
        }
        val m = cm(ctx)
        leaveAp(ctx)
        try {
            val b = WifiNetworkSpecifier.Builder().setSsid(ssid)
            if (pass.isNotEmpty()) b.setWpa2Passphrase(pass)
            val req = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .removeCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .setNetworkSpecifier(b.build())
                .build()
            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    pinned = network
                    try { m.bindProcessToNetwork(network) } catch (e: Exception) { }
                    onUp()
                }
                override fun onUnavailable() { onFail("Nao consegui entrar na rede \"$ssid\". Confira se o Wi-Fi do M5 esta ligado.") }
                override fun onLost(network: Network) {
                    if (pinned == network) {
                        pinned = null
                        try { m.bindProcessToNetwork(null) } catch (e: Exception) { }
                    }
                }
            }
            apCb = cb
            m.requestNetwork(req, cb, 30000)
        } catch (e: Exception) {
            onFail("Erro ao entrar na rede: ${e.message}")
        }
    }

    fun leaveAp(ctx: Context) {
        val cb = apCb ?: return
        apCb = null
        pinned = null
        try { cm(ctx).unregisterNetworkCallback(cb) } catch (e: Exception) { }
        try { cm(ctx).bindProcessToNetwork(null) } catch (e: Exception) { }
    }
}

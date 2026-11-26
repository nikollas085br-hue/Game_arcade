package com.arcade.m5

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import java.util.concurrent.Callable
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit

/**
 * Arcade M5: abre o site do Cardputer dentro do app.
 *  - entra na rede do Cardputer so para este app (o resto do celular continua com a internet);
 *  - deixa o site abrir o Gemini / ChatGPT / Claude e colar o que voce copiou (sem API, sem chave).
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var status: TextView
    private val prefs by lazy { getSharedPreferences("arcade", Context.MODE_PRIVATE) }

    private fun ip(): String = prefs.getString("ip", "192.168.4.1") ?: "192.168.4.1"
    private fun ssid(): String = prefs.getString("ssid", "Arcade-M5") ?: "Arcade-M5"
    private fun pass(): String = prefs.getString("pass", "jogar1234") ?: "jogar1234"
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun botao(label: String, onClick: () -> Unit): Button {
        val b = Button(this)
        b.text = label
        b.setOnClickListener { onClick() }
        return b
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        NetBind.start(this)

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(Color.parseColor("#0B0B0C"))

        val bar = LinearLayout(this)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.setPadding(dp(4), dp(4), dp(4), dp(4))
        bar.addView(botao("Conectar") { conectar() }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        bar.addView(botao("Recarregar") { abrir() }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        bar.addView(botao("Config.") { config() }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(bar, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        status = TextView(this)
        status.setTextColor(Color.parseColor("#9A9A94"))
        status.textSize = 12f
        status.setPadding(dp(8), 0, dp(8), dp(4))
        root.addView(status, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        web = WebView(this)
        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.mediaPlaybackRequiresUserGesture = false
        web.addJavascriptInterface(Bridge(), "ArcadeApp")
        web.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request != null && request.isForMainFrame) {
                    mostra("Não consegui falar com o Cardputer em " + ip() + ". Toque em Conectar (ou entre na rede " + ssid() + " pelo Wi-Fi do celular) e depois em Recarregar.")
                    view?.loadData("<body style='background:#0B0B0C;color:#F2F2EE;font-family:sans-serif;padding:24px'><h2>Sem conexão com o Cardputer</h2><p>Ligue o Cardputer, toque em <b>Conectar</b> e depois em <b>Recarregar</b>.</p></body>", "text/html", "utf-8")
                }
            }
        }
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        if (!prefs.getBoolean("viu", false)) {
            prefs.edit().putBoolean("viu", true).apply()
            conectar()
        } else {
            abrir()
        }
    }

    private fun mostra(t: String) { runOnUiThread { status.text = t } }
    private fun aviso(t: String) { runOnUiThread { Toast.makeText(this, t, Toast.LENGTH_LONG).show() } }

    private fun abrir() {
        mostra("Abrindo http://" + ip() + " ...")
        web.loadUrl("http://" + ip() + "/")
    }

    private fun conectar() {
        mostra("Entrando na rede " + ssid() + " (o Android vai pedir para confirmar)...")
        NetBind.joinAp(this, ssid(), pass(), {
            runOnUiThread {
                mostra("Conectado à rede " + ssid())
                abrir()
            }
        }, { msg ->
            runOnUiThread {
                mostra(msg)
                abrir()
            }
        })
    }

    private fun config() {
        val col = LinearLayout(this)
        col.orientation = LinearLayout.VERTICAL
        col.setPadding(dp(16), dp(8), dp(16), 0)
        val eSsid = EditText(this)
        eSsid.hint = "Nome da rede do Cardputer"
        eSsid.setSingleLine()
        eSsid.setText(ssid())
        val ePass = EditText(this)
        ePass.hint = "Senha da rede"
        ePass.setSingleLine()
        ePass.setText(pass())
        val eIp = EditText(this)
        eIp.hint = "Endereço do Cardputer"
        eIp.setSingleLine()
        eIp.setText(ip())
        col.addView(eSsid)
        col.addView(ePass)
        col.addView(eIp)
        AlertDialog.Builder(this)
            .setTitle("Cardputer")
            .setView(col)
            .setPositiveButton("Salvar") { _, _ ->
                prefs.edit()
                    .putString("ssid", eSsid.text.toString().trim())
                    .putString("pass", ePass.text.toString().trim())
                    .putString("ip", eIp.text.toString().trim())
                    .apply()
                aviso("Salvo. Toque em Conectar.")
            }
            .setNegativeButton("Cancelar", null)
            .show()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        // Voltou para o app (ex.: depois de copiar a resposta da IA): o site confere a area de transferencia.
        if (hasFocus && ::web.isInitialized) {
            web.evaluateJavascript("window.arcadeResume&&window.arcadeResume()", null)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    /** O que o site (JavaScript) pode pedir ao app. Os metodos rodam em outra thread. */
    inner class Bridge {
        @JavascriptInterface
        fun isApp(): Boolean = true

        @JavascriptInterface
        fun copy(text: String) {
            runOnUiThread {
                val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                cm.setPrimaryClip(ClipData.newPlainText("arcade", text))
            }
        }

        @JavascriptInterface
        fun paste(): String {
            return try {
                val task = FutureTask<String>(Callable<String> {
                    val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    val clip = cm.primaryClip
                    if (clip != null && clip.itemCount > 0) {
                        val t = clip.getItemAt(0).coerceToText(this@MainActivity)
                        if (t != null) t.toString() else ""
                    } else {
                        ""
                    }
                })
                runOnUiThread(task)
                task.get(2, TimeUnit.SECONDS)
            } catch (e: Exception) {
                ""
            }
        }

        /** app: "gemini", "chatgpt", "claude" ou "outro" (lista de apps). O texto tambem vai para a area de transferencia. */
        @JavascriptInterface
        fun openAi(app: String, text: String): Boolean {
            copy(text)
            val pkg = when (app) {
                "gemini" -> "com.google.android.apps.bard"
                "chatgpt" -> "com.openai.chatgpt"
                "claude" -> "com.anthropic.claude"
                else -> ""
            }
            runOnUiThread {
                val send = Intent(Intent.ACTION_SEND)
                send.type = "text/plain"
                send.putExtra(Intent.EXTRA_TEXT, text)
                try {
                    if (pkg.isNotEmpty()) {
                        send.setPackage(pkg)
                        startActivity(send)
                    } else {
                        startActivity(Intent.createChooser(send, "Enviar o prompt para..."))
                    }
                } catch (e: Exception) {
                    aviso("Esse app não está instalado. O prompt foi copiado: abra a IA e cole.")
                    try {
                        val geral = Intent(Intent.ACTION_SEND)
                        geral.type = "text/plain"
                        geral.putExtra(Intent.EXTRA_TEXT, text)
                        startActivity(Intent.createChooser(geral, "Enviar o prompt para..."))
                    } catch (e2: Exception) {
                    }
                }
            }
            return true
        }
    }
}

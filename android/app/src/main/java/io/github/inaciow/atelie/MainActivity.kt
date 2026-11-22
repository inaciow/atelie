package io.github.inaciow.atelie

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.util.Base64
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.addCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import androidx.lifecycle.lifecycleScope
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.io.File

/**
 * O app é o próprio site (GitHub Pages) numa WebView. Cada push na main atualiza o app,
 * sem APK novo. Aqui fica só o que o navegador não faz bem dentro de um app:
 * login nativo do Google, salvar arquivos, tela acesa, timer na notificação e barras do sistema.
 *
 * O site conversa com este lado pelo objeto `AtelieAndroid` (mensagens JSON, ver app.js)
 * e recebe respostas em `window.atelieDoAndroid`.
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val SITE = "https://inaciow.github.io/atelie/"
        const val ORIGEM = "https://inaciow.github.io"

        // ID do cliente web do Google no Firebase atelie-inacio (o mesmo do login pelo site).
        const val CLIENTE_WEB = "470432803343-rf7p92ccu6b4m0u7tkov0hjo9f0v9dnj.apps.googleusercontent.com"

        const val CANAL = "timer"
        const val NOTIF_TIMER = 1
        const val ABRIR = "abrir"
    }

    private lateinit var web: WebView
    private lateinit var topo: View
    private lateinit var base: View
    private val credenciais by lazy { CredentialManager.create(this) }

    private var aoEscolher: ValueCallback<Array<Uri>>? = null
    private var foto: Pair<File, Uri>? = null
    private var timer: Pair<String, Long>? = null
    private var pediuNotificacao = false

    private val escolherArquivo =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
            val cb = aoEscolher ?: return@registerForActivityResult
            aoEscolher = null
            var uris = WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data)
            val f = foto
            if (uris == null && r.resultCode == RESULT_OK && f != null && f.first.length() > 0) uris = arrayOf(f.second)
            cb.onReceiveValue(uris)
        }

    private val pedirNotificacao =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { mostrarTimer() }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(estado: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        super.onCreate(estado)
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false

        // Faixa do tamanho da barra de status com a cor do cabeçalho, o site no meio
        // e embaixo uma faixa que cresce com a barra de navegação ou o teclado.
        web = WebView(this)
        topo = View(this).apply { setBackgroundColor(getColor(R.color.topo)) }
        base = View(this)
        val raiz = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(getColor(R.color.fundo))
            addView(topo, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0))
            addView(web, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            addView(base, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0))
        }
        ViewCompat.setOnApplyWindowInsetsListener(raiz) { v, ins ->
            val barras = ins.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val teclado = ins.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(barras.left, 0, barras.right, 0)
            topo.updateLayoutParams { height = barras.top }
            base.updateLayoutParams { height = maxOf(barras.bottom, teclado.bottom) }
            WindowInsetsCompat.CONSUMED
        }
        setContentView(raiz)

        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CANAL, getString(R.string.canal_timer), NotificationManager.IMPORTANCE_LOW)
                .apply { setShowBadge(false) }
        )

        if ((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportZoom(false)
        }

        // A ponte só aparece pras páginas do próprio site.
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            WebViewCompat.addWebMessageListener(web, "AtelieAndroid", setOf(ORIGEM)) { _, msg, _, principal, _ ->
                if (principal) msg.data?.let { receber(it) }
            }
        } else {
            web.addJavascriptInterface(Ponte(), "AtelieAndroid")
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, req: WebResourceRequest): Boolean {
                val u = req.url
                if (u.scheme == "https" && u.host == "inaciow.github.io" && u.path.orEmpty().startsWith("/atelie")) return false
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, u))
                } catch (_: ActivityNotFoundException) {
                }
                return true
            }

            override fun onReceivedError(v: WebView, req: WebResourceRequest, erro: WebResourceError) {
                if (req.isForMainFrame) semInternet()
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(v: WebView, cb: ValueCallback<Array<Uri>>, p: FileChooserParams): Boolean {
                aoEscolher?.onReceiveValue(null)
                aoEscolher = cb
                foto = null
                var intent = p.createIntent()
                if (p.acceptTypes.any { it.startsWith("image") }) {
                    // "Tirar foto": oferece a câmera junto com a galeria.
                    val pasta = File(cacheDir, "fotos").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
                    val arq = File(pasta, "foto-${System.currentTimeMillis()}.jpg")
                    val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.arquivos", arq)
                    foto = arq to uri
                    val camera = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                        .putExtra(MediaStore.EXTRA_OUTPUT, uri)
                        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    camera.clipData = ClipData.newRawUri("", uri)
                    intent = Intent.createChooser(intent, null).putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
                }
                return try {
                    escolherArquivo.launch(intent)
                    true
                } catch (_: ActivityNotFoundException) {
                    aoEscolher = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this) {
            web.evaluateJavascript("window.atelieVoltar ? atelieVoltar() : false") { r ->
                if (r == "true") return@evaluateJavascript
                if (web.canGoBack()) {
                    web.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        }

        if (estado == null || web.restoreState(estado) == null) {
            web.loadUrl(SITE + if (intent?.getStringExtra(ABRIR) == "timer") "#timer" else "")
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.getStringExtra(ABRIR) == "timer") web.evaluateJavascript("location.hash = 'timer'", null)
    }

    override fun onSaveInstanceState(out: Bundle) {
        super.onSaveInstanceState(out)
        web.saveState(out)
    }

    override fun onPause() {
        web.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        web.onResume()
    }

    private inner class Ponte {
        @JavascriptInterface
        fun postMessage(s: String) = runOnUiThread { receber(s) }
    }

    private fun receber(json: String) {
        val m = try {
            JSONObject(json)
        } catch (_: Exception) {
            return
        }
        when (m.optString("t")) {
            "entrar" -> entrarGoogle()
            "sair" -> lifecycleScope.launch {
                try {
                    credenciais.clearCredentialState(ClearCredentialStateRequest())
                } catch (_: Exception) {
                }
            }
            "salvar" -> salvar(m.optString("nome", "arquivo"), m.optString("tipo"), m.optString("b64"))
            "tela" -> if (m.optBoolean("on")) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
            "timer" -> {
                val nome = m.optString("nome")
                timer = if (nome.isEmpty()) null else nome to m.optLong("base")
                mostrarTimer()
            }
        }
    }

    private fun enviar(m: JSONObject) =
        web.evaluateJavascript("window.atelieDoAndroid && atelieDoAndroid($m)", null)

    private fun enviarErro(msg: String) = enviar(JSONObject().put("t", "erro").put("msg", msg))

    /** Login nativo: o Google devolve um ID token e o site entra no Firebase com ele. */
    private fun entrarGoogle() {
        val pedido = GetCredentialRequest.Builder()
            .addCredentialOption(GetSignInWithGoogleOption.Builder(CLIENTE_WEB).build())
            .build()
        lifecycleScope.launch {
            try {
                val c = credenciais.getCredential(this@MainActivity, pedido).credential
                if (c is CustomCredential && c.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val token = GoogleIdTokenCredential.createFrom(c.data).idToken
                    enviar(JSONObject().put("t", "token").put("idToken", token))
                } else {
                    enviarErro("O Google devolveu um tipo de login inesperado.")
                }
            } catch (_: GetCredentialCancellationException) {
            } catch (_: NoCredentialException) {
                enviarErro("Não achei conta Google neste aparelho.")
            } catch (e: GetCredentialException) {
                enviarErro("Login do Google falhou: ${e.message ?: e.type}")
            } catch (e: Exception) {
                enviarErro("Login do Google falhou: ${e.message}")
            }
        }
    }

    /** Backup e planilha: vão pra pasta Downloads (Android 10+) ou pro menu de compartilhar. */
    private fun salvar(nome: String, tipo: String, b64: String) {
        val mime = tipo.ifBlank { "application/octet-stream" }
        try {
            val dados = Base64.decode(b64, Base64.DEFAULT)
            if (Build.VERSION.SDK_INT >= 29) {
                val v = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, nome)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)
                    ?: error("sem lugar pra salvar")
                contentResolver.openOutputStream(uri)?.use { it.write(dados) } ?: error("o arquivo não abriu")
                contentResolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                Toast.makeText(this, "Salvo em Downloads: $nome", Toast.LENGTH_LONG).show()
            } else {
                val arq = File(File(cacheDir, "enviar").apply { mkdirs() }, nome).apply { writeBytes(dados) }
                val uri = FileProvider.getUriForFile(this, "$packageName.arquivos", arq)
                val envio = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                startActivity(Intent.createChooser(envio, nome))
            }
        } catch (e: Exception) {
            enviarErro("Não deu pra salvar o arquivo: ${e.message}")
        }
    }

    /** Notificação fixa com o cronômetro da peça (tempo total, igual à barra do site). */
    @SuppressLint("MissingPermission")
    private fun mostrarTimer() {
        val nm = NotificationManagerCompat.from(this)
        val t = timer
        if (t == null) {
            nm.cancel(NOTIF_TIMER)
            return
        }
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            if (!pediuNotificacao) {
                pediuNotificacao = true
                pedirNotificacao.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            return
        }
        val abrir = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).putExtra(ABRIR, "timer").addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, CANAL)
            .setSmallIcon(R.drawable.ic_notif)
            .setColor(getColor(R.color.verde))
            .setContentTitle(t.first)
            .setContentText("Timer rodando")
            .setWhen(t.second)
            .setShowWhen(true)
            .setUsesChronometer(true)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(abrir)
            .build()
        try {
            nm.notify(NOTIF_TIMER, n)
        } catch (_: SecurityException) {
        }
    }

    private fun semInternet() {
        val html = """
            <!doctype html><html lang="pt-BR"><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              :root{color-scheme:light dark;--bg:#f6f8fa;--ink:#1f2328;--muted:#59636e;--btn:#1f883d}
              @media (prefers-color-scheme:dark){:root{--bg:#0d1117;--ink:#f0f6fc;--muted:#9198a1;--btn:#238636}}
              body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);
                font:16px/1.5 -apple-system,"Segoe UI",Roboto,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
              p{color:var(--muted);max-width:28ch;margin:8px auto 20px}
              button{background:var(--btn);color:#fff;border:0;border-radius:6px;padding:10px 18px;font:inherit;font-weight:600}
            </style>
            <div><h2>Sem internet</h2>
            <p>Na primeira vez o app precisa de internet pra carregar. Depois ele abre mesmo sem.</p>
            <button onclick="location.replace('$SITE')">Tentar de novo</button></div>
        """.trimIndent()
        web.loadDataWithBaseURL(null, html, "text/html", "utf-8", null)
    }
}

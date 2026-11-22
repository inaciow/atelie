plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// O GitHub Actions passa o número da execução; cada APK novo precisa de um número maior.
val numero = (findProperty("versionCode") as String?)?.toIntOrNull() ?: 1
// A chave de assinatura vem dos segredos do repositório (veja o README).
val chave = System.getenv("APK_KEYSTORE_ARQUIVO")?.takeIf { it.isNotBlank() }
val senha = System.getenv("APK_SENHA")

android {
    namespace = "io.github.inaciow.atelie"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.inaciow.atelie"
        minSdk = 26
        targetSdk = 35
        versionCode = numero
        versionName = "1.$numero"
    }

    signingConfigs {
        if (chave != null) create("release") {
            storeFile = file(chave)
            storePassword = senha
            keyAlias = "atelie"
            keyPassword = senha
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (chave != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        checkReleaseBuilds = false
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
}

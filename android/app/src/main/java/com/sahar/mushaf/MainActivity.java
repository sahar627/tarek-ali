package com.sahar.mushaf;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * سَحَر — المصحف والأذكار
 *
 * التطبيق كله ملف HTML واحد داخل assets. لا شبكة ولا خوادم:
 * صلاحية الإنترنت غير مطلوبة أصلاً في AndroidManifest، فالتطبيق
 * لا يستطيع الاتصال بأي جهة حتى لو أراد.
 */
public class MainActivity extends Activity {

    private WebView web;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingOrigin;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle saved) {
        /* الانتقال من ثيم شاشة البدء إلى ثيم التطبيق */
        setTheme(R.style.AppTheme);
        super.onCreate(saved);

        boolean night = (getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        /* لون خلفية مطابق للتطبيق حتى لا تومض شاشة بيضاء عند الفتح */
        web.setBackgroundColor(Color.parseColor(night ? "#0A100E" : "#DED3B8"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      /* هنا تُحفظ العلامات والعدّادات وآخر موضع قراءة */
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setSupportZoom(false);           /* حجم الخط يُضبط من داخل التطبيق */
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                /* لا يتأثر بحجم خط النظام حفاظاً على تنسيق المصحف */
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setGeolocationEnabled(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        /* كل التنقّل داخلي (روابط #). لا شيء يخرج من التطبيق. */
        /* يمنح واجهةَ الويب إذنَ الموقع بعد أن يأذن المستخدم للتطبيق */
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin,
                    GeolocationPermissions.Callback cb) {
                boolean granted = Build.VERSION.SDK_INT < 23 ||
                        checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                                == PackageManager.PERMISSION_GRANTED ||
                        checkSelfPermission(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                                == PackageManager.PERMISSION_GRANTED;
                if (granted) {
                    cb.invoke(origin, true, false);
                } else {
                    pendingGeo = cb;
                    pendingOrigin = origin;
                    if (Build.VERSION.SDK_INT >= 23) {
                        requestPermissions(new String[] {
                                android.Manifest.permission.ACCESS_FINE_LOCATION,
                                android.Manifest.permission.ACCESS_COARSE_LOCATION }, 88);
                    } else {
                        cb.invoke(origin, false, false);
                    }
                }
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                return !r.getUrl().toString().startsWith("file:///android_asset/");
            }
            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });

        web.addJavascriptInterface(new Bridge(), "Sahar");

        setContentView(web);

        if (saved != null) web.restoreState(saved);
        else web.loadUrl(currentAppUrl());

        checkContentUpdate();

        if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, 77);
        }
        Scheduler.scheduleNext(this);
        askBatteryOnce();
    }

    /** يطلب استثناء البطارية مرة واحدة فقط، بنافذة «سماح / رفض» مباشرة */
    /* ملف الواجهة المحدَّث يُحفظ داخل التطبيق؛ فإن غاب استعملنا المحزوم */
    private static final String LIVE = "app-latest.html";
    private static final String SRC_URL = "https://sahar627.github.io/tarek-ali/index.html";

    private File liveFile() { return new File(getFilesDir(), LIVE); }

    private String currentAppUrl() {
        File f = liveFile();
        return (f.exists() && f.length() > 500000)
                ? "file://" + f.getAbsolutePath()
                : "file:///android_asset/index.html";
    }

    /* يفحص وجود نسخة أحدث ويحفظها بهدوء؛ تظهر عند الفتحة التالية.
       يفشل بصمت إن لم يكن هناك اتصال، فلا يزعج المستخدم. */
    private void checkContentUpdate() {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(SRC_URL).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(20000);
                c.setRequestProperty("Accept-Encoding", "identity");
                if (c.getResponseCode() != 200) return;

                File tmp = new File(getFilesDir(), LIVE + ".part");
                InputStream in = c.getInputStream();
                FileOutputStream out = new FileOutputStream(tmp);
                byte[] buf = new byte[16384];
                int r; long total = 0;
                while ((r = in.read(buf)) != -1) { out.write(buf, 0, r); total += r; }
                out.close(); in.close();

                /* لا نستبدل إلا بملف سليم الحجم ومختلف عن الحالي */
                File cur = liveFile();
                if (total < 500000 || (cur.exists() && cur.length() == total)) { tmp.delete(); return; }

                File dst = liveFile();
                if (dst.exists() && !dst.delete()) { tmp.delete(); return; }
                if (!tmp.renameTo(dst)) { tmp.delete(); return; }

                new Handler(Looper.getMainLooper()).post(() ->
                        Scheduler.prefs(MainActivity.this).edit()
                                 .putBoolean("contentUpdated", true).apply());
            } catch (Exception ignored) {
            } finally {
                if (c != null) c.disconnect();
            }
        }).start();
    }

    private void askBatteryOnce() {
        if (Build.VERSION.SDK_INT < 23) return;
        if (Scheduler.prefs(this).getBoolean("battAsked", false)) return;
        Scheduler.prefs(this).edit().putBoolean("battAsked", true).apply();
        if (isBatteryFree()) return;
        requestBattery();
    }

    private boolean isBatteryFree() {
        if (Build.VERSION.SDK_INT < 23) return true;
        PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
        return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
    }

    /** نافذة النظام المباشرة: «السماح لهذا التطبيق بتجاهل تحسين البطارية؟» */
    @SuppressLint("BatteryLife")
    private void requestBattery() {
        try {
            startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                    Uri.parse("package:" + getPackageName())));
        } catch (Exception e) {
            try { startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
            catch (Exception ignored) { }
        }
    }

    /** الجسر بين واجهة الويب وجدولة المنبّه في النظام */
    private class Bridge {

        @JavascriptInterface
        public boolean isApp() { return true; }

        /** الأصوات المضمّنة في الحزمة */
        @JavascriptInterface
        public String athanList() {
            return "[" +
              "{\"id\":\"takbir\",\"name\":\"التكبيرات\"}," +
              "{\"id\":\"makkah\",\"name\":\"أذان مكة\"}," +
              "{\"id\":\"madinah\",\"name\":\"أذان المدينة\"}," +
              "{\"id\":\"fajr\",\"name\":\"أذان الفجر — المدينة\"}," +
              "{\"id\":\"rifaat\",\"name\":\"الشيخ محمد رفعت\"}]";
        }

        /** تحفظ الواجهةُ إعداداتِها هنا فيعيد النظام الجدولة */
        @JavascriptInterface
        public void syncSettings(String json) {
            try {
                JSONObject o = new JSONObject(json);
                SharedPreferences.Editor e = Scheduler.prefs(MainActivity.this).edit();
                e.putLong("lat", Double.doubleToLongBits(o.optDouble("lat", 21.4225)));
                e.putLong("lng", Double.doubleToLongBits(o.optDouble("lng", 39.8262)));
                e.putString("method", o.optString("method", "makkah"));
                e.putInt("asr", o.optInt("asr", 1));
                e.putBoolean("alert", o.optBoolean("alert", true));
                e.putInt("before", o.optInt("before", 15));
                e.putString("chime", o.optString("chime", ""));
                e.putString("chimeFajr", o.optString("chimeFajr", "same"));
                e.putBoolean("vib", o.optBoolean("vib", true));
                e.putBoolean("respectSilent", o.optBoolean("respectSilent", true));
                e.putFloat("vol", (float) o.optDouble("vol", 1));
                e.apply();
                Scheduler.scheduleNext(MainActivity.this);
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void playAdhan(String id) {
            String asset = "audio/takbir.mp3";
            if ("makkah".equals(id))  asset = "audio/makkah.mp3";
            if ("madinah".equals(id)) asset = "audio/madinah.mp3";
            if ("fajr".equals(id))    asset = "audio/madinah-fajr.mp3";
            if ("rifaat".equals(id))  asset = "audio/rifaat.mp3";
            Intent i = new Intent(MainActivity.this, AdhanService.class)
                    .putExtra("asset", asset).putExtra("name", "تجربة");
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        }

        @JavascriptInterface
        public void stopAdhan() {
            startService(new Intent(MainActivity.this, AdhanService.class)
                    .setAction(AdhanService.ACTION_STOP));
        }

        /** هل يسمح النظام بالمنبّه الدقيق؟ */
        @JavascriptInterface
        public boolean exactAllowed() {
            if (Build.VERSION.SDK_INT < 31) return true;
            android.app.AlarmManager am =
                    (android.app.AlarmManager) getSystemService(Context.ALARM_SERVICE);
            return am != null && am.canScheduleExactAlarms();
        }

        @JavascriptInterface
        public void openExactSettings() {
            if (Build.VERSION.SDK_INT < 31) return;
            try {
                startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void openBatterySettings() { requestBattery(); }

        /** يفتح صفحة إعدادات التطبيق لتفعيل الإشعارات يدوياً */
        /* هل نزلت نسخة أحدث وتنتظر إعادة الفتح؟ */
        @JavascriptInterface
        public boolean updateReady() {
            return Scheduler.prefs(MainActivity.this).getBoolean("contentUpdated", false);
        }

        /* يطبّق التحديث فوراً */
        @JavascriptInterface
        public void applyUpdate() {
            Scheduler.prefs(MainActivity.this).edit().putBoolean("contentUpdated", false).apply();
            runOnUiThread(() -> { if (web != null) web.loadUrl(currentAppUrl()); });
        }

        @JavascriptInterface
        public void openAppSettings() {
            try {
                if (Build.VERSION.SDK_INT >= 26) {
                    Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                    i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    startActivity(i);
                    return;
                }
            } catch (Exception ignored) { }
            try {
                startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        Uri.parse("package:" + getPackageName())));
            } catch (Exception ignored) { }
        }

        /** هل التطبيق مستثنى من تقييد البطارية؟ */
        @JavascriptInterface
        public boolean batteryFree() { return isBatteryFree(); }

        /** تقرير حالة التنبيه: هل جُدول؟ ومتى؟ وما الأذونات؟ */
        @JavascriptInterface
        public String status() {
            android.content.SharedPreferences p = Scheduler.prefs(MainActivity.this);
            boolean notif = true;
            if (Build.VERSION.SDK_INT >= 33)
                notif = checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        == PackageManager.PERMISSION_GRANTED;
            return "{\"nextAt\":" + p.getLong("nextAt", 0)
                 + ",\"nextKey\":\"" + p.getString("nextKey", "") + "\""
                 + ",\"nextPre\":" + p.getBoolean("nextPre", false)
                 + ",\"exact\":" + exactAllowed()
                 + ",\"battery\":" + isBatteryFree()
                 + ",\"notif\":" + notif + "}";
        }

        /** يضبط منبّهاً بعد دقيقة لاختبار المنظومة كلها */
        @JavascriptInterface
        public void testAlarm() { Scheduler.test(MainActivity.this, 60); }

        /** هل التفسير مضمّن في الحزمة؟ */
        @JavascriptInterface
        public boolean hasTafsir() {
            try { getAssets().open("tafsir/1.json").close(); return true; }
            catch (Exception e) { return false; }
        }

        /** تفسير سورة واحدة — يُقرأ من الحزمة بلا إنترنت */
        @JavascriptInterface
        public String tafsirSurah(int n) {
            java.io.InputStream in = null;
            try {
                in = getAssets().open("tafsir/" + n + ".json");
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int r;
                while ((r = in.read(buf)) != -1) out.write(buf, 0, r);
                return new String(out.toByteArray(), "UTF-8");
            } catch (Exception e) {
                return "";
            } finally {
                try { if (in != null) in.close(); } catch (Exception ignored) { }
            }
        }
    }

    /* زر الرجوع يتنقّل داخل التطبيق قبل أن يخرج منه */
    /* نتيجة طلب إذن الموقع: نبلّغ واجهة الويب بها */
    @Override
    public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        if (req != 88 || pendingGeo == null) return;
        boolean ok = false;
        for (int r : res) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
        pendingGeo.invoke(pendingOrigin, ok, false);
        pendingGeo = null; pendingOrigin = null;
    }

    @Override
    public boolean onKeyDown(int code, KeyEvent e) {
        if (code == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack();
            return true;
        }
        return super.onKeyDown(code, e);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        if (web != null) web.saveState(out);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}

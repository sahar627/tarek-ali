package com.sahar.mushaf;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.ViewGroup;
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
        web.setBackgroundColor(Color.parseColor(night ? "#0D1311" : "#F6F2E9"));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);      /* هنا تُحفظ العلامات والعدّادات وآخر موضع قراءة */
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setSupportZoom(false);           /* حجم الخط يُضبط من داخل التطبيق */
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);                /* لا يتأثر بحجم خط النظام حفاظاً على تنسيق المصحف */
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        /* كل التنقّل داخلي (روابط #). لا شيء يخرج من التطبيق. */
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

        setContentView(web);

        if (saved != null) web.restoreState(saved);
        else web.loadUrl("file:///android_asset/index.html");
    }

    /* زر الرجوع يتنقّل داخل التطبيق قبل أن يخرج منه */
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

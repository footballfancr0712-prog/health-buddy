package com.personal.healthbuddy;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Android 15（API 35）起强制 edge-to-edge，WebView 会绘制到状态栏底下，
 * 页面顶部的标题因此被系统图标压住。
 *
 * 这里把系统栏的实际高度以 CSS 像素注入页面变量 --sat，
 * 页面 .topbar 用 padding-top 吸收它：绿色顶栏仍延伸到状态栏区域，
 * 但标题和按钮会落在图标下方。
 *
 * 滚动条：页面自己已经把根文档锁成不滚动（滚动改在 #app 内），
 * 这里再把 WebView 原生滚动条关掉，两层都不留——原生那条"贯穿全高、
 * 滚动时不动"的条就是根文档滚动区间算错画出来的。
 */
public class MainActivity extends BridgeActivity {

    private static final int MAX_TRIES = 15;
    private static final long RETRY_MS = 300;

    private int safeTopCss = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        applyScrollbarFlags();

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            float density = getResources().getDisplayMetrics().density;
            safeTopCss = Math.round(bars.top / density);
            pushToPage(0);
            return insets;
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // 从后台回来时页面可能重绘，补一次
        applyScrollbarFlags();
        pushToPage(0);
    }

    /** 原生层的滚动条一律关掉（页面根文档也不再滚动，这是第二道保险） */
    private void applyScrollbarFlags() {
        WebView web = bridge != null ? bridge.getWebView() : null;
        if (web == null) {
            return;
        }
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setScrollbarFadingEnabled(true);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
    }

    /**
     * 注入 --sat 和兜底样式。
     * 首屏此时可能还没解析完，直接用 document.readyState 判断，
     * 没到 complete 就隔 300ms 再来一次，最多 MAX_TRIES 次。
     */
    private void pushToPage(final int attempt) {
        if (bridge == null) {
            return;
        }
        final WebView web = bridge.getWebView();
        if (web == null) {
            return;
        }

        final String js = "(function(){"
                + "if(!document.documentElement){return 'wait';}"
                + "document.documentElement.style.setProperty('--sat','" + safeTopCss + "px');"
                + "document.documentElement.classList.add('hb-native');"
                + "var d=document;"
                + "if(!d.getElementById('hb-native-css')){"
                + "var s=d.createElement('style');s.id='hb-native-css';"
                + "s.textContent='html.hb-native,html.hb-native body{height:100%;overflow:hidden}'"
                + "+'html.hb-native #app{overflow-y:auto;overflow-x:hidden;scrollbar-width:none}'"
                + "+'html.hb-native #app::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}';"
                + "(d.head||d.documentElement).appendChild(s);}"
                + "return document.readyState;})()";

        web.post(() -> web.evaluateJavascript(js, value -> {
            boolean ready = value != null && value.contains("complete");
            if (!ready && attempt < MAX_TRIES) {
                web.postDelayed(() -> pushToPage(attempt + 1), RETRY_MS);
            }
        }));
    }
}

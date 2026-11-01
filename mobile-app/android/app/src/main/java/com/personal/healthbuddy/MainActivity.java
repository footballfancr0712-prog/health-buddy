package com.personal.healthbuddy;

import android.os.Bundle;
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
 */
public class MainActivity extends BridgeActivity {

    private int safeTopCss = 0;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 关掉 WebView 自带的系统滚动条：它会和页面里那条重叠，而且滚动时位置不跟随
        WebView web = bridge != null ? bridge.getWebView() : null;
        if (web != null) {
            web.setVerticalScrollBarEnabled(false);
            web.setHorizontalScrollBarEnabled(false);
        }

        ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content), (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
            float density = getResources().getDisplayMetrics().density;
            safeTopCss = Math.round(bars.top / density);
            pushSafeAreaTop();
            return insets;
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        // 从后台回来时页面可能重绘，补一次
        pushSafeAreaTop();
    }

    private void pushSafeAreaTop() {
        if (bridge == null) {
            return;
        }
        WebView web = bridge.getWebView();
        if (web == null) {
            return;
        }
        final String js = "(function(){"
                + "document.documentElement.style.setProperty('--sat','" + safeTopCss + "px');"
                + "var d=document;"
                + "if(d.getElementById('hb-native-css')){return;}"
                + "var s=d.createElement('style');s.id='hb-native-css';"
                + "s.textContent='html,body{scrollbar-width:none}"
                + "html::-webkit-scrollbar,body::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}';"
                + "d.head.appendChild(s);})()";
        web.post(() -> web.evaluateJavascript(js, null));
        // 首屏此时可能还没加载完，稍后再补一次，避免样式被新文档冲掉
        web.postDelayed(() -> web.evaluateJavascript(js, null), 900);
    }
}

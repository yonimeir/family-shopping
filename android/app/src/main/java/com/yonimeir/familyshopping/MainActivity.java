package com.yonimeir.familyshopping;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private volatile String pendingQuickAction = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        applyWarmPaperSystemBars();
        readPendingActionFromIntent(getIntent());

        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            webView.addJavascriptInterface(new WidgetJsBridge(), "EinKlumWidget");
        }

        OnBackPressedCallback backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                    return;
                }
                webView.evaluateJavascript(
                    "(function(){return Boolean(window.__einKlumBack && window.__einKlumBack());})()",
                    value -> runOnUiThread(() -> {
                        if ("true".equals(value)) {
                            return;
                        }
                        if (webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            setEnabled(false);
                            getOnBackPressedDispatcher().onBackPressed();
                            setEnabled(true);
                        }
                    })
                );
            }
        };
        getOnBackPressedDispatcher().addCallback(this, backCallback);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String action = readPendingActionFromIntent(intent);
        if (action == null) return;

        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;

        String js = "(function(){if(typeof window.__einKlumAction==='function'){window.__einKlumAction('" + action + "');return true;}return false;})()";
        runOnUiThread(() -> webView.evaluateJavascript(js, res -> {
            if ("true".equals(res)) {
                pendingQuickAction = null;
            }
        }));
    }

    private String readPendingActionFromIntent(Intent intent) {
        if (intent == null) return null;
        String action = intent.getStringExtra(QuickActionsWidgetProvider.EXTRA_QUICK_ACTION);
        if (QuickActionsWidgetProvider.ACTION_VOICE.equals(action) || QuickActionsWidgetProvider.ACTION_CHAT.equals(action)) {
            pendingQuickAction = action;
            return action;
        }
        return null;
    }

    private void applyWarmPaperSystemBars() {
        int warmPaper = ContextCompat.getColor(this, R.color.warm_paper);
        getWindow().setStatusBarColor(warmPaper);
        getWindow().setNavigationBarColor(warmPaper);
        View decor = getWindow().getDecorView();
        WindowInsetsControllerCompat insets = WindowCompat.getInsetsController(getWindow(), decor);
        insets.setAppearanceLightStatusBars(true);
        insets.setAppearanceLightNavigationBars(true);
    }

    private class WidgetJsBridge {
        @JavascriptInterface
        public void setUnreadCount(int count) {
            int cleanCount = Math.max(0, count);
            SharedPreferences prefs = getSharedPreferences(QuickActionsWidgetProvider.PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putInt(QuickActionsWidgetProvider.KEY_UNREAD, cleanCount).apply();
            runOnUiThread(() -> QuickActionsWidgetProvider.updateAll(MainActivity.this));
        }

        @JavascriptInterface
        public void setShopperActive(boolean active) {
            SharedPreferences prefs = getSharedPreferences(QuickActionsWidgetProvider.PREFS_NAME, MODE_PRIVATE);
            prefs.edit().putBoolean(QuickActionsWidgetProvider.KEY_SHOPPER, active).apply();
            runOnUiThread(() -> QuickActionsWidgetProvider.updateAll(MainActivity.this));
        }

        @JavascriptInterface
        public String consumePendingAction() {
            String action = pendingQuickAction;
            pendingQuickAction = null;
            return action != null ? action : "";
        }
    }
}

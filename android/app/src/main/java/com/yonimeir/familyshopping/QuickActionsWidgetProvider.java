package com.yonimeir.familyshopping;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

public class QuickActionsWidgetProvider extends AppWidgetProvider {

    public static final String PREFS_NAME = "ein_klum_widget";
    public static final String KEY_UNREAD = "unread_count";
    public static final String KEY_SHOPPER = "shopper_active";
    public static final String EXTRA_QUICK_ACTION = "ein_klum_quick_action";
    public static final String ACTION_VOICE = "voice";
    public static final String ACTION_CHAT = "chat";

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName provider = new ComponentName(context, QuickActionsWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(provider);
        if (ids == null || ids.length == 0) return;
        for (int id : ids) {
            updateWidget(context, manager, id);
        }
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int appWidgetId) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        int unread = Math.max(0, prefs.getInt(KEY_UNREAD, 0));
        boolean shopperActive = prefs.getBoolean(KEY_SHOPPER, false);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_quick_actions);
        views.setOnClickPendingIntent(R.id.widget_btn_voice, buildActionPendingIntent(context, ACTION_VOICE, 101));
        views.setOnClickPendingIntent(R.id.widget_btn_chat, buildActionPendingIntent(context, ACTION_CHAT, 102));

        if (unread > 0) {
            views.setViewVisibility(R.id.widget_chat_badge, View.VISIBLE);
            views.setTextViewText(R.id.widget_chat_badge, unread > 9 ? "9+" : String.valueOf(unread));
        } else {
            views.setViewVisibility(R.id.widget_chat_badge, View.GONE);
        }

        views.setViewVisibility(R.id.widget_shopper_dot, shopperActive ? View.VISIBLE : View.GONE);
        manager.updateAppWidget(appWidgetId, views);
    }

    private static PendingIntent buildActionPendingIntent(Context context, String action, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction("com.yonimeir.familyshopping.QUICK_ACTION_" + action.toUpperCase());
        intent.putExtra(EXTRA_QUICK_ACTION, action);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}

package com.sahar.mushaf;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import java.util.Calendar;

/**
 * يجدول منبّهاً دقيقاً واحداً للحدث القادم (تنبيه مسبق أو دخول وقت)،
 * ويعيد الجدولة بعد كل إطلاق وبعد إعادة تشغيل الجهاز.
 */
public final class Scheduler {

    public static final String PREFS = "sahar";
    public static final String ACTION_FIRE = "com.sahar.mushaf.FIRE";
    public static final int REQ = 4210;

    public static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** يحسب الحدث القادم ويضبط المنبّه عليه */
    public static void scheduleNext(Context ctx) {
        SharedPreferences p = prefs(ctx);
        if (!p.getBoolean("alert", true)) { cancel(ctx); return; }

        double lat = Double.longBitsToDouble(p.getLong("lat", Double.doubleToLongBits(21.4225)));
        double lng = Double.longBitsToDouble(p.getLong("lng", Double.doubleToLongBits(39.8262)));
        String method = p.getString("method", "makkah");
        int asr = p.getInt("asr", 1);
        int before = p.getInt("before", 15);

        long now = System.currentTimeMillis();
        long bestAt = Long.MAX_VALUE;
        String bestKey = null;
        boolean bestPre = false;

        // نفحص اليوم ثم الغد حتى نجد أول حدث قادم
        for (int dayOffset = 0; dayOffset <= 1 && bestKey == null; dayOffset++) {
            Calendar day = Calendar.getInstance();
            day.add(Calendar.DAY_OF_YEAR, dayOffset);
            double[] t = Prayer.times(day, lat, lng, method, asr);

            for (int i = 0; i < Prayer.KEYS.length; i++) {
                if (i == 1) continue;                       // الشروق ليس صلاة
                if (Double.isNaN(t[i])) continue;
                long at = Prayer.toMillis(day, t[i]);

                if (before > 0) {
                    long pre = at - before * 60000L;
                    if (pre > now + 5000 && pre < bestAt) {
                        bestAt = pre; bestKey = Prayer.KEYS[i]; bestPre = true;
                    }
                }
                if (at > now + 5000 && at < bestAt) {
                    bestAt = at; bestKey = Prayer.KEYS[i]; bestPre = false;
                }
            }
        }
        if (bestKey == null) return;

        Intent i = new Intent(ctx, AlarmReceiver.class)
                .setAction(ACTION_FIRE)
                .putExtra("key", bestKey)
                .putExtra("pre", bestPre)
                .putExtra("at", bestAt);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ, i, flags);

        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                am.set(AlarmManager.RTC_WAKEUP, bestAt, pi);      // تقريبي عند منع الدقيق
            } else if (Build.VERSION.SDK_INT >= 23) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, bestAt, pi);
            } else {
                am.setExact(AlarmManager.RTC_WAKEUP, bestAt, pi);
            }
            Log.i("Sahar", "منبّه: " + bestKey + (bestPre ? " (تنبيه مسبق)" : "") + " بعد "
                    + ((bestAt - now) / 60000) + " دقيقة");
        } catch (SecurityException e) {
            am.set(AlarmManager.RTC_WAKEUP, bestAt, pi);
        }
    }

    public static void cancel(Context ctx) {
        Intent i = new Intent(ctx, AlarmReceiver.class).setAction(ACTION_FIRE);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent pi = PendingIntent.getBroadcast(ctx, REQ, i, flags);
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pi);
    }

    public static String nameOf(String key) {
        for (int i = 0; i < Prayer.KEYS.length; i++)
            if (Prayer.KEYS[i].equals(key)) return Prayer.NAMES[i];
        return key;
    }

    /** الملف الصوتي المختار لهذه الصلاة، أو null للنغمة الافتراضية */
    public static String audioFor(Context ctx, String key) {
        SharedPreferences p = prefs(ctx);
        String chime = p.getString("chime", "");
        if ("fajr".equals(key)) {
            String f = p.getString("chimeFajr", "same");
            if (f != null && !"same".equals(f)) chime = f;
        }
        if (chime == null || "none".equals(chime) || "soft".equals(chime) || !chime.startsWith("a:"))
            return null;
        String id = chime.substring(2);
        if ("takbir".equals(id))  return "audio/takbir.mp3";
        if ("makkah".equals(id))  return "audio/makkah.mp3";
        if ("madinah".equals(id)) return "audio/madinah.mp3";
        if ("fajr".equals(id))    return "audio/madinah-fajr.mp3";
        if ("rifaat".equals(id))  return "audio/rifaat.mp3";
        return null;
    }
}

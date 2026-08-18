package com.sahar.mushaf;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

/** يستقبل المنبّه: يُشعِر، ويشغّل الأذان، ثم يجدول التالي. */
public class AlarmReceiver extends BroadcastReceiver {

    static final String CHANNEL = "sahar_prayer";

    static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "مواقيت الصلاة",
                NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("تنبيه دخول أوقات الصلاة");
        ch.setSound(null, null);          // الصوت يشغّله التطبيق لا النظام
        ch.enableVibration(false);
        nm.createNotificationChannel(ch);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String key = intent.getStringExtra("key");
        boolean pre = intent.getBooleanExtra("pre", false);
        if (key == null) { Scheduler.scheduleNext(ctx); return; }

        String name = Scheduler.nameOf(key);
        int before = Scheduler.prefs(ctx).getInt("before", 15);
        String title = pre ? "اقترب وقت الصلاة" : "دخل وقت الصلاة";
        String body = pre
                ? "صلاة " + name + " بعد " + before + " دقيقة"
                : "حان الآن وقت صلاة " + name;

        ensureChannel(ctx);
        notify(ctx, title, body);

        if (Scheduler.prefs(ctx).getBoolean("vib", true)) vibrate(ctx, pre, key);

        if (!pre) {
            String asset = "test".equals(key) ? "audio/takbir.mp3" : Scheduler.audioFor(ctx, key);
            if (asset != null) {
                Intent s = new Intent(ctx, AdhanService.class)
                        .putExtra("asset", asset)
                        .putExtra("name", name);
                try {
                    if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(s);
                    else ctx.startService(s);
                } catch (Exception e) {
                    /* منع النظام تشغيل الخدمة: على الأقل يصل الإشعار */
                    notify(ctx, "تعذّر تشغيل الأذان", "افتح التطبيق واسمح له بالعمل في الخلفية");
                }
            }
        }
        if (!"test".equals(key)) Scheduler.scheduleNext(ctx);
    }

    private void notify(Context ctx, String title, String body) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(ctx, 0,
                new Intent(ctx, MainActivity.class), flags);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL)
                : new Notification.Builder(ctx);
        b.setSmallIcon(R.mipmap.ic_launcher)
         .setContentTitle(title)
         .setContentText(body)
         .setAutoCancel(true)
         .setContentIntent(open);
        if (Build.VERSION.SDK_INT >= 21) b.setPriority(Notification.PRIORITY_HIGH);
        try { nm.notify(991, b.build()); } catch (SecurityException ignored) { }
    }

    private void vibrate(Context ctx, boolean pre, String key) {
        Vibrator v = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        long[] pattern;
        if (pre) pattern = new long[] { 0, 120, 80, 120 };
        else if ("fajr".equals(key))    pattern = new long[] { 0, 180, 90, 180, 90, 180 };
        else if ("dhuhr".equals(key))   pattern = new long[] { 0, 400 };
        else if ("asr".equals(key))     pattern = new long[] { 0, 200, 120, 200 };
        else if ("maghrib".equals(key)) pattern = new long[] { 0, 500, 150, 250 };
        else                            pattern = new long[] { 0, 180, 120, 180, 120, 400 };
        try {
            if (Build.VERSION.SDK_INT >= 26)
                v.vibrate(VibrationEffect.createWaveform(pattern, -1));
            else v.vibrate(pattern, -1);
        } catch (Exception ignored) { }
    }
}

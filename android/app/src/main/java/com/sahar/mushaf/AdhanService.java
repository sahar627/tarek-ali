package com.sahar.mushaf;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * خدمة أمامية تشغّل الأذان من داخل الحزمة، ولو كان الجهاز نائماً.
 * تتوقف تلقائياً عند انتهاء الملف، أو بضغط «إيقاف» من الإشعار.
 */
public class AdhanService extends Service {

    public static final String ACTION_STOP = "com.sahar.mushaf.STOP_ADHAN";
    private MediaPlayer mp;
    private PowerManager.WakeLock lock;
    private AudioManager am;
    private Object focusReq;                       /* AudioFocusRequest على ٢٦+ */
    private AudioManager.OnAudioFocusChangeListener focusListener;

    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) { stopAll(); return START_NOT_STICKY; }

        String asset = intent != null ? intent.getStringExtra("asset") : null;
        String name = intent != null ? intent.getStringExtra("name") : "الصلاة";
        if (asset == null) { stopSelf(); return START_NOT_STICKY; }

        AlarmReceiver.ensureChannel(this);
        startForeground(992, build(name));

        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sahar:adhan");
                lock.acquire(10 * 60 * 1000L);
            }
        } catch (Exception ignored) { }

        am = (AudioManager) getSystemService(AUDIO_SERVICE);

        /* لا نؤذّن أثناء مكالمة جارية — الإشعار وحده يكفي */
        if (am != null && am.getMode() != AudioManager.MODE_NORMAL) {
            stopAll();
            return START_NOT_STICKY;
        }
        /* واحترام الوضع الصامت إن اختاره المستخدم */
        if (am != null && Scheduler.prefs(this).getBoolean("respectSilent", true)
                && am.getRingerMode() != AudioManager.RINGER_MODE_NORMAL) {
            stopAll();
            return START_NOT_STICKY;
        }

        try {
            AssetFileDescriptor afd = getAssets().openFd(asset);
            mp = new MediaPlayer();
            if (Build.VERSION.SDK_INT >= 21) {
                mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            } else {
                mp.setAudioStreamType(AudioManager.STREAM_ALARM);
            }
            mp.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();
            float vol = Scheduler.prefs(this).getFloat("vol", 1f);
            mp.setVolume(vol, vol);
            /* إن ورد اتصال أو احتاج غيرُنا الصوت، نتوقف فوراً */
            focusListener = change -> {
                if (change == AudioManager.AUDIOFOCUS_LOSS
                        || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) stopAll();
            };
            requestFocus();

            mp.setOnCompletionListener(m -> stopAll());
            mp.setOnErrorListener((m, w, e) -> { stopAll(); return true; });
            mp.prepare();
            mp.start();
        } catch (Exception e) {
            stopAll();
        }
        return START_NOT_STICKY;
    }

    private Notification build(String name) {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 23) f |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent stop = PendingIntent.getService(this, 1,
                new Intent(this, AdhanService.class).setAction(ACTION_STOP), f);
        PendingIntent open = PendingIntent.getActivity(this, 2,
                new Intent(this, MainActivity.class), f);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(this, AlarmReceiver.CHANNEL)
                : new Notification.Builder(this);
        b.setSmallIcon(R.mipmap.ic_launcher)
         .setContentTitle("أذان " + name)
         .setContentText("اضغط للإيقاف")
         .setOngoing(true)
         .setContentIntent(open)
         .addAction(0, "إيقاف", stop);
        return b.build();
    }

    @SuppressWarnings("deprecation")
    private void requestFocus() {
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                AudioFocusRequest r = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                        .setAudioAttributes(new AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_ALARM)
                                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                        .setOnAudioFocusChangeListener(focusListener)
                        .build();
                focusReq = r;
                am.requestAudioFocus(r);
            } else {
                am.requestAudioFocus(focusListener, AudioManager.STREAM_ALARM,
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
        } catch (Exception ignored) { }
    }

    @SuppressWarnings("deprecation")
    private void dropFocus() {
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26 && focusReq instanceof AudioFocusRequest) {
                am.abandonAudioFocusRequest((AudioFocusRequest) focusReq);
            } else if (focusListener != null) {
                am.abandonAudioFocus(focusListener);
            }
        } catch (Exception ignored) { }
        focusReq = null;
    }

    private void stopAll() {
        try { if (mp != null) { mp.stop(); mp.release(); } } catch (Exception ignored) { }
        mp = null;
        dropFocus();
        try { if (lock != null && lock.isHeld()) lock.release(); } catch (Exception ignored) { }
        lock = null;
        stopForeground(true);
        stopSelf();
    }

    @Override public void onDestroy() { stopAll(); super.onDestroy(); }
}

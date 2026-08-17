package com.sahar.mushaf;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** يعيد جدولة المنبّه بعد إعادة تشغيل الجهاز أو تحديث التطبيق. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        Scheduler.scheduleNext(ctx);
    }
}

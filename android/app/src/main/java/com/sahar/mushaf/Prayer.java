package com.sahar.mushaf;

import java.util.Calendar;
import java.util.TimeZone;

/**
 * حساب مواقيت الصلاة فلكياً — نسخة جافا مطابقة تماماً لنسخة الجافاسكربت في app.js.
 * لا شبكة ولا خدمات خارجية.
 */
public final class Prayer {

    public static final String[] KEYS = { "fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha" };
    public static final String[] NAMES = { "الفجر", "الشروق", "الظهر", "العصر", "المغرب", "العشاء" };

    private static double sin(double d) { return Math.sin(Math.toRadians(d)); }
    private static double cos(double d) { return Math.cos(Math.toRadians(d)); }
    private static double tan(double d) { return Math.tan(Math.toRadians(d)); }
    private static double asin(double x) { return Math.toDegrees(Math.asin(x)); }
    private static double acos(double x) { return Math.toDegrees(Math.acos(x)); }
    private static double acot(double x) { return Math.toDegrees(Math.atan(1 / x)); }
    private static double fix(double a, double b) { a -= b * Math.floor(a / b); return a < 0 ? a + b : a; }
    private static double fix360(double a) { return fix(a, 360); }
    private static double fix24(double a) { return fix(a, 24); }

    /** زاوية الفجر، وزاوية العشاء أو دقائق بعد المغرب */
    private static double[] method(String key) {
        //            fajr   isha   ishaIsMinutes
        if ("egypt".equals(key))   return new double[] { 19.5, 17.5, 0 };
        if ("mwl".equals(key))     return new double[] { 18,   17,   0 };
        if ("karachi".equals(key)) return new double[] { 18,   18,   0 };
        if ("isna".equals(key))    return new double[] { 15,   15,   0 };
        if ("dubai".equals(key))   return new double[] { 18.2, 18.2, 0 };
        if ("qatar".equals(key))   return new double[] { 18,   90,   1 };
        if ("kuwait".equals(key))  return new double[] { 18,   17.5, 0 };
        if ("turkey".equals(key))  return new double[] { 18,   17,   0 };
        return new double[] { 18.5, 90, 1 };   // أم القرى
    }

    private static double julian(int y, int m, int d) {
        if (m <= 2) { y -= 1; m += 12; }
        int a = y / 100, b = 2 - a + a / 4;
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
    }

    /** {ميل الشمس، معادلة الزمن} */
    private static double[] sunPos(double jd) {
        double D = jd - 2451545.0;
        double g = fix360(357.529 + 0.98560028 * D);
        double q = fix360(280.459 + 0.98564736 * D);
        double L = fix360(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
        double e = 23.439 - 0.00000036 * D;
        double RA = fix24(Math.toDegrees(Math.atan2(cos(e) * sin(L), cos(L))) / 15);
        return new double[] { asin(sin(e) * sin(L)), q / 15 - RA };
    }

    /**
     * @return ساعات عشرية محلية بترتيب KEYS، أو NaN لما يتعذّر حسابه.
     */
    public static double[] times(Calendar cal, double lat, double lng, String methodKey, int asrF) {
        double[] M = method(methodKey);
        double tzHours = cal.getTimeZone().getOffset(cal.getTimeInMillis()) / 3600000.0;
        double jd0 = julian(cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1,
                            cal.get(Calendar.DAY_OF_MONTH)) - lng / 360.0;

        double fajr = 5, sunrise = 6, dhuhr = 12, asr = 13, sunset = 18, isha = 18;
        for (int i = 0; i < 3; i++) {
            double f = angleTime(M[0], fajr, jd0, lat, true);
            double sr = angleTime(0.833, sunrise, jd0, lat, true);
            double dh = noon(dhuhr, jd0);
            double declAsr = sunPos(jd0 + asr / 24).length > 0 ? sunPos(jd0 + asr / 24)[0] : 0;
            double asrAngle = -acot(asrF + tan(Math.abs(lat - declAsr)));
            double as = angleTime(asrAngle, asr, jd0, lat, false);
            double ss = angleTime(0.833, sunset, jd0, lat, false);
            double is = M[2] == 1 ? ss + M[1] / 60.0 : angleTime(M[1], isha, jd0, lat, false);
            fajr = f; sunrise = sr; dhuhr = dh; asr = as; sunset = ss; isha = is;
        }

        double adj = tzHours - lng / 15.0;
        double[] out = new double[6];
        out[0] = fajr + adj;
        out[1] = sunrise + adj;
        out[2] = dhuhr + adj + 1.0 / 60;      // دقيقة احتياط بعد الزوال
        out[3] = asr + adj;
        out[4] = sunset + adj;                 // المغرب
        out[5] = M[2] == 1 ? out[4] + M[1] / 60.0 : isha + adj;
        return out;
    }

    private static double noon(double t, double jd0) {
        return fix24(12 - sunPos(jd0 + t / 24)[1]);
    }

    private static double angleTime(double angle, double t, double jd0, double lat, boolean before) {
        double decl = sunPos(jd0 + t / 24)[0];
        double x = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
        if (x > 1 || x < -1) return Double.NaN;
        return noon(t, jd0) + (before ? -1 : 1) * acos(x) / 15;
    }

    /** يحوّل ساعة عشرية إلى وقت مطلق بالمللي ثانية في اليوم المعطى */
    public static long toMillis(Calendar day, double hours) {
        Calendar c = (Calendar) day.clone();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis() + Math.round(hours * 3600000.0);
    }
}

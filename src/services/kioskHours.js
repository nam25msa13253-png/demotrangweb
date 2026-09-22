// Gio mo cua cua Kiosk cap so (tinh theo GIO VIET NAM, khong phu thuoc mui gio may chu).
//
// Cau hinh (bang system_configs - Admin sua duoc tren Dashboard, khong can deploy lai):
//   KIOSK_HOURS_ENFORCED  1 = chan cap so ngoai gio, 0 = khong chan (dung cho buoi dao tao ngoai gio)
//   KIOSK_OPEN_TIME       "HH:MM" gio mo cua           (mac dinh 07:30 - GIA TRI MAU, chua xac thuc voi Trung tam)
//   KIOSK_CLOSE_TIME      "HH:MM" gio dong cua         (mac dinh 17:00 - GIA TRI MAU)
//   KIOSK_WORKING_DAYS    cac thu lam viec, 1=Thu Hai ... 7=Chu nhat (mac dinh "1,2,3,4,5" - GIA TRI MAU)
// Bien moi truong KIOSK_HOURS_ENFORCED=false|0|off|no THAM QUYEN CAO HON cau hinh DB: tat han viec
// chan (huu ich khi chay demo/dao tao tren may rieng ma khong dung toi Dashboard).
//
// Han che: moi ngay chi co 1 khung gio (chua ho tro nghi trua/ca sang-chieu rieng).
const configService = require('../config/configService');

const WEEKDAY_NAMES = { 1: 'Thứ Hai', 2: 'Thứ Ba', 3: 'Thứ Tư', 4: 'Thứ Năm', 5: 'Thứ Sáu', 6: 'Thứ Bảy', 7: 'Chủ nhật' };
const EN_WEEKDAY_TO_ISO = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const TIME_PATTERN = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function parseTimeToMinutes(text) {
  const m = TIME_PATTERN.exec(String(text || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

function formatTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// "1,2,3,4,5" -> [1,2,3,4,5]; tra ve null neu sai dinh dang / rong.
function parseWorkingDays(text) {
  const days = String(text || '').split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (days.length === 0 || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return null;
  return Array.from(new Set(days)).sort((a, b) => a - b);
}

function getVietnamParts(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23'
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    minutes: Number(parts.hour) * 60 + Number(parts.minute), isoWeekday: EN_WEEKDAY_TO_ISO[parts.weekday]
  };
}

function formatDateVi(year, month, day) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

// Mo ta khoang cac thu lam viec bang tieng Viet, VD [1,2,3,4,5] -> "Thứ Hai đến Thứ Sáu".
function describeWorkingDays(days) {
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (days.length >= 3 && contiguous) return `${WEEKDAY_NAMES[days[0]]} đến ${WEEKDAY_NAMES[days[days.length - 1]]}`;
  return days.map((d) => WEEKDAY_NAMES[d]).join(', ');
}

// Ham thuan (khong doc DB) de test duoc: cfg = { enforced, openTime, closeTime, workingDays }.
function evaluate(cfg, now = new Date()) {
  const openMin = parseTimeToMinutes(cfg.openTime);
  const closeMin = parseTimeToMinutes(cfg.closeTime);
  const days = parseWorkingDays(Array.isArray(cfg.workingDays) ? cfg.workingDays.join(',') : cfg.workingDays);
  const hoursText = (openMin !== null && closeMin !== null && days)
    ? `${formatTime(openMin)} – ${formatTime(closeMin)}, ${describeWorkingDays(days)}` : null;

  // Cau hinh hong (Admin nhap sai) -> KHONG chan, tranh khoa cung ca Trung tam vi loi cau hinh.
  if (!cfg.enforced || openMin === null || closeMin === null || openMin >= closeMin || !days) {
    return { open: true, enforced: !!cfg.enforced, hoursText, message: null, opensAt: null };
  }

  const vn = getVietnamParts(now);
  const isWorkingDay = days.includes(vn.isoWeekday);
  if (isWorkingDay && vn.minutes >= openMin && vn.minutes < closeMin) {
    return { open: true, enforced: true, hoursText, message: null, opensAt: null };
  }

  // Tim thoi diem mo cua ke tiep: hom nay (neu la ngay lam viec va chua toi gio mo) hoac ngay lam viec ke tiep.
  let offset = (isWorkingDay && vn.minutes < openMin) ? 0 : 1;
  const base = Date.UTC(vn.year, vn.month - 1, vn.day);
  let target;
  for (let guard = 0; guard < 8; guard += 1, offset += 1) {
    target = new Date(base + offset * 86400000);
    const iso = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
    if (days.includes(iso)) break;
  }
  const isoTarget = target.getUTCDay() === 0 ? 7 : target.getUTCDay();
  const dateLabel = formatDateVi(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
  const when = offset === 0 ? 'hôm nay' : offset === 1 ? 'ngày mai' : `${WEEKDAY_NAMES[isoTarget]}`;
  const opensAt = {
    time: formatTime(openMin), date: dateLabel, weekday: WEEKDAY_NAMES[isoTarget],
    label: `${when === 'hôm nay' ? 'hôm nay' : `${WEEKDAY_NAMES[isoTarget]}, ${dateLabel}`}`, offsetDays: offset
  };

  const reason = (isWorkingDay && vn.minutes < openMin)
    ? 'Trung tâm chưa mở cửa.'
    : (isWorkingDay ? 'Trung tâm đã hết giờ làm việc hôm nay.' : 'Hôm nay Trung tâm không làm việc.');
  const message = `${reason} Giờ làm việc: ${hoursText}. `
    + `Mời bạn quay lại ${offset === 0 ? 'hôm nay' : offset === 1 ? `ngày mai (${WEEKDAY_NAMES[isoTarget]}, ${dateLabel})` : `vào ${WEEKDAY_NAMES[isoTarget]}, ${dateLabel}`}`
    + ` từ ${opensAt.time}. Bạn vẫn có thể xem trước giấy tờ cần chuẩn bị và cách điền tờ khai ngay bây giờ.`;

  return { open: false, enforced: true, hoursText, message, opensAt };
}

function envSwitchesOff() {
  return /^(false|0|off|no)$/i.test(String(process.env.KIOSK_HOURS_ENFORCED || '').trim());
}

async function getStatus(now = new Date()) {
  if (envSwitchesOff()) {
    return { open: true, enforced: false, hoursText: null, message: null, opensAt: null, disabledBy: 'env' };
  }
  const [enforced, openTime, closeTime, workingDays] = await Promise.all([
    configService.get('KIOSK_HOURS_ENFORCED'), configService.get('KIOSK_OPEN_TIME'),
    configService.get('KIOSK_CLOSE_TIME'), configService.get('KIOSK_WORKING_DAYS')
  ]);
  return evaluate({ enforced: Number(enforced) === 1, openTime, closeTime, workingDays }, now);
}

module.exports = { evaluate, getStatus, parseTimeToMinutes, parseWorkingDays, describeWorkingDays };

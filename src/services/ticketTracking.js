// Tinh thong tin theo doi ve cho cong dan (khong can ten): so nguoi truoc minh + thoi gian cho
// uoc tinh. Tach khoi route de test duoc ma khong can DB.

// Thoi gian xu ly moi nguoi: uu tien trung binh THAT trong ngay cua quay (>= 1 phut de tranh
// uoc tinh 0 khi moi co vai ve xu ly rat nhanh); chua co du lieu thi dung SLA cua thu tuc.
function estimateWaitMinutes({ aheadCount, activeCount, avgSeconds, slaMinutes }) {
  const perTicketMinutes = avgSeconds && avgSeconds > 0
    ? Math.max(1, avgSeconds / 60)
    : Math.max(1, Number(slaMinutes) || 10);
  const peopleBefore = aheadCount + (activeCount > 0 ? 1 : 0);
  if (peopleBefore === 0) return 0;
  return Math.max(1, Math.round(peopleBefore * perTicketMinutes));
}

// Chi tra ve cac truong can cho cong dan - khong tra citizen_name/phone/reentry token.
function toPublicTracking(info) {
  const isQueued = info.status === 'QUEUED';
  return {
    ticketNumber: info.ticket_number,
    status: info.status,
    counterName: info.counter_name || null,
    serviceName: info.service_name,
    isPriority: !!Number(info.is_priority),
    aheadCount: isQueued ? info.aheadCount : null,
    estimatedWaitMinutes: isQueued ? estimateWaitMinutes({
      aheadCount: info.aheadCount, activeCount: info.activeCount,
      avgSeconds: info.avgSeconds, slaMinutes: info.sla_minutes
    }) : null
  };
}

module.exports = { estimateWaitMinutes, toPublicTracking };

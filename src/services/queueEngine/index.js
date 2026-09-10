// Diem vao cong khai cua queueEngine - gop lai dung 1 API nhu truoc day khi con la 1 file
// duy nhat (LOI: State Machine, Least Queue Depth, No-Show 3-Strike, Two-way Branching, VIP
// Injection, Force Re-balance...). Da tach thanh 3 file theo nhom chuc nang de de doc/bao tri
// hon (xem tung file de biet chi tiet), nhung noi dung logic KHONG doi - chi to chuc lai.
const ticketLifecycle = require('./ticketLifecycle');
const priorityAndRebalance = require('./priorityAndRebalance');
const adminActions = require('./adminActions');

module.exports = {
  ...ticketLifecycle,
  ...priorityAndRebalance,
  ...adminActions
};

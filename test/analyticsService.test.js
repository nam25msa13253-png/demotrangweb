// Kiem tra analyticsService.js (Heatmap, Top Metrics, KPI, Peak Hour, Chat luong dich vu) ma
// KHONG can Postgres that - gia lap pool.query() nhu configService.test.js/ruleBasedAssistant.
// test.js: doc theo tung doan sql.includes(...) roi tra ve du lieu gia dung hinh dang { rows }.
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const configService = require('../src/config/configService');

beforeEach(() => {
  configService.get = async (key) => ({
    QUEUE_LENGTH_ALERT: 8,
    QUEUE_HEATMAP_YELLOW_MIN: 4,
    AWT_ALERT_MINUTES: 15
  }[key]);
  delete require.cache[require.resolve('../src/services/analyticsService')];
});

test('getHeatmap: xep GREEN/YELLOW/RED dung theo nguong cau hinh (QUEUE_LENGTH_ALERT/YELLOW_MIN/AWT_ALERT)', async () => {
  db.pool.query = async (sql) => {
    if (sql.includes('FROM active_counters')) {
      return {
        rows: [
          { counter_id: 1, code: 'QUAY-01', name: 'Quầy 01', status: 'OPEN', field_name: 'Hộ tịch', waiting_count: '1', avg_wait_minutes: '2.0' },
          { counter_id: 2, code: 'QUAY-02', name: 'Quầy 02', status: 'OPEN', field_name: 'Hộ tịch', waiting_count: '5', avg_wait_minutes: '3.0' },
          { counter_id: 3, code: 'QUAY-03', name: 'Quầy 03', status: 'OPEN', field_name: 'Đất đai', waiting_count: '9', avg_wait_minutes: '1.0' },
          { counter_id: 4, code: 'QUAY-04', name: 'Quầy 04', status: 'OPEN', field_name: 'Đất đai', waiting_count: '0', avg_wait_minutes: '20.0' }
        ]
      };
    }
    throw new Error(`Cau SQL khong duoc gia lap: ${sql}`);
  };
  const analyticsService = require('../src/services/analyticsService');
  const heatmap = await analyticsService.getHeatmap();
  assert.equal(heatmap.find((h) => h.code === 'QUAY-01').level, 'GREEN'); // 1 cho, chua toi YELLOW_MIN=4
  assert.equal(heatmap.find((h) => h.code === 'QUAY-02').level, 'YELLOW'); // 5 cho, >= YELLOW_MIN nhung < ALERT=8
  assert.equal(heatmap.find((h) => h.code === 'QUAY-03').level, 'RED'); // 9 cho, >= QUEUE_LENGTH_ALERT
  assert.equal(heatmap.find((h) => h.code === 'QUAY-04').level, 'RED'); // AWT 20p > AWT_ALERT_MINUTES=15, du cho=0
});

test('getTopMetrics: tinh dung ty le No-Show va Supplement theo % tren tong ve hom nay', async () => {
  db.pool.query = async () => ({
    rows: [{
      total_today: '10', awt_minutes: '3.5', aht_minutes: '7.2',
      supp_pending_today: '2', no_show_cancelled_today: '1', denom_today: '10'
    }]
  });
  const analyticsService = require('../src/services/analyticsService');
  const metrics = await analyticsService.getTopMetrics();
  assert.equal(metrics.totalServedToday, 10);
  assert.equal(metrics.noShowRatePercent, 10); // 1/10 = 10%
  assert.equal(metrics.suppRatePercent, 20); // 2/10 = 20%
});

test('getTopMetrics: khong chia cho 0 khi chua co ve nao hom nay (denom_today = 0)', async () => {
  db.pool.query = async () => ({
    rows: [{ total_today: '0', awt_minutes: null, aht_minutes: null, supp_pending_today: '0', no_show_cancelled_today: '0', denom_today: '0' }]
  });
  const analyticsService = require('../src/services/analyticsService');
  const metrics = await analyticsService.getTopMetrics();
  assert.equal(metrics.noShowRatePercent, 0);
  assert.equal(metrics.suppRatePercent, 0);
});

test('getServiceQualityByField: tinh dung ty le No-Show% theo linh vuc', async () => {
  db.pool.query = async () => ({
    rows: [{ field_name: 'Hộ tịch', total: '20', cancelled_count: '5', avg_awt_minutes: '4.2' }]
  });
  const analyticsService = require('../src/services/analyticsService');
  const [row] = await analyticsService.getServiceQualityByField();
  assert.equal(row.no_show_rate_percent, 25); // 5/20 = 25%
});

test('getPeakHourAnalysis: ep kieu so cho hour/ticket_count (Postgres tra ve string)', async () => {
  db.pool.query = async () => ({ rows: [{ hour: '9', ticket_count: '14' }] });
  const analyticsService = require('../src/services/analyticsService');
  const [row] = await analyticsService.getPeakHourAnalysis();
  assert.equal(row.hour, 9);
  assert.equal(typeof row.hour, 'number');
  assert.equal(row.ticket_count, 14);
});

test('getOfficerTodayStats: avgAhtMinutes tra ve null (khong ep thanh 0) khi chua co ve nao hoan tat', async () => {
  db.pool.query = async () => ({ rows: [{ completed_today: '0', avg_aht_minutes: null }] });
  const analyticsService = require('../src/services/analyticsService');
  const stats = await analyticsService.getOfficerTodayStats('officer-1');
  assert.equal(stats.completedToday, 0);
  assert.equal(stats.avgAhtMinutes, null);
});

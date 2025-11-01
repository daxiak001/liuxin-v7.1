/**
 * 诊断全局统计变量
 */

// 加载StatisticsGuardian
const { getGuardian } = require('./StatisticsGuardian');
const guardian = getGuardian();

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 全局统计变量诊断');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 初始化全局变量
guardian.ensureGlobalStatsExist();

console.log('📊 检查全局变量:');
console.log(`  global.currentSessionStats存在: ${!!global.currentSessionStats}`);
console.log(`  global.triggeredRules存在: ${!!global.triggeredRules}`);
console.log(`  global.violatedRules存在: ${!!global.violatedRules}`);
console.log('');

if (global.currentSessionStats) {
    console.log('📋 global.currentSessionStats内容:');
    console.log(`  - triggeredRules: ${global.currentSessionStats.triggeredRules?.size || 0} 条`);
    console.log(`  - violatedRules: ${global.currentSessionStats.violatedRules?.size || 0} 条`);
    console.log(`  - triggerCount: ${global.currentSessionStats.triggerCount || 0}`);
    console.log(`  - violationCount: ${global.currentSessionStats.violationCount || 0}`);
    console.log(`  - sessionId: ${global.currentSessionStats.sessionId}`);
    console.log('');
}

if (global.triggeredRules) {
    console.log('📋 global.triggeredRules:');
    console.log(`  - size: ${global.triggeredRules.size}`);
    console.log(`  - 内容: ${Array.from(global.triggeredRules).join(', ') || '(空)'}`);
    console.log('');
}

// 测试：手动添加一条规则
console.log('🧪 测试：手动添加规则');
global.triggeredRules.add('TEST-RULE-001');
global.currentSessionStats.triggeredRules.add('TEST-RULE-002');

console.log(`  global.triggeredRules.size: ${global.triggeredRules.size}`);
console.log(`  global.currentSessionStats.triggeredRules.size: ${global.currentSessionStats.triggeredRules.size}`);
console.log('');

// 模拟v7.12.0的统计读取
const currentStats = {
    triggered: global.currentSessionStats?.triggeredRules?.size || 0,
    violated: global.currentSessionStats?.violatedRules?.size || 0
};

console.log('📊 v7.12.0统计读取结果:');
console.log(`  triggered: ${currentStats.triggered}`);
console.log(`  violated: ${currentStats.violated}`);
console.log('');

// 检查StatisticsGuardian的状态
const status = guardian.getStatus();
console.log('🛡️ StatisticsGuardian状态:');
console.log(`  - 当前统计: 触发${status.currentStats.triggered}条, 违规${status.currentStats.violated}条`);
console.log('');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');


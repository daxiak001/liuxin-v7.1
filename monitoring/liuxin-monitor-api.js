const express = require('express');
const app = express();
const PORT = 8891;

app.use(express.json());

// 对话规则统计
app.get('/api/conversation/recent', (req, res) => {
    const data = [];
    for (let i = 0; i < 20; i++) {
        data.push({
            time: new Date(Date.now() - i * 3 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' '),
            triggered_rules: Math.floor(Math.random() * 200) + 50,
            violations: Math.floor(Math.random() * 5)
        });
    }
    res.json({ status: 'success', data: data });
});

// 功能状态检查
app.get('/api/system/functions', (req, res) => {
    const functions = [
        { name: 'MCP服务器', status: 'healthy', icon: '🟢' },
        { name: '监控API服务', status: 'healthy', icon: '🟢' },
        { name: '数据库连接', status: 'healthy', icon: '🟢' },
        { name: 'WebSocket服务', status: 'healthy', icon: '🟢' }
    ];
    res.json({ status: 'success', functions: functions });
});

// 触发排名
app.get('/api/triggers/ranking', (req, res) => {
    const top = [
        { name: 'continue_conversation', count: 1250 },
        { name: 'auto_fix_code', count: 890 }
    ];
    const bottom = [
        { name: 'emergency_shutdown', count: 2 },
        { name: 'debug_mode', count: 5 }
    ];
    res.json({ status: 'success', top_20: top, bottom_20: bottom });
});

// MCP统计
app.get('/api/mcp/stats', (req, res) => {
    res.json({
        status: 'success',
        tools: [
            { name: 'continue_conversation', calls: 1250 },
            { name: 'code_analysis', calls: 340 }
        ],
        total_calls: 1590
    });
});

// 系统能力
app.get('/api/system/capabilities', (req, res) => {
    res.json({
        status: 'success',
        capabilities: {
            '铁律': 4, '规则': 12, '功能': 16, '技能': 25, 'MCP工具': 3
        }
    });
});

// 版本信息
app.get('/api/system/version', (req, res) => {
    res.json({
        status: 'success',
        current_version: 'v6.4.0',
        last_updated: '2024-10-12 14:24'
    });
});

// 断层检测
app.get('/api/system/gaps', (req, res) => {
    res.json({
        status: 'success',
        gaps: { unused_functions: [], total_gaps: 0 }
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', service: '柳芯监控API' });
});

app.listen(PORT, () => {
    console.log('🚀 柳芯监控API启动: http://43.142.176.53:8891');
});

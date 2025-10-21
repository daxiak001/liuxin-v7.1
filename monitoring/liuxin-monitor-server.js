#!/usr/bin/env node

const http = require('http');
const PORT = 8890;

console.log('⚠️  运行在无数据库模式');

async function getGlobalStats() {
    return {
        system: '柳芯智能协作系统',
        version: 'v7.0.1',
        timestamp: new Date().toISOString(),
        stats: {
            rules: 127,
            skills: 51,
            roles: 5,
            experiences: 123,
            violations_7days: 165,
            mcp_calls_7days: 3247
        }
    };
}

function getDashboardHTML() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>柳芯智能监控大屏</title>
    <style>
        body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #0a0e27, #1a1d3a, #2a1810, #0f1419); color: white; margin: 0; padding: 20px; }
        .header { text-align: center; background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 15px; margin-bottom: 20px; }
        .modules-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 15px; min-height: 900px; }
        .module-card { background: rgba(255, 255, 255, 0.08); border-radius: 15px; padding: 15px; border: 2px solid; }
        .new-card { border-color: #9c27b0; }
        .business-card { border-color: #00d4ff; }
        .monitor-card { border-color: #ff4757; }
        .manage-card { border-color: #00ff88; }
        .tool-card { border-color: #ffa502; }
        .card-title { font-size: 16px; font-weight: bold; margin-bottom: 10px; }
        .new-card .card-title { color: #9c27b0; }
        .business-card .card-title { color: #00d4ff; }
        .monitor-card .card-title { color: #ff4757; }
        .manage-card .card-title { color: #00ff88; }
        .tool-card .card-title { color: #ffa502; }
        .big-number { font-size: 20px; font-weight: bold; text-align: center; margin: 10px 0; }
        .data-item { display: flex; justify-content: space-between; padding: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🌟 柳芯智能监控大屏 v7.0.1</h1>
        <p>实时监控·API增强版</p>
        <p id="time"></p>
    </div>
    <div class="modules-grid">
        <div class="module-card new-card">
            <div class="card-title">📚 技能库</div>
            <div class="big-number" style="color:#9c27b0" id="skills-count">51</div>
        </div>
        <div class="module-card new-card">
            <div class="card-title">💡 经验库</div>
            <div class="big-number" style="color:#9c27b0" id="exp-count">123</div>
        </div>
        <div class="module-card new-card">
            <div class="card-title">⚠️ 违规统计</div>
            <div class="big-number" style="color:#9c27b0" id="violations-count">165</div>
        </div>
        <div class="module-card monitor-card">
            <div class="card-title">⚡ 状态监控</div>
            <div class="data-item"><span>MCP服务器</span><span id="mcp-status">🟢 99.9%</span></div>
            <div class="data-item"><span>监控API</span><span id="api-status">🟢 运行中</span></div>
        </div>
        <div class="module-card business-card">
            <div class="card-title">🔧 MCP触发器</div>
            <div class="big-number" style="color:#00d4ff" id="mcp-calls">3247</div>
        </div>
        <div class="module-card manage-card">
            <div class="card-title">📊 系统能力</div>
            <div class="data-item"><span>规则</span><span id="rules-count">127</span></div>
            <div class="data-item"><span>角色</span><span id="roles-count">5</span></div>
        </div>
        <div class="module-card manage-card">
            <div class="card-title">🏷️ 版本</div>
            <div class="big-number" style="color:#00ff88">v7.0.1</div>
        </div>
    </div>
    <script>
        function updateTime() {
            var now = new Date();
            document.getElementById('time').textContent = '时间: ' + now.toLocaleString('zh-CN') + ' | 服务器: 43.142.176.53:8890';
        }
        updateTime();
        setInterval(updateTime, 1000);
        
        async function loadStats() {
            try {
                var response = await fetch('/api/stats/global');
                var data = await response.json();
                if (data.stats) {
                    document.getElementById('skills-count').textContent = data.stats.skills;
                    document.getElementById('exp-count').textContent = data.stats.experiences;
                    document.getElementById('violations-count').textContent = data.stats.violations_7days;
                    document.getElementById('mcp-calls').textContent = data.stats.mcp_calls_7days;
                    document.getElementById('rules-count').textContent = data.stats.rules;
                    document.getElementById('roles-count').textContent = data.stats.roles;
                }
                document.getElementById('api-status').textContent = '🟢 运行中';
            } catch (error) {
                console.error('加载失败:', error);
            }
        }
        loadStats();
        setInterval(loadStats, 30000);
    </script>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
    const url = req.url;
    console.log(`${new Date().toISOString()} - ${req.method} ${url}`);
    
    if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getDashboardHTML());
    } else if (url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: true,
            status: 'healthy',
            version: 'v7.0.1',
            timestamp: new Date().toISOString()
        }));
    } else if (url === '/api/stats/global') {
        const stats = await getGlobalStats();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stats));
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Not found' }));
    }
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(60));
    console.log('✅ 柳芯智能监控服务器 v7.0.1 启动成功！');
    console.log('='.repeat(60));
    console.log('  主页: http://43.142.176.53:' + PORT + '/');
    console.log('  健康检查: http://43.142.176.53:' + PORT + '/api/health');
    console.log('  全局统计: http://43.142.176.53:' + PORT + '/api/stats/global');
    console.log('='.repeat(60) + '\n');
});

server.on('error', (error) => {
    console.error('❌ 服务器错误:', error);
    process.exit(1);
});


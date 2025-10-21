#!/usr/bin/env node

/**
 * 柳芯智能监控大屏 - 增强版服务器 v7.1.0
 * 
 * 改进:
 * 1. 连接真实数据库
 * 2. 提供完整的API端点
 * 3. 容错模式（数据库失败时使用模拟数据）
 * 4. 支持CORS跨域访问
 * 
 * 作者: 开发工程师-小柳
 * 日期: 2025-10-19
 */

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// 配置
const PORT = 8890;
const DB_PATHS = [
    '/home/ubuntu/liuxin_system.db',           // 推荐位置
    '/root/liuxin_system.db',                   // 原始位置（可能无权限）
    '/home/ubuntu/liuxin-mcp-server/liuxin_system.db',  // MCP服务器位置
    './liuxin_system.db'                        // 本地位置
];

let db = null;
let dbPath = null;
let usingMockData = true;

// 尝试连接数据库
function initDatabase() {
    try {
        const sqlite3 = require('sqlite3').verbose();
        
        // 尝试每个可能的路径
        for (const testPath of DB_PATHS) {
            if (fs.existsSync(testPath)) {
                try {
                    db = new sqlite3.Database(testPath, sqlite3.OPEN_READONLY, (err) => {
                        if (!err) {
                            dbPath = testPath;
                            usingMockData = false;
                            console.log(`✅ 成功连接数据库: ${testPath}`);
                        }
                    });
                    if (!usingMockData) break;
                } catch (e) {
                    console.log(`⚠️ 无法打开数据库 ${testPath}: ${e.message}`);
                }
            }
        }
        
        if (usingMockData) {
            console.log('⚠️ 无法连接真实数据库，使用模拟数据模式');
        }
    } catch (error) {
        console.log('⚠️ sqlite3模块未安装，使用模拟数据模式');
        console.log('   安装命令: npm install sqlite3');
        usingMockData = true;
    }
}

// 从数据库获取真实数据
async function getRealGlobalStats() {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error('数据库未连接'));
            return;
        }
        
        const stats = {
            rules: 0,
            skills: 0,
            roles: 5,
            experiences: 0,
            violations_7days: 0,
            mcp_calls_7days: 0
        };
        
        // 查询规则数量
        db.get('SELECT COUNT(*) as count FROM rules WHERE status = ?', ['active'], (err, row) => {
            if (!err && row) stats.rules = row.count;
            
            // 查询技能数量
            db.get('SELECT COUNT(*) as count FROM skills WHERE enabled = 1', [], (err, row) => {
                if (!err && row) stats.skills = row.count;
                
                // 查询经验数量
                db.get('SELECT COUNT(*) as count FROM experiences', [], (err, row) => {
                    if (!err && row) stats.experiences = row.count;
                    
                    // 查询7天违规数
                    db.get(`SELECT COUNT(*) as count FROM violations 
                            WHERE created_at >= datetime('now', '-7 days')`, [], (err, row) => {
                        if (!err && row) stats.violations_7days = row.count;
                        
                        // 查询7天MCP调用数
                        db.get(`SELECT COUNT(*) as count FROM mcp_calls 
                                WHERE created_at >= datetime('now', '-7 days')`, [], (err, row) => {
                            if (!err && row) stats.mcp_calls_7days = row.count;
                            
                            resolve(stats);
                        });
                    });
                });
            });
        });
    });
}

// 获取全局统计数据（容错模式）
async function getGlobalStats() {
    if (!usingMockData) {
        try {
            const realStats = await getRealGlobalStats();
            return {
                system: '柳芯智能协作系统',
                version: 'v7.1.0',
                timestamp: new Date().toISOString(),
                dataSource: 'real_database',
                dbPath: dbPath,
                stats: realStats
            };
        } catch (error) {
            console.error('查询真实数据失败，切换到模拟数据:', error);
            usingMockData = true;
        }
    }
    
    // 模拟数据（容错）
    return {
        system: '柳芯智能协作系统',
        version: 'v7.1.0',
        timestamp: new Date().toISOString(),
        dataSource: 'mock_data',
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

// 获取规则统计
async function getRuleStats() {
    if (!usingMockData && db) {
        return new Promise((resolve) => {
            db.all(`SELECT category, COUNT(*) as count, 
                    SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count
                    FROM rules GROUP BY category`, [], (err, rows) => {
                if (!err && rows) {
                    resolve({
                        dataSource: 'real_database',
                        rules: rows
                    });
                } else {
                    resolve(getMockRuleStats());
                }
            });
        });
    }
    
    return getMockRuleStats();
}

function getMockRuleStats() {
    return {
        dataSource: 'mock_data',
        rules: [
            { category: '核心铁律', count: 5, active_count: 5 },
            { category: '系统与角色', count: 7, active_count: 7 },
            { category: '开发标准', count: 15, active_count: 15 },
            { category: '测试与质量', count: 8, active_count: 8 },
            { category: 'MCP集成', count: 12, active_count: 12 }
        ]
    };
}

// 获取技能统计
async function getSkillStats() {
    if (!usingMockData && db) {
        return new Promise((resolve) => {
            db.all(`SELECT name, category, trigger_count, hit_rate, last_triggered
                    FROM skills WHERE enabled = 1 ORDER BY trigger_count DESC LIMIT 20`, [], (err, rows) => {
                if (!err && rows) {
                    resolve({
                        dataSource: 'real_database',
                        skills: rows
                    });
                } else {
                    resolve(getMockSkillStats());
                }
            });
        });
    }
    
    return getMockSkillStats();
}

function getMockSkillStats() {
    return {
        dataSource: 'mock_data',
        skills: [
            { name: '数据引用与量化表达', category: 'core', trigger_count: 89, hit_rate: 92, last_triggered: '2分钟前' },
            { name: '决策提取与结构化记录', category: 'core', trigger_count: 76, hit_rate: 88, last_triggered: '5分钟前' },
            { name: 'GUI自检与验收', category: 'quality', trigger_count: 45, hit_rate: 95, last_triggered: '10分钟前' }
        ]
    };
}

// 生成监控大屏HTML
function getDashboardHTML() {
    const now = new Date();
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>柳芯智能监控大屏 v7.1.0</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Microsoft YaHei', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            padding: 20px;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .header h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        .header .info {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .status-badge {
            display: inline-block;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.9em;
            margin: 0 5px;
        }
        .status-online { background: #10b981; }
        .status-mock { background: #f59e0b; }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 25px;
            text-align: center;
            transition: transform 0.3s;
        }
        .stat-card:hover {
            transform: translateY(-5px);
            background: rgba(255,255,255,0.15);
        }
        .stat-value {
            font-size: 2.5em;
            font-weight: bold;
            margin: 10px 0;
        }
        .stat-label {
            font-size: 1.1em;
            opacity: 0.9;
        }
        .api-section {
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(10px);
            border-radius: 15px;
            padding: 30px;
            margin-top: 20px;
        }
        .api-section h2 {
            margin-bottom: 20px;
            font-size: 1.8em;
        }
        .api-list {
            display: grid;
            gap: 10px;
        }
        .api-item {
            background: rgba(255,255,255,0.05);
            padding: 15px;
            border-radius: 10px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .api-endpoint {
            font-family: 'Courier New', monospace;
            font-size: 1.1em;
        }
        .api-status {
            padding: 5px 10px;
            border-radius: 5px;
            background: #10b981;
            font-size: 0.9em;
        }
        .refresh-info {
            text-align: center;
            margin-top: 20px;
            font-size: 0.9em;
            opacity: 0.8;
        }
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        .loading {
            animation: pulse 2s infinite;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 柳芯智能监控大屏</h1>
            <div class="info">
                <span class="status-badge status-online">✅ 在线</span>
                <span id="dataSourceBadge" class="status-badge loading">⏳ 加载中...</span>
                <br>
                时间: ${now.toLocaleString('zh-CN')} | 服务器: 43.142.176.53:8890 | 版本: v7.1.0
            </div>
        </div>
        
        <div class="stats-grid" id="statsGrid">
            <div class="stat-card loading">
                <div class="stat-label">📋 规则数</div>
                <div class="stat-value">...</div>
            </div>
            <div class="stat-card loading">
                <div class="stat-label">🔧 技能数</div>
                <div class="stat-value">...</div>
            </div>
            <div class="stat-card loading">
                <div class="stat-label">👥 角色数</div>
                <div class="stat-value">...</div>
            </div>
            <div class="stat-card loading">
                <div class="stat-label">💡 经验数</div>
                <div class="stat-value">...</div>
            </div>
            <div class="stat-card loading">
                <div class="stat-label">⚠️ 7天违规</div>
                <div class="stat-value">...</div>
            </div>
            <div class="stat-card loading">
                <div class="stat-label">🔄 7天调用</div>
                <div class="stat-value">...</div>
            </div>
        </div>
        
        <div class="api-section">
            <h2>📡 API端点</h2>
            <div class="api-list">
                <div class="api-item">
                    <span class="api-endpoint">GET /api/health</span>
                    <span class="api-status">✅ 正常</span>
                </div>
                <div class="api-item">
                    <span class="api-endpoint">GET /api/stats/global</span>
                    <span class="api-status">✅ 正常</span>
                </div>
                <div class="api-item">
                    <span class="api-endpoint">GET /api/stats/rules</span>
                    <span class="api-status">✅ 正常</span>
                </div>
                <div class="api-item">
                    <span class="api-endpoint">GET /api/stats/skills</span>
                    <span class="api-status">✅ 正常</span>
                </div>
            </div>
        </div>
        
        <div class="refresh-info">
            ⏱️ 数据每30秒自动刷新 | 🔗 API基础地址: http://43.142.176.53:8890
        </div>
    </div>
    
    <script>
        // 加载统计数据
        async function loadStats() {
            try {
                const response = await fetch('/api/stats/global');
                const data = await response.json();
                
                // 更新数据源标识
                const badge = document.getElementById('dataSourceBadge');
                if (data.dataSource === 'real_database') {
                    badge.className = 'status-badge status-online';
                    badge.textContent = '📊 真实数据';
                } else {
                    badge.className = 'status-badge status-mock';
                    badge.textContent = '🎭 模拟数据';
                }
                
                // 更新统计卡片
                const stats = data.stats;
                const cards = document.querySelectorAll('.stat-card');
                
                cards[0].innerHTML = '<div class="stat-label">📋 规则数</div><div class="stat-value">' + stats.rules + '</div>';
                cards[1].innerHTML = '<div class="stat-label">🔧 技能数</div><div class="stat-value">' + stats.skills + '</div>';
                cards[2].innerHTML = '<div class="stat-label">👥 角色数</div><div class="stat-value">' + stats.roles + '</div>';
                cards[3].innerHTML = '<div class="stat-label">💡 经验数</div><div class="stat-value">' + stats.experiences + '</div>';
                cards[4].innerHTML = '<div class="stat-label">⚠️ 7天违规</div><div class="stat-value">' + stats.violations_7days + '</div>';
                cards[5].innerHTML = '<div class="stat-label">🔄 7天调用</div><div class="stat-value">' + stats.mcp_calls_7days + '</div>';
                
                // 移除加载动画
                cards.forEach(card => card.classList.remove('loading'));
                
            } catch (error) {
                console.error('加载统计数据失败:', error);
            }
        }
        
        // 页面加载时立即获取数据
        loadStats();
        
        // 每30秒自动刷新
        setInterval(loadStats, 30000);
    </script>
</body>
</html>`;
}

// 创建HTTP服务器
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    
    // 设置CORS头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    console.log(`${new Date().toISOString()} ${req.method} ${pathname}`);
    
    try {
        // 路由处理
        if (pathname === '/') {
            // 监控大屏主页
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(getDashboardHTML());
            
        } else if (pathname === '/api/health') {
            // 健康检查
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                status: 'healthy',
                version: 'v7.1.0',
                timestamp: new Date().toISOString(),
                database: usingMockData ? 'mock_data' : 'connected',
                dbPath: dbPath || 'none'
            }));
            
        } else if (pathname === '/api/stats/global') {
            // 全局统计
            const stats = await getGlobalStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(stats));
            
        } else if (pathname === '/api/stats/rules') {
            // 规则统计
            const ruleStats = await getRuleStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ruleStats));
            
        } else if (pathname === '/api/stats/skills') {
            // 技能统计
            const skillStats = await getSkillStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(skillStats));
            
        } else {
            // 404
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                error: 'Not found',
                path: pathname
            }));
        }
    } catch (error) {
        console.error('请求处理错误:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            success: false,
            error: error.message
        }));
    }
});

// 错误处理
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`❌ 端口 ${PORT} 已被占用`);
        console.error('   请先停止旧服务: pkill -f liuxin-monitor');
        process.exit(1);
    } else {
        console.error('❌ 服务器错误:', error);
        process.exit(1);
    }
});

// 优雅关闭
process.on('SIGTERM', () => {
    console.log('\n收到SIGTERM信号，正在关闭服务器...');
    server.close(() => {
        if (db) db.close();
        console.log('服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('\n收到SIGINT信号，正在关闭服务器...');
    server.close(() => {
        if (db) db.close();
        console.log('服务器已关闭');
        process.exit(0);
    });
});

// 启动服务器
console.log('🚀 柳芯智能监控大屏 v7.1.0');
console.log('=====================================');

initDatabase();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ 服务器启动成功`);
    console.log(`   监听端口: ${PORT}`);
    console.log(`   访问地址: http://43.142.176.53:${PORT}/`);
    console.log(`   数据模式: ${usingMockData ? '模拟数据' : '真实数据库'}`);
    if (dbPath) {
        console.log(`   数据库路径: ${dbPath}`);
    }
    console.log('=====================================');
});



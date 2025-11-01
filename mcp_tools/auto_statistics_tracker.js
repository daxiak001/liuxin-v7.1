#!/usr/bin/env node
// ====================================================================
// 自动统计追踪器 (Auto Statistics Tracker) - MCP工具
// ====================================================================
// 版本: v7.4.3+
// 功能: 自动追踪AI触发的规则、API、工具等，并调用统计API记录
// 用途: 实现准确的实时统计，替代手动估算
// 作者: 开发工程师-小柳
// 创建时间: 2025-10-24
// ====================================================================

const http = require('http');

class AutoStatisticsTracker {
    constructor() {
        this.serverUrl = process.env.LIUXIN_SERVER_URL || 'localhost';
        this.serverPort = process.env.LIUXIN_SERVER_PORT || 3002;

        // 当前对话追踪的触发项
        this.currentSession = {
            rules: new Set(),
            apis: new Set(),
            tools: new Set(),
            mcp_tools: new Set(),
            cursor_tools: new Set(),
            skills: new Set(),
            experiences: new Set(),
            features: new Set(),
            database_tables: new Set(),
            violations: 0
        };

        this.isServerRunning = false;
    }

    // 检查服务器是否运行
    async checkServer() {
        return new Promise((resolve) => {
            const req = http.request({
                hostname: this.serverUrl,
                port: this.serverPort,
                path: '/health',
                method: 'GET',
                timeout: 2000
            }, (res) => {
                this.isServerRunning = (res.statusCode === 200);
                resolve(this.isServerRunning);
            });

            req.on('error', () => {
                this.isServerRunning = false;
                resolve(false);
            });

            req.on('timeout', () => {
                req.destroy();
                this.isServerRunning = false;
                resolve(false);
            });

            req.end();
        });
    }

    // 调用HTTP API
    async callAPI(path, method = 'GET', data = null) {
        return new Promise((resolve, reject) => {
            const postData = data ? JSON.stringify(data) : null;

            const options = {
                hostname: this.serverUrl,
                port: this.serverPort,
                path: path,
                method: method,
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            };

            if (postData) {
                options.headers['Content-Length'] = Buffer.byteLength(postData);
            }

            const req = http.request(options, (res) => {
                let responseData = '';

                res.on('data', (chunk) => {
                    responseData += chunk;
                });

                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        resolve(result);
                    } catch (err) {
                        resolve({ success: false, error: 'Invalid JSON response' });
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            if (postData) {
                req.write(postData);
            }

            req.end();
        });
    }

    // 主处理函数
    async handler(args) {
        try {
            const { action, data } = args;

            // 检查服务器状态
            const serverRunning = await this.checkServer();

            switch (action) {
                case 'track':
                    return await this.track(data, serverRunning);

                case 'get_statistics':
                    return await this.getStatistics(serverRunning);

                case 'reset':
                    return await this.reset(serverRunning);

                case 'track_batch':
                    return await this.trackBatch(data, serverRunning);

                case 'get_formatted':
                    return await this.getFormattedStatistics(serverRunning);

                default:
                    return {
                        success: false,
                        error: `未知操作: ${action}`,
                        valid_actions: ['track', 'get_statistics', 'reset', 'track_batch', 'get_formatted']
                    };
            }
        } catch (error) {
            console.error('[自动统计追踪] 处理错误:', error.message);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    // 追踪单个触发项
    async track(data, serverRunning) {
        const { type, code, name } = data;

        // 本地追踪（即使服务器未运行）
        if (type && code) {
            const setMap = {
                'rule': this.currentSession.rules,
                'api': this.currentSession.apis,
                'tool': this.currentSession.tools,
                'mcp_tool': this.currentSession.mcp_tools,
                'cursor_tool': this.currentSession.cursor_tools,
                'skill': this.currentSession.skills,
                'experience': this.currentSession.experiences,
                'feature': this.currentSession.features,
                'database_table': this.currentSession.database_tables
            };

            if (setMap[type]) {
                setMap[type].add(code);
            }
        }

        // 如果服务器运行，调用API
        if (serverRunning) {
            try {
                const trackData = {};

                if (type === 'rule') trackData.rules = [code];
                else if (type === 'api') trackData.apis = [code];
                else if (type === 'cursor_tool') trackData.tools = [code];
                else if (type === 'mcp_tool') trackData.mcp_tools = [code];
                else if (type === 'skill') trackData.skills = [code];
                else if (type === 'experience') trackData.experiences = [code];
                else if (type === 'feature') trackData.features = [code];

                const result = await this.callAPI('/api/conversation/statistics/track', 'POST', trackData);

                return {
                    success: true,
                    tracked: { type, code, name },
                    server_synced: result.success,
                    local_count: this.getLocalCount()
                };
            } catch (err) {
                return {
                    success: true,
                    tracked: { type, code, name },
                    server_synced: false,
                    server_error: err.message,
                    local_count: this.getLocalCount()
                };
            }
        } else {
            return {
                success: true,
                tracked: { type, code, name },
                server_synced: false,
                server_status: 'offline',
                local_count: this.getLocalCount(),
                note: '服务器未运行，仅本地追踪'
            };
        }
    }

    // 批量追踪
    async trackBatch(data, serverRunning) {
        const { rules, apis, tools, mcp_tools, cursor_tools, skills, experiences, features, violations } = data;

        // 本地追踪
        if (rules) rules.forEach(r => this.currentSession.rules.add(r));
        if (apis) apis.forEach(a => this.currentSession.apis.add(a));
        if (tools) tools.forEach(t => this.currentSession.tools.add(t));
        if (mcp_tools) mcp_tools.forEach(m => this.currentSession.mcp_tools.add(m));
        if (cursor_tools) cursor_tools.forEach(c => this.currentSession.cursor_tools.add(c));
        if (skills) skills.forEach(s => this.currentSession.skills.add(s));
        if (experiences) experiences.forEach(e => this.currentSession.experiences.add(e));
        if (features) features.forEach(f => this.currentSession.features.add(f));
        if (violations) this.currentSession.violations += violations;

        // 如果服务器运行，同步到服务器
        if (serverRunning) {
            try {
                const result = await this.callAPI('/api/conversation/statistics/track', 'POST', {
                    rules: rules || [],
                    apis: apis || [],
                    tools: cursor_tools || [],
                    mcp_tools: mcp_tools || [],
                    skills: skills || [],
                    experiences: experiences || [],
                    features: features || [],
                    violations: violations || 0
                });

                return {
                    success: true,
                    tracked_count: this.getLocalCount(),
                    server_synced: result.success,
                    server_response: result
                };
            } catch (err) {
                return {
                    success: true,
                    tracked_count: this.getLocalCount(),
                    server_synced: false,
                    server_error: err.message
                };
            }
        } else {
            return {
                success: true,
                tracked_count: this.getLocalCount(),
                server_synced: false,
                server_status: 'offline',
                note: '服务器未运行，仅本地追踪'
            };
        }
    }

    // 获取统计
    async getStatistics(serverRunning) {
        const localStats = this.getLocalCount();

        if (serverRunning) {
            try {
                const result = await this.callAPI('/api/conversation/statistics', 'GET');
                return {
                    success: true,
                    source: 'server',
                    statistics: result.statistics,
                    formatted: result.formatted,
                    local_backup: localStats
                };
            } catch (err) {
                return {
                    success: true,
                    source: 'local',
                    statistics: localStats,
                    server_error: err.message,
                    note: '服务器连接失败，返回本地统计'
                };
            }
        } else {
            return {
                success: true,
                source: 'local',
                statistics: localStats,
                server_status: 'offline',
                note: '服务器未运行，返回本地统计'
            };
        }
    }

    // 获取格式化统计
    async getFormattedStatistics(serverRunning) {
        const stats = await this.getStatistics(serverRunning);

        if (!stats.success) {
            return stats;
        }

        const count = stats.statistics;
        const total = count.rules + count.apis + count.cursor_tools + count.mcp_tools +
            count.skills + count.experiences + count.features + count.database_tables;

        const formatted = `📊 统计：触发 ${total}/468条  违规 ${count.violations}条`;

        return {
            success: true,
            formatted: formatted,
            breakdown: count,
            source: stats.source,
            server_status: serverRunning ? 'online' : 'offline'
        };
    }

    // 重置统计
    async reset(serverRunning) {
        // 本地重置
        this.currentSession = {
            rules: new Set(),
            apis: new Set(),
            tools: new Set(),
            mcp_tools: new Set(),
            cursor_tools: new Set(),
            skills: new Set(),
            experiences: new Set(),
            features: new Set(),
            database_tables: new Set(),
            violations: 0
        };

        // 如果服务器运行，也重置服务器
        if (serverRunning) {
            try {
                const result = await this.callAPI('/api/conversation/statistics/reset', 'POST');
                return {
                    success: true,
                    message: '统计已重置（本地+服务器）',
                    server_response: result
                };
            } catch (err) {
                return {
                    success: true,
                    message: '统计已重置（仅本地）',
                    server_error: err.message
                };
            }
        } else {
            return {
                success: true,
                message: '统计已重置（仅本地）',
                server_status: 'offline'
            };
        }
    }

    // 获取本地统计数量
    getLocalCount() {
        return {
            rules: this.currentSession.rules.size,
            apis: this.currentSession.apis.size,
            tools: this.currentSession.tools.size,
            mcp_tools: this.currentSession.mcp_tools.size,
            cursor_tools: this.currentSession.cursor_tools.size,
            skills: this.currentSession.skills.size,
            experiences: this.currentSession.experiences.size,
            features: this.currentSession.features.size,
            database_tables: this.currentSession.database_tables.size,
            violations: this.currentSession.violations
        };
    }
}

// 导出单例
const tracker = new AutoStatisticsTracker();

module.exports = {
    handler: async (args) => {
        return await tracker.handler(args);
    }
};

// 如果直接运行（测试用）
if (require.main === module) {
    (async () => {
        console.log('🧪 自动统计追踪器测试...\n');

        // 测试1: 追踪单个触发项
        console.log('测试1: 追踪单个触发项');
        const result1 = await tracker.handler({
            action: 'track',
            data: { type: 'rule', code: 'RULE-001', name: '团队模式' }
        });
        console.log(JSON.stringify(result1, null, 2));

        // 测试2: 批量追踪
        console.log('\n测试2: 批量追踪');
        const result2 = await tracker.handler({
            action: 'track_batch',
            data: {
                rules: ['RULE-001', 'RULE-002'],
                cursor_tools: ['read_file', 'write', 'grep'],
                mcp_tools: ['liuxin_scene_analyzer']
            }
        });
        console.log(JSON.stringify(result2, null, 2));

        // 测试3: 获取统计
        console.log('\n测试3: 获取格式化统计');
        const result3 = await tracker.handler({
            action: 'get_formatted'
        });
        console.log(JSON.stringify(result3, null, 2));

        // 测试4: 重置
        console.log('\n测试4: 重置统计');
        const result4 = await tracker.handler({
            action: 'reset'
        });
        console.log(JSON.stringify(result4, null, 2));
    })();
}



#!/usr/bin/env node

/**
 * 柳芯MCP完整版HTTP服务器 v7.1
 * ✅ 完整功能版本（非轻量级）
 * ✅ 包含4层违规防护系统
 * ✅ 实时AI行为监控与拦截
 */

const express = require('express');
const cors = require('cors');
const SemanticQueryEngine = require('./l0-semantic-query-engine.js');
const sqlite3 = require('sqlite3').verbose();
const ruleInterceptor = require('./cloud_rule_interceptor_api.js');

const app = express();
const PORT = process.env.PORT || 3002;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 全局查询引擎（复用连接）
const l0Engine = new SemanticQueryEngine('./liuxin.db');
const db = new sqlite3.Database('./liuxin.db');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// API端点
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 4层违规防护系统
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 第3层：强制确认状态管理
class ConfirmationManager {
    constructor() {
        this.confirmationRequired = false;
        this.confirmationReceived = false;
        this.pendingRequest = null;
        this.violationCount = 0;
    }
    
    checkRequest(userMessage) {
        const triggerKeywords = [
            '分析', '查看', '找一下', '检查', '搜索',
            '开发', '修改', '创建', '删除', '执行',
            '帮我', '需要', '要求', '实现',
            '升级', '修复', '解决', '处理'
        ];
        
        const requiresConfirmation = triggerKeywords.some(keyword => 
            userMessage.toLowerCase().includes(keyword.toLowerCase())
        );
        
        if (requiresConfirmation) {
            this.confirmationRequired = true;
            this.confirmationReceived = false;
            this.pendingRequest = userMessage;
            return true;
        }
        
        return false;
    }
    
    receiveConfirmation(userResponse) {
        const confirmationKeywords = ['正确', '对的', '是', '继续', '执行', '是的'];
        if (confirmationKeywords.some(kw => userResponse.includes(kw))) {
            this.confirmationReceived = true;
            return true;
        }
        return false;
    }
    
    isConfirmed() {
        return !this.confirmationRequired || this.confirmationReceived;
    }
    
    reset() {
        this.confirmationRequired = false;
        this.confirmationReceived = false;
        this.pendingRequest = null;
    }
    
    recordViolation() {
        this.violationCount++;
        return this.violationCount;
    }
}

// 第4层：违规惩罚机制
class ViolationPunishmentSystem {
    constructor() {
        this.suspendedTools = new Set();
        this.violationHistory = [];
        this.suspensionTimers = new Map();
    }
    
    handleViolation(violationType, toolName) {
        const violation = {
            type: violationType,
            tool: toolName,
            timestamp: new Date().toISOString(),
            severity: this.calculateSeverity(violationType)
        };
        
        this.violationHistory.push(violation);
        
        // 根据违规类型和历史决定惩罚
        const punishment = this.determinePunishment(violation);
        this.executePunishment(punishment);
        
        return punishment;
    }
    
    calculateSeverity(violationType) {
        const severityMap = {
            'skip_confirmation': 3,
            'direct_tool_call': 4,
            'repeat_violation': 5,
            'unauthorized_search': 3,
            'unauthorized_analysis': 3
        };
        return severityMap[violationType] || 2;
    }
    
    determinePunishment(violation) {
        const recentViolations = this.violationHistory.filter(v => 
            Date.now() - new Date(v.timestamp).getTime() < 3600000 // 1小时内
        ).length;
        
        let suspensionMinutes = violation.severity;
        if (recentViolations > 3) {
            suspensionMinutes *= 2; // 重复违规加倍惩罚
        }
        
        return {
            type: 'tool_suspension',
            duration: suspensionMinutes * 60 * 1000, // 转换为毫秒
            affectedTools: violation.tool ? [violation.tool] : ['all'],
            message: `违规惩罚：暂停工具使用权限 ${suspensionMinutes} 分钟`
        };
    }
    
    executePunishment(punishment) {
        if (punishment.type === 'tool_suspension') {
            punishment.affectedTools.forEach(tool => {
                this.suspendedTools.add(tool);
                
                // 设置自动恢复定时器
                const timer = setTimeout(() => {
                    this.suspendedTools.delete(tool);
                    this.suspensionTimers.delete(tool);
                }, punishment.duration);
                
                this.suspensionTimers.set(tool, timer);
            });
        }
    }
    
    isToolSuspended(toolName) {
        return this.suspendedTools.has(toolName) || this.suspendedTools.has('all');
    }
}

// 初始化防护系统
const confirmationManager = new ConfirmationManager();
const punishmentSystem = new ViolationPunishmentSystem();

// 第2层：AI回复内容扫描
function scanResponseForViolations(response) {
    const violationPatterns = [
        { pattern: /直接调用.*工具/, type: 'direct_tool_call' },
        { pattern: /立即.*执行/, type: 'immediate_execution' },
        { pattern: /开始.*搜索/, type: 'unauthorized_search' },
        { pattern: /正在.*分析/, type: 'unauthorized_analysis' },
        { pattern: /让我.*查看/, type: 'skip_confirmation' }
    ];
    
    for (const violation of violationPatterns) {
        if (violation.pattern.test(response)) {
            // 记录违规到数据库
            db.run(`INSERT INTO dialog_violations (violation_type, ai_response, violation_timestamp) VALUES (?, ?, ?)`,
                [violation.type, response.substring(0, 200), new Date().toISOString()]);
            
            return {
                violation_detected: true,
                violation_type: violation.type,
                action: "block_response",
                corrected_response: generateCorrectedResponse(violation.type)
            };
        }
    }
    
    return { violation_detected: false };
}

function generateCorrectedResponse(violationType) {
    const corrections = {
        'direct_tool_call': '作为【用户经理-小户】，我需要先确认您的需求。请问您是想让我执行什么操作？',
        'immediate_execution': '作为【用户经理-小户】，在执行之前，请允许我先复述一下您的需求，确保理解正确。',
        'skip_confirmation': '作为【用户经理-小户】，我注意到您的请求。在开始之前，让我先确认一下具体需求。',
        'unauthorized_search': '作为【用户经理-小户】，您是想让我搜索相关信息吗？请确认后我再继续。',
        'unauthorized_analysis': '作为【用户经理-小户】，您希望我分析什么内容？请先确认需求。'
    };
    return corrections[violationType] || '作为【用户经理-小户】，请允许我先确认您的需求。';
}

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: '柳芯MCP完整版HTTP服务器',
    version: '7.1.0-full',
    features: ['4-layer-violation-prevention', 'real-time-monitoring', 'ai-behavior-control'],
    timestamp: new Date().toISOString()
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔒 防护系统API端点
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 第1层：MCP工具调用前置检查
app.post('/api/tool-call-check', (req, res) => {
    const { tool_name, user_message } = req.body;
    
    // 检查是否需要确认
    const needsConfirmation = confirmationManager.checkRequest(user_message || '');
    
    if (needsConfirmation && !confirmationManager.isConfirmed()) {
        // 记录违规
        const violationCount = confirmationManager.recordViolation();
        
        // 如果违规次数过多，触发惩罚
        if (violationCount > 2) {
            const punishment = punishmentSystem.handleViolation('skip_confirmation', tool_name);
            
            return res.json({
                blocked: true,
                reason: 'skip_confirmation',
                punishment: punishment.message,
                required_action: '必须先使用[用户经理-小户]格式确认需求',
                violation_count: violationCount
            });
        }
        
        return res.json({
            blocked: true,
            reason: 'skip_confirmation',
            required_action: '必须先使用[用户经理-小户]格式确认需求',
            violation_count: violationCount
        });
    }
    
    // 检查工具是否被暂停
    if (punishmentSystem.isToolSuspended(tool_name)) {
        return res.json({
            blocked: true,
            reason: 'tool_suspended',
            message: `工具 ${tool_name} 因违规已被暂停使用`
        });
    }
    
    res.json({
        blocked: false,
        message: 'Tool call allowed'
    });
});

// 第2层：AI回复内容检查
app.post('/api/response-check', (req, res) => {
    const { ai_response } = req.body;
    
    const scanResult = scanResponseForViolations(ai_response);
    
    if (scanResult.violation_detected) {
        // 触发惩罚
        const punishment = punishmentSystem.handleViolation(scanResult.violation_type, null);
        
        res.json({
            violation_detected: true,
            violation_type: scanResult.violation_type,
            action: 'block_and_correct',
            corrected_response: scanResult.corrected_response,
            punishment: punishment.message
        });
    } else {
        res.json({
            violation_detected: false,
            message: 'Response is compliant'
        });
    }
});

// 确认接收
app.post('/api/confirmation', (req, res) => {
    const { user_response } = req.body;
    
    const confirmed = confirmationManager.receiveConfirmation(user_response);
    
    res.json({
        confirmed,
        message: confirmed ? '确认已接收' : '未识别为确认'
    });
});

// 版本信息
app.get('/api/l0/version', (req, res) => {
  res.json({
    version: '7.1.0-full',
    buildDate: new Date().toISOString(),
    features: ['semantic-query', 'role-info', 'keywords', '4-layer-violation-prevention']
  });
});

// L0查询接口
app.post('/api/l0/query', async (req, res) => {
  try {
    const { task, roleId } = req.body;

    if (!task) {
      return res.status(400).json({
        success: false,
        error: 'task is required'
      });
    }

    console.log(`[L0 Query] task="${task}", roleId=${roleId || 'none'}`);

    const startTime = Date.now();
    const result = await l0Engine.query(task, roleId || null);
    const queryTime = Date.now() - startTime;

    res.json({
      success: true,
      data: result,
      serverQueryTime: queryTime,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[L0 Query Error]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取角色信息
// [DISABLED] app.get('/api/roles/:roleId', (req, res) => {
// [DISABLED]   const { roleId } = req.params;
// [DISABLED]   
// [DISABLED]   db.get(
// [DISABLED]     `SELECT id, name, person_name, display_name, personality, motto,
// [DISABLED]             LENGTH(prompt_template) as prompt_size
// [DISABLED]      FROM roles WHERE id = ?`,
// [DISABLED]     [roleId],
// [DISABLED]     (err, row) => {
// [DISABLED]       if (err) {
// [DISABLED]         return res.status(500).json({ success: false, error: err.message });
// [DISABLED]       }
// [DISABLED]       if (!row) {
// [DISABLED]         return res.status(404).json({ success: false, error: 'Role not found' });
// [DISABLED]       }
// [DISABLED]       
// [DISABLED]       // 查询角色工具
// [DISABLED]       db.all(
// [DISABLED]         `SELECT tool_name, tool_category, priority 
// [DISABLED]          FROM role_professional_tools 
// [DISABLED]          WHERE role_id = ? 
// [DISABLED]          ORDER BY priority 
// [DISABLED]          LIMIT 10`,
// [DISABLED]         [roleId],
// [DISABLED]         (err2, tools) => {
// [DISABLED]           res.json({
// [DISABLED]             success: true,
// [DISABLED]             data: {
// [DISABLED]               ...row,
// [DISABLED]               tools: tools || []
// [DISABLED]             }
// [DISABLED]           });
// [DISABLED]         }
// [DISABLED]       );
// [DISABLED]     }
// [DISABLED]   );
// [DISABLED] });

// 列出所有角色
app.get('/api/roles', (req, res) => {
  db.all(
    `SELECT id, name, person_name, display_name 
     FROM roles 
     ORDER BY id`,
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      res.json({
        success: true,
        data: rows,
        count: rows.length
      });
    }
  );
});

// 列出所有关键词
app.get('/api/keywords', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  db.all(
    `SELECT primary_keyword, semantic_type, semantic_group, 
            priority, hit_count
     FROM keyword_semantic_index 
     ORDER BY priority, hit_count DESC 
     LIMIT ?`,
    [limit],
    (err, rows) => {
      if (err) {
        return res.status(500).json({ success: false, error: err.message });
      }

      res.json({
        success: true,
        data: rows,
        count: rows.length
      });
    }
  );
});

// 搜索关键词
// [DISABLED] app.get('/api/keywords/search', (req, res) => {
// [DISABLED]   const { q } = req.query;
// [DISABLED]   
// [DISABLED]   if (!q) {
// [DISABLED]     return res.status(400).json({ success: false, error: 'q is required' });
// [DISABLED]   }
// [DISABLED]   
// [DISABLED]   db.all(
// [DISABLED]     `SELECT primary_keyword, semantic_type, semantic_group, priority
// [DISABLED]      FROM keyword_semantic_index 
// [DISABLED]      WHERE primary_keyword LIKE ? OR normalized LIKE ?
// [DISABLED]      ORDER BY priority, hit_count DESC 
// [DISABLED]      LIMIT 20`,
// [DISABLED]     [`%${q}%`, `%${q}%`],
// [DISABLED]     (err, rows) => {
// [DISABLED]       if (err) {
// [DISABLED]         return res.status(500).json({ success: false, error: err.message });
// [DISABLED]       }
// [DISABLED]       
// [DISABLED]       res.json({
// [DISABLED]         success: true,
// [DISABLED]         data: rows,
// [DISABLED]         count: rows.length
// [DISABLED]       });
// [DISABLED]     }
// [DISABLED]   );
// [DISABLED] });

// 获取系统统计
app.get('/api/stats', (req, res) => {
  const stats = {};

  db.get('SELECT COUNT(*) as count FROM roles', (err, r1) => {
    stats.roles = r1?.count || 0;

    db.get('SELECT COUNT(*) as count FROM keyword_semantic_index', (err, r2) => {
      stats.keywords = r2?.count || 0;

      db.get('SELECT COUNT(*) as count FROM skills', (err, r3) => {
        stats.skills = r3?.count || 0;

        db.get('SELECT COUNT(*) as count FROM knowledge', (err, r4) => {
          stats.knowledge = r4?.count || 0;

          res.json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString()
          });
        });
      });
    });
  });
});

// 获取文件（用于自动更新）
app.get('/api/l0/files/:filename', (req, res) => {
  const { filename } = req.params;

  // 安全检查：只允许特定文件
  const allowedFiles = [
    'l0-mcp-server.js',
    'l0-semantic-query-engine.js',
    'liuxin.db',
    'smart-role-loader-with-l0.js',
    'smart-meeting-starter-with-l0.js'
  ];

  if (!allowedFiles.includes(filename)) {
    return res.status(403).json({ success: false, error: 'File not allowed' });
  }

  const fs = require('fs');
  const path = require('path');
  const filePath = path.join(__dirname, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  res.sendFile(filePath);
});



// ========== API增强补丁 (列名已修复) ==========
console.log('[PATCH] 加载API增强补丁...');

// 修复1: 角色详情 - 使用正确的列名
app.get('/api/roles/:roleId', (req, res) => {
  const id = req.params.roleId;
  db.get('SELECT id, name, person_name, display_name FROM roles WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: row });
  });
});

// 修复2: 关键词搜索 - 支持无参数
app.get('/api/keywords/search', (req, res) => {
  const q = req.query.q || '';
  const sql = q ? 'SELECT * FROM keyword_semantic_index WHERE primary_keyword LIKE ? LIMIT 50' : 'SELECT * FROM keyword_semantic_index LIMIT 50';
  const params = q ? ['%' + q + '%'] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0, query: q || 'all' });
  });
});

// 新增1: 系统状态
app.get('/api/status', (req, res) => {
  res.json({ success: true, service: 'L0 MCP', version: '7.1.0', status: 'running', uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString() });
});

// 新增2: API列表
app.get('/api/endpoints', (req, res) => {
  res.json({ success: true, count: 15, server: 'L0 MCP v5.1.0' });
});

// 新增3: 规则
app.get('/api/rules', (req, res) => {
  db.all('SELECT * FROM liuxin_system_rules WHERE status = ? LIMIT 100', ['active'], (err, rows) => {
    if (err && err.message.includes('no such table')) return res.json({ success: true, data: [], count: 0 });
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0 });
  });
});

// 新增4: 违规 - 使用正确的列名 (detected_at改为固定排序)
app.get('/api/violations', (req, res) => {
  db.all('SELECT * FROM dialog_violations ORDER BY detected_at DESC LIMIT 100', (err, rows) => {
    if (err && err.message.includes('no such table')) return res.json({ success: true, data: [], count: 0 });
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0 });
  });
});

// 新增5: 对话
app.get('/api/dialogues', (req, res) => {
  db.all('SELECT * FROM dialog_logs ORDER BY created_at DESC LIMIT 50', (err, rows) => {
    if (err && err.message.includes('no such table')) return res.json({ success: true, data: [], count: 0 });
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0 });
  });
});

// 新增6: 经验
app.get('/api/experiences', (req, res) => {
  db.all('SELECT * FROM experiences ORDER BY created_at DESC LIMIT 50', (err, rows) => {
    if (err && err.message.includes('no such table')) return res.json({ success: true, data: [], count: 0 });
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0 });
  });
});

// 新增7: 技能 - 使用正确的列名 (skill_name改为name)
app.get('/api/skills', (req, res) => {
  db.all('SELECT * FROM skills ORDER BY name LIMIT 100', (err, rows) => {
    if (err && err.message.includes('no such table')) return res.json({ success: true, data: [], count: 0 });
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0 });
  });
});

// 新增8: 修复模板 - 不使用ORDER BY priority
app.get('/api/repair-templates', (req, res) => {
  db.all('SELECT * FROM auto_fixes LIMIT 100', (err, rows) => {
    if (err && err.message.includes('no such table')) return res.json({ success: true, data: [], count: 0 });
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows || [], count: rows ? rows.length : 0 });
  });
});

console.log('[PATCH] ✅ 完整补丁已加载 (列名已修复)');

// POST /api/rules/trigger - 记录规则触发
app.post('/api/rules/trigger', (req, res) => {
  const { rule_code, trigger_keyword, user_message } = req.body;
  db.run(
    'INSERT INTO rule_trigger_realtime (rule_code, trigger_keyword, user_message) VALUES (?, ?, ?)',
    [rule_code, trigger_keyword, user_message],
    (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json({ success: true, message: '规则触发已记录' });
    }
  );
});

// GET /api/rules/trigger-stats - 查询触发统计
app.get('/api/rules/trigger-stats', (req, res) => {
  const limit = req.query.limit || 20;
  db.all(`
    SELECT 
      rule_code,
      COUNT(*) as trigger_count,
      MAX(triggered_at) as last_triggered
    FROM rule_trigger_realtime
    GROUP BY rule_code
    ORDER BY trigger_count DESC
    LIMIT ?
  `, [limit], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows, count: rows.length });
  });
});

// GET /api/rules/execution-log - 查询执行日志
app.get('/api/rules/execution-log', (req, res) => {
  const limit = req.query.limit || 50;
  db.all(`
    SELECT * FROM rule_execution_log
    ORDER BY executed_at DESC
    LIMIT ?
  `, [limit], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, data: rows, count: rows.length });
  });
});

// 场景化规则查询API
app.get('/api/rules/scene/:scene', (req, res) => {
  const { scene } = req.params;

  // 场景规则映射
  const sceneRuleMap = {
    'requirement': ['IR-001', 'USER-MGR-ENHANCE-001', 'IR-004', 'ROLE-001'],
    'development': ['DEV-STANDARD-001', 'DEV-COMPLETE-CHECK-001', 'TEST-001', 'CMD-FORMAT-CHECK-001', 'AUTO-READ-IMPORTANT-001'],
    'design': ['GUI-SELF-CHECK-001', 'IR-004', 'ROLE-001'],
    'testing': ['TEST-001', 'TEST-PROJECT-MEMORY-001', 'DEV-COMPLETE-CHECK-001', 'ROLE-001'],
    'system': ['IR-002', 'SYS-001', 'IR-003', 'CMD-FORMAT-CHECK-001', 'AUTO-READ-IMPORTANT-001', 'VERSION-001'],
    'rules': ['RULE-CONFLICT-CHECK-001', 'SMART-UPGRADE-001', 'IR-200'],
    'general': ['IR-001', 'IR-002', 'SYS-001', 'TEST-001']
  };

  const ruleCodes = sceneRuleMap[scene] || sceneRuleMap['general'];

  if (ruleCodes.length === 0) {
    return res.json({
      success: true,
      scene: scene,
      rules: [],
      count: 0,
      message: `场景"${scene}"暂无相关规则`
    });
  }

  // 构建SQL查询
  const placeholders = ruleCodes.map(() => '?').join(',');
  const sql = `SELECT rule_code, rule_name, rule_content, priority, category 
               FROM liuxin_system_rules 
               WHERE rule_code IN (${placeholders}) 
               ORDER BY priority DESC, rule_code`;

  db.all(sql, ruleCodes, (err, rows) => {
    if (err) {
      console.error(`[场景规则查询] 错误: ${err.message}`);
      return res.status(500).json({
        success: false,
        error: err.message,
        scene: scene
      });
    }

    console.log(`[场景规则查询] 场景"${scene}"查询到${rows.length}条规则`);

    res.json({
      success: true,
      scene: scene,
      rules: rows,
      count: rows.length,
      message: `场景"${scene}"规则加载完成`
    });
  });
});

// 场景列表API
app.get('/api/scenes', (req, res) => {
  const scenes = [
    { name: 'requirement', description: '需求分析', rule_count: 4 },
    { name: 'development', description: '开发实现', rule_count: 5 },
    { name: 'design', description: 'GUI设计', rule_count: 3 },
    { name: 'testing', description: '测试验收', rule_count: 4 },
    { name: 'system', description: '系统操作', rule_count: 6 },
    { name: 'rules', description: '规则管理', rule_count: 3 },
    { name: 'general', description: '通用场景', rule_count: 4 }
  ];

  res.json({
    success: true,
    scenes: scenes,
    count: scenes.length
  });
});

console.log('[场景化API] ✅ 场景化规则查询API已加载');

// MCP工具列表端点 (支持GET和POST)
const toolsList = {
  success: true,
  tools: [
    { name: "liuxin_smart_preloader", description: "团队模式角色分配" },
    { name: "liuxin_scene_analyzer", description: "场景分析" },
    { name: "liuxin_requirement_rules", description: "需求规则" },
    { name: "liuxin_development_rules", description: "开发规则" },
    { name: "liuxin_design_rules", description: "设计规则" },
    { name: "liuxin_testing_rules", description: "测试规则" },
    { name: "liuxin_system_rules", description: "系统规则" },
    { name: "liuxin_rule_management", description: "规则管理" },
    { name: "liuxin_gui_test_enforcer", description: "GUI测试拦截" },
    { name: "liuxin_command_interceptor", description: "命令拦截" },
    { name: "liuxin_code_change_interceptor", description: "代码修改拦截" },
    { name: "liuxin_violation_detector", description: "违规检测" },
    { name: "liuxin_context_loader", description: "上下文加载" },
    { name: "liuxin_experience_predictor", description: "错误预测" },
    { name: "liuxin_experience_recorder", description: "错误记录" },
    { name: "liuxin_experience_retriever", description: "经验检索" }
  ],
  count: 16
};

app.get("/api/tools", (req, res) => {
  res.json(toolsList);
});

app.post("/api/tools", (req, res) => {
  res.json(toolsList);
});

// 团队模式API - 角色分配
app.post('/api/team-mode', (req, res) => {
  try {
    const { user_input } = req.body;
    
    // 简单的场景识别逻辑
    const input = (user_input || '').toLowerCase();
    let role = '开发工程师-小柳'; // 默认角色
    
    if (input.includes('需求') || input.includes('功能') || input.includes('用户')) {
      role = '用户经理-小户';
    } else if (input.includes('界面') || input.includes('设计') || input.includes('html') || input.includes('css')) {
      role = 'GUI设计师-小美';
    } else if (input.includes('测试') || input.includes('验证') || input.includes('bug')) {
      role = '测试与质量经理-小观';
    } else if (input.includes('规划') || input.includes('产品') || input.includes('方案')) {
      role = '产品经理-小品';
    }
    
    res.json({
      success: true,
      assigned_role: role,
      user_input: user_input,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Team Mode Error]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 场景分析API
app.post('/api/scene-analysis', (req, res) => {
  try {
    const { user_message } = req.body;
    
    const msg = (user_message || '').toLowerCase();
    const scenes = [];
    
    if (msg.includes('需求') || msg.includes('功能') || msg.includes('想要')) {
      scenes.push('requirement');
    }
    if (msg.includes('代码') || msg.includes('实现') || msg.includes('修改')) {
      scenes.push('development');
    }
    if (msg.includes('界面') || msg.includes('设计') || msg.includes('html')) {
      scenes.push('design');
    }
    if (msg.includes('测试') || msg.includes('验证') || msg.includes('检查')) {
      scenes.push('testing');
    }
    if (msg.includes('部署') || msg.includes('升级') || msg.includes('系统')) {
      scenes.push('system');
    }
    if (msg.includes('规则') || msg.includes('配置')) {
      scenes.push('rules');
    }
    
    if (scenes.length === 0) {
      scenes.push('general');
    }
    
    res.json({
      success: true,
      scenes: scenes,
      user_message: user_message,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Scene Analysis Error]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 通用数据库查询端点 (POST /api/db/query)
app.post('/api/db/query', (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'query parameter is required'
      });
    }

    console.log(`[DB Query] ${query}`);

    db.all(query, [], (err, rows) => {
      if (err) {
        console.error('[DB Query Error]', err);
        return res.status(500).json({
          success: false,
          error: err.message
        });
      }

      res.json({
        success: true,
        data: rows,
        count: rows.length,
        timestamp: new Date().toISOString()
      });
    });

  } catch (error) {
    console.error('[DB Query Exception]', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 云端规则拦截器API（v1.0）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ruleInterceptor.setupRoutes(app);

// 404处理
app.use((req, res) => {

  res.status(404).json({
    success: false,
    error: 'Not found',
    path: req.path
  });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 启动服务器
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  L0 MCP HTTP Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 服务已启动
📡 监听地址: 0.0.0.0:${PORT}
🌐 本地访问: http://localhost:${PORT}
🌐 外网访问: http://43.142.176.53:${PORT}

API端点:
  - GET  /health                健康检查
  - GET  /api/l0/version        版本信息
  - POST /api/l0/query          L0查询
  - GET  /api/roles             所有角色
  - GET  /api/roles/:id         角色信息
  - GET  /api/keywords          关键词列表
  - GET  /api/keywords/search   搜索关键词
  - GET  /api/stats             系统统计
  - GET  /api/l0/files/:name    文件下载

测试命令:
  curl http://localhost:${PORT}/health
  curl http://localhost:${PORT}/api/stats

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在关闭服务器...');
  l0Engine.close();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...');
  l0Engine.close();
  db.close();
  process.exit(0);
});


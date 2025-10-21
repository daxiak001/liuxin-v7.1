/**
 * MCP服务器监控中间件
 * 集成到云端MCP服务器(8889端口)，自动收集数据发送到监控服务器
 */

const fetch = require('node-fetch');

const MONITOR_SERVER = 'http://43.142.176.53:8890';

class MCPMonitorMiddleware {
  constructor(userId = null) {
    this.userId = userId || this.generateUserId();
    this.monitorEnabled = true;
    this.sessionId = this.generateSessionId();
    
    // 上线通知
    this.reportUserOnline();
  }

  generateUserId() {
    // 基于IP或其他唯一标识生成用户ID
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  generateSessionId() {
    return 'session_' + Date.now();
  }

  // 用户上线
  async reportUserOnline() {
    try {
      await fetch(`${MONITOR_SERVER}/api/monitor/user-online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: this.userId })
      });
    } catch (err) {
      // 静默失败，不影响主服务
    }
  }

  // 记录技能触发
  async recordSkillTrigger(skillId, skillName, success, executionTime) {
    if (!this.monitorEnabled) return;

    try {
      await fetch(`${MONITOR_SERVER}/api/monitor/skill-trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: this.userId,
          skill_id: skillId,
          skill_name: skillName,
          success: success,
          execution_time: executionTime
        }),
        timeout: 3000
      });
    } catch (err) {
      // 静默失败
      console.error('[Monitor] 记录技能触发失败:', err.message);
    }
  }

  // 记录违规
  async recordViolation(ruleId, ruleName, violationType, prevented, context = '') {
    if (!this.monitorEnabled) return;

    try {
      await fetch(`${MONITOR_SERVER}/api/monitor/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: this.userId,
          rule_id: ruleId,
          rule_name: ruleName,
          violation_type: violationType,
          prevented: prevented,
          context: context
        }),
        timeout: 3000
      });
    } catch (err) {
      console.error('[Monitor] 记录违规失败:', err.message);
    }
  }

  // 包装技能执行
  async wrapSkillExecution(skillId, skillName, skillFunction) {
    const startTime = Date.now();
    let success = false;

    try {
      const result = await skillFunction();
      success = true;
      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const executionTime = (Date.now() - startTime) / 1000; // 秒
      this.recordSkillTrigger(skillId, skillName, success, executionTime);
    }
  }

  // 检查违规（在规则检测时调用）
  checkViolation(ruleId, ruleName, violationType, shouldPrevent = true) {
    // 检测逻辑由调用方实现
    // 这里只负责记录
    
    const prevented = shouldPrevent;
    this.recordViolation(ruleId, ruleName, violationType, prevented);
    
    return prevented;
  }
}

// ============================================================
// 集成示例
// ============================================================

/**
 * 在MCP服务器中集成监控的方法：
 * 
 * 1. 在mcp-server.js中引入：
 * 
 * const MCPMonitorMiddleware = require('./monitor-middleware');
 * const monitor = new MCPMonitorMiddleware();
 * 
 * 2. 包装工具调用：
 * 
 * server.setRequestHandler(ListToolsRequestSchema, async () => {
 *   return {
 *     tools: [
 *       {
 *         name: "check_rule",
 *         description: "检查规则",
 *         inputSchema: {...}
 *       }
 *     ]
 *   };
 * });
 * 
 * server.setRequestHandler(CallToolRequestSchema, async (request) => {
 *   const { name, arguments: args } = request.params;
 *   
 *   if (name === "check_rule") {
 *     // 使用monitor包装
 *     return await monitor.wrapSkillExecution(
 *       'SK-001',
 *       '规则ID冲突检测',
 *       async () => {
 *         // 实际的规则检查逻辑
 *         const result = checkRuleConflict(args);
 *         
 *         // 如果检测到违规
 *         if (result.conflict) {
 *           monitor.recordViolation(
 *             'IR-047',
 *             '添加规则前必须检查ID冲突',
 *             'id_conflict',
 *             true, // 已阻止
 *             `尝试添加ID: ${args.ruleId}`
 *           );
 *         }
 *         
 *         return result;
 *       }
 *     );
 *   }
 * });
 * 
 * 3. 在规则检测系统中集成：
 * 
 * // 检测到使用grep代替测试
 * if (userInput.includes('grep') && context.includes('测试')) {
 *   const prevented = monitor.checkViolation(
 *     'IR-045',
 *     '强制真实测试',
 *     'grep_replace_test',
 *     true // 阻止
 *   );
 *   
 *   if (prevented) {
 *     return "❌ 检测到违规：禁止用grep代替测试，请使用run_terminal_cmd";
 *   }
 * }
 */

module.exports = MCPMonitorMiddleware;


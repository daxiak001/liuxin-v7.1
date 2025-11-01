/**
 * GUI真实测试强制执行器
 * 用途: 强制AI必须完成真实测试后才能提交GUI设计
 * 版本: v1.0
 * 日期: 2025-10-19
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库路径（需要根据实际情况调整）
const DB_PATH = process.env.LIUXIN_DB_PATH || '/home/ubuntu/liuxin-system/liuxin_system.db';

/**
 * GUI测试强制执行器工具定义
 */
const guiTestEnforcerTool = {
    name: "liuxin_gui_test_enforcer",
    description: "强制GUI真实测试流程：方案确认 → 真实测试 → 报告提交（三阶段拦截）",

    inputSchema: {
        type: "object",
        properties: {
            action: {
                type: "string",
                enum: ["propose_plan", "record_test", "submit_report", "check_status"],
                description: "操作类型: propose_plan=提交测试方案, record_test=记录测试证据, submit_report=提交报告, check_status=检查状态"
            },
            session_id: {
                type: "string",
                description: "会话ID（必填，用于跟踪测试流程）"
            },
            data: {
                type: "object",
                description: "数据内容（根据action不同而不同）"
            }
        },
        required: ["action", "session_id"]
    }
};

/**
 * 获取数据库连接
 */
function getDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) reject(err);
            else resolve(db);
        });
    });
}

/**
 * 执行数据库查询
 */
function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

/**
 * 执行数据库查询（多行）
 */
function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

/**
 * 执行数据库写入
 */
function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

/**
 * 主处理函数
 */
async function handleGuiTestEnforcer(args) {
    const { action, session_id, data } = args;

    let db;
    try {
        db = await getDb();

        switch (action) {
            case "propose_plan":
                return await handleProposePlan(db, session_id, data);

            case "record_test":
                return await handleRecordTest(db, session_id, data);

            case "submit_report":
                return await handleSubmitReport(db, session_id, data);

            case "check_status":
                return await handleCheckStatus(db, session_id);

            default:
                return {
                    success: false,
                    error: "未知的操作类型: " + action
                };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            stack: error.stack
        };
    } finally {
        if (db) {
            db.close();
        }
    }
}

/**
 * Phase 1: 处理方案提交
 */
async function handleProposePlan(db, session_id, data) {
    // 1. 验证测试方案完整性
    const validation = validateTestPlan(data?.test_plan);
    if (!validation.valid) {
        return {
            success: false,
            blocked: true,
            phase: 1,
            error: "测试方案不完整",
            missing: validation.missing,
            message: "⚠️ 请补充完整的测试方案"
        };
    }

    // 2. 保存测试方案到数据库
    await dbRun(db, `
    INSERT INTO gui_test_records (
      session_id, phase, test_plan, user_confirmed
    ) VALUES (?, ?, ?, ?)
  `, [session_id, 1, JSON.stringify(data.test_plan), 0]);

    // 3. 返回阻塞状态，等待用户确认
    return {
        success: true,
        blocked: true,
        phase: 1,
        message: "⚠️ 测试方案已就绪，等待用户确认后开始真实测试",
        next_action: "等待用户回复'确认'或'修改XXX'",
        test_plan_summary: {
            test_items_count: data.test_plan.test_items?.length || 0,
            tools_count: data.test_plan.tools?.length || 0,
            commands_count: data.test_plan.commands?.length || 0
        }
    };
}

/**
 * Phase 2: 处理测试记录
 */
async function handleRecordTest(db, session_id, data) {
    // 1. 检查Phase 1是否完成
    const phase1 = await dbGet(db, `
    SELECT * FROM gui_test_records 
    WHERE session_id = ? AND phase = 1 
    ORDER BY id DESC LIMIT 1
  `, [session_id]);

    if (!phase1) {
        return {
            success: false,
            blocked: true,
            phase: 2,
            error: "未找到Phase 1记录",
            message: "🚫 请先完成Phase 1: 提交测试方案"
        };
    }

    if (!phase1.user_confirmed) {
        return {
            success: false,
            blocked: true,
            phase: 2,
            error: "用户未确认测试方案",
            message: "🚫 请等待用户确认测试方案"
        };
    }

    // 2. 验证测试证据
    const evidenceValidation = validateEvidence(data?.evidence);
    if (!evidenceValidation.valid) {
        return {
            success: false,
            blocked: true,
            phase: 2,
            error: "测试证据不足",
            current_count: evidenceValidation.count,
            required_count: 3,
            message: `🚫 测试证据不足（当前${evidenceValidation.count}项，需要至少3项）`
        };
    }

    // 3. 保存测试证据
    await dbRun(db, `
    INSERT INTO gui_test_records (
      session_id, phase, test_items, evidence, test_passed
    ) VALUES (?, ?, ?, ?, ?)
  `, [
        session_id,
        2,
        JSON.stringify(data.test_items || []),
        JSON.stringify(data.evidence),
        evidenceValidation.all_passed ? 1 : 0
    ]);

    // 4. 返回非阻塞状态，允许进入Phase 3
    return {
        success: true,
        blocked: false,
        phase: 2,
        message: "✅ 真实测试已完成，可以生成自检报告",
        next_phase: 3,
        evidence_summary: {
            total_count: evidenceValidation.count,
            passed_count: evidenceValidation.passed_count,
            failed_count: evidenceValidation.failed_count
        }
    };
}

/**
 * Phase 3: 处理报告提交
 */
async function handleSubmitReport(db, session_id, data) {
    // 1. 检查Phase 1和2是否完成
    const phases = await dbAll(db, `
    SELECT phase, user_confirmed, test_passed 
    FROM gui_test_records 
    WHERE session_id = ? 
    ORDER BY phase
  `, [session_id]);

    const phase1Complete = phases.some(p => p.phase === 1 && p.user_confirmed === 1);
    const phase2Complete = phases.some(p => p.phase === 2);

    if (!phase1Complete) {
        return {
            success: false,
            blocked: true,
            phase: 3,
            error: "Phase 1未完成",
            message: "🚫 请先完成Phase 1: 提交测试方案并获得用户确认"
        };
    }

    if (!phase2Complete) {
        return {
            success: false,
            blocked: true,
            phase: 3,
            error: "Phase 2未完成",
            message: "🚫 请先完成Phase 2: 执行真实测试并收集证据"
        };
    }

    // 2. 验证报告内容
    const reportValidation = validateReport(data?.report);
    if (!reportValidation.valid) {
        return {
            success: false,
            blocked: true,
            phase: 3,
            error: "报告内容不完整",
            missing: reportValidation.missing,
            message: "🚫 报告缺少必要内容，请补充"
        };
    }

    // 3. 保存报告并标记为已提交
    await dbRun(db, `
    INSERT INTO gui_test_records (
      session_id, phase, report_content, submitted
    ) VALUES (?, ?, ?, ?)
  `, [session_id, 3, data.report.content, 1]);

    // 4. 返回成功，允许提交
    return {
        success: true,
        blocked: false,
        phase: 3,
        message: "✅ 所有阶段已完成，报告可以提交",
        workflow_complete: true,
        summary: {
            phase_1: "✅ 方案已确认",
            phase_2: "✅ 测试已完成",
            phase_3: "✅ 报告已生成"
        }
    };
}

/**
 * 检查当前状态
 */
async function handleCheckStatus(db, session_id) {
    const records = await dbAll(db, `
    SELECT phase, user_confirmed, test_passed, submitted, created_at
    FROM gui_test_records 
    WHERE session_id = ? 
    ORDER BY phase, created_at DESC
  `, [session_id]);

    const status = {
        session_id,
        phases: {
            phase_1: { complete: false, user_confirmed: false },
            phase_2: { complete: false, test_passed: false },
            phase_3: { complete: false, submitted: false }
        },
        current_phase: 0,
        can_proceed: false
    };

    records.forEach(record => {
        if (record.phase === 1) {
            status.phases.phase_1.complete = true;
            status.phases.phase_1.user_confirmed = record.user_confirmed === 1;
            if (record.user_confirmed === 1) {
                status.current_phase = Math.max(status.current_phase, 1);
            }
        } else if (record.phase === 2) {
            status.phases.phase_2.complete = true;
            status.phases.phase_2.test_passed = record.test_passed === 1;
            status.current_phase = Math.max(status.current_phase, 2);
        } else if (record.phase === 3) {
            status.phases.phase_3.complete = true;
            status.phases.phase_3.submitted = record.submitted === 1;
            status.current_phase = Math.max(status.current_phase, 3);
        }
    });

    // 判断是否可以继续
    if (status.current_phase === 1 && status.phases.phase_1.user_confirmed) {
        status.can_proceed = true;
        status.next_action = "执行Phase 2: 真实测试";
    } else if (status.current_phase === 2) {
        status.can_proceed = true;
        status.next_action = "执行Phase 3: 生成报告";
    } else if (status.current_phase === 3) {
        status.can_proceed = true;
        status.next_action = "提交报告给用户";
    } else {
        status.can_proceed = false;
        status.next_action = "等待用户确认测试方案";
    }

    return {
        success: true,
        status
    };
}

/**
 * 验证测试方案完整性
 */
function validateTestPlan(plan) {
    const required = ['test_items', 'tools', 'commands', 'expected_results', 'failure_handling'];
    const missing = [];

    if (!plan) {
        return { valid: false, missing: required };
    }

    required.forEach(field => {
        if (!plan[field] || (Array.isArray(plan[field]) && plan[field].length === 0)) {
            missing.push(field);
        }
    });

    // 检查测试项至少5项
    if (plan.test_items && plan.test_items.length < 5) {
        missing.push('test_items (需要至少5项)');
    }

    return {
        valid: missing.length === 0,
        missing
    };
}

/**
 * 验证测试证据
 */
function validateEvidence(evidence) {
    if (!evidence || !Array.isArray(evidence)) {
        return { valid: false, count: 0, passed_count: 0, failed_count: 0 };
    }

    const passedCount = evidence.filter(e => e.passed === true).length;
    const failedCount = evidence.filter(e => e.passed === false).length;

    return {
        valid: evidence.length >= 3,
        count: evidence.length,
        passed_count: passedCount,
        failed_count: failedCount,
        all_passed: failedCount === 0
    };
}

/**
 * 验证报告内容
 */
function validateReport(report) {
    const required = ['content'];
    const missing = [];

    if (!report) {
        return { valid: false, missing: required };
    }

    required.forEach(field => {
        if (!report[field] || report[field].trim().length === 0) {
            missing.push(field);
        }
    });

    // 检查报告内容是否包含关键证据关键词
    const requiredKeywords = ['命令', '测试', '证据', '验证'];
    const contentLower = (report.content || '').toLowerCase();
    const missingKeywords = requiredKeywords.filter(kw => !contentLower.includes(kw));

    if (missingKeywords.length > 0) {
        missing.push(`关键词缺失: ${missingKeywords.join(', ')}`);
    }

    return {
        valid: missing.length === 0,
        missing
    };
}

module.exports = {
    guiTestEnforcerTool,
    handleGuiTestEnforcer
};



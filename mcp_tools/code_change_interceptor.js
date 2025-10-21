/**
 * 代码修改拦截器 - 防止批量修改无关代码
 * 功能：检查AI的代码修改是否超出当前任务范围
 * 版本：v1.0
 * 作者：开发工程师-小柳
 */

const TOOL_NAME = 'liuxin_code_change_interceptor';

const TOOL_DESCRIPTION = `
代码修改范围拦截器

AI在修改代码（search_replace/write等）前，必须先调用此工具检查修改范围。

参数：
- current_task: 当前任务描述（字符串）
- files_to_change: 计划修改的文件列表（数组）
- change_reason: 修改原因说明（字符串）

返回：
- blocked: true/false（是否拦截）
- safe: true/false（是否安全）
- risk_level: 风险等级（low/medium/high）
- warnings: 警告列表
- allowed_files: 允许修改的文件
`;

/**
 * 分析任务关键词
 */
function extractTaskKeywords(task) {
    const keywords = [];
    
    // 提取文件名关键词
    const fileMatches = task.match(/(\w+)\.(js|ts|json|md|sql)/g);
    if (fileMatches) {
        keywords.push(...fileMatches);
    }
    
    // 提取功能关键词
    const featureMatches = task.match(/(登录|注册|支付|订单|用户|商品|评论|搜索|上传|下载)/g);
    if (featureMatches) {
        keywords.push(...featureMatches);
    }
    
    // 提取技术关键词
    const techMatches = task.match(/(API|数据库|缓存|队列|定时任务|WebSocket|HTTP)/gi);
    if (techMatches) {
        keywords.push(...techMatches.map(k => k.toLowerCase()));
    }
    
    return [...new Set(keywords)];
}

/**
 * 检查文件是否与任务相关
 */
function isFileRelatedToTask(filename, taskKeywords) {
    const filenameLower = filename.toLowerCase();
    
    // 直接匹配
    for (const keyword of taskKeywords) {
        if (filenameLower.includes(keyword.toLowerCase())) {
            return true;
        }
    }
    
    return false;
}

/**
 * 检查修改范围风险
 */
function assessChangeRisk(filesToChange, taskKeywords) {
    const related = [];
    const unrelated = [];
    
    for (const file of filesToChange) {
        if (isFileRelatedToTask(file, taskKeywords)) {
            related.push(file);
        } else {
            unrelated.push(file);
        }
    }
    
    // 风险评估
    let riskLevel = 'low';
    const warnings = [];
    
    if (unrelated.length > 0) {
        riskLevel = 'medium';
        warnings.push({
            code: 'CODE-CHANGE-001',
            message: `检测到${unrelated.length}个可能无关的文件修改`,
            files: unrelated
        });
    }
    
    if (unrelated.length > 5) {
        riskLevel = 'high';
        warnings.push({
            code: 'CODE-CHANGE-002',
            message: '批量修改风险！超过5个无关文件',
            risk: '可能误改正常代码'
        });
    }
    
    if (filesToChange.length > 10) {
        warnings.push({
            code: 'CODE-CHANGE-003',
            message: '修改文件数量过多',
            count: filesToChange.length,
            suggestion: '建议分批修改'
        });
    }
    
    return { related, unrelated, riskLevel, warnings };
}

/**
 * 主拦截函数
 */
function interceptCodeChange(params) {
    const { current_task, files_to_change, change_reason } = params;
    
    if (!current_task || !files_to_change || files_to_change.length === 0) {
        return {
            success: false,
            blocked: true,
            error: '缺少必要参数：current_task或files_to_change'
        };
    }
    
    // 提取任务关键词
    const taskKeywords = extractTaskKeywords(current_task);
    
    // 评估修改风险
    const risk = assessChangeRisk(files_to_change, taskKeywords);
    
    // 判断是否拦截
    let blocked = false;
    let blockReason = '';
    
    if (risk.riskLevel === 'high') {
        blocked = true;
        blockReason = '高风险：批量修改无关代码';
    }
    
    if (risk.unrelated.length > 5) {
        blocked = true;
        blockReason = `修改${risk.unrelated.length}个无关文件，超过安全阈值（5个）`;
    }
    
    if (blocked) {
        return {
            success: false,
            blocked: true,
            risk_level: risk.riskLevel,
            message: `🚫 代码修改被拦截！${blockReason}`,
            details: {
                current_task: current_task,
                total_files: files_to_change.length,
                related_files: risk.related,
                unrelated_files: risk.unrelated,
                task_keywords: taskKeywords,
                warnings: risk.warnings
            },
            suggestion: {
                action: '请只修改相关文件',
                allowed_files: risk.related,
                blocked_files: risk.unrelated
            }
        };
    }
    
    // 通过检查
    return {
        success: true,
        blocked: false,
        safe: true,
        risk_level: risk.riskLevel,
        message: `✅ 代码修改检查通过${risk.warnings.length > 0 ? `（有${risk.warnings.length}个警告）` : ''}`,
        details: {
            current_task: current_task,
            files_to_change: files_to_change,
            related_files: risk.related,
            unrelated_files: risk.unrelated,
            warnings: risk.warnings
        }
    };
}

module.exports = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    inputSchema: {
        type: 'object',
        properties: {
            current_task: {
                type: 'string',
                description: '当前任务描述（例如：修复登录功能bug）'
            },
            files_to_change: {
                type: 'array',
                items: { type: 'string' },
                description: '计划修改的文件列表'
            },
            change_reason: {
                type: 'string',
                description: '修改原因说明'
            }
        },
        required: ['current_task', 'files_to_change']
    },
    handler: interceptCodeChange
};


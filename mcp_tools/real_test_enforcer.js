/**
 * 真实测试强制拦截器
 * 用于拦截所有测试任务，强制执行真实测试流程
 */

class RealTestEnforcer {
    static detect(userInput, toolName, toolArgs) {
        // 检测测试关键词
        const testKeywords = [
            '测试', 'test', '验证', '检查功能', 
            '运行测试', 'comprehensive', 'integration',
            '单元测试', 'unit test', '集成测试'
        ];
        
        const input = (userInput || '').toLowerCase();
        const hasTestKeyword = testKeywords.some(k => input.includes(k));
        
        // 检测是否在创建测试脚本
        const isCreatingTestScript = 
            toolName === 'write' && toolArgs && (
                (toolArgs.file_path && toolArgs.file_path.includes('test')) || 
                (toolArgs.contents && toolArgs.contents.includes('test'))
            );
        
        // 检测是否在运行测试命令
        const isRunningTest = 
            toolName === 'run_terminal_cmd' && toolArgs &&
            toolArgs.command && (
                toolArgs.command.includes('test') ||
                toolArgs.command.includes('node') && toolArgs.command.includes('.js')
            );
        
        if (hasTestKeyword && (isCreatingTestScript || isRunningTest)) {
            return {
                blocked: true,
                reason: '检测到测试任务，必须执行真实测试流程',
                required_process: 'three_stage_real_test',
                keyword_detected: testKeywords.find(k => input.includes(k))
            };
        }
        
        return { blocked: false };
    }
    
    static enforceStage1(testPlan) {
        return {
            stage: 1,
            stage_name: '提交测试方案',
            message: '[测试与质量经理-小观] 测试方案：',
            testPlan: testPlan,
            waitingForConfirmation: true,
            nextAction: '请用户确认：回复"开始测试"继续',
            instructions: [
                '1. 审查测试方案是否完整',
                '2. 确认测试范围',
                '3. 准备测试环境',
                '4. 回复"开始测试"进入阶段2'
            ]
        };
    }
    
    static enforceStage2(testItem, itemNumber, totalItems) {
        return {
            stage: 2,
            stage_name: '手动执行测试',
            message: `[测试与质量经理-小观] 执行测试 ${itemNumber}/${totalItems}`,
            testItem: testItem,
            steps: [
                '1. 手动打开工具（Postman/浏览器/终端）',
                '2. 手动输入请求参数或命令',
                '3. 手动执行操作',
                '4. 观察真实结果',
                '5. 截图或复制输出保存证据'
            ],
            evidenceRequired: true,
            evidenceTypes: ['截图路径', '操作日志', 'JSON结果'],
            nextAction: '完成后提供证据（截图/日志/JSON）',
            warning: '⚠️ 必须提供真实证据，不接受想象或理论结果'
        };
    }
    
    static enforceStage3(results) {
        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;
        
        return {
            stage: 3,
            stage_name: '生成自检报告',
            message: '[测试与质量经理-小观] 生成自检报告',
            report: {
                totalTests: results.length,
                passed: passed,
                failed: failed,
                passRate: Math.round(passed / results.length * 100) + '%',
                evidence: results.map(r => ({
                    testItem: r.testItem,
                    result: r.passed ? '✅ 通过' : '❌ 失败',
                    evidence: r.evidencePath || r.evidenceData
                }))
            },
            waitingForValidation: true,
            nextAction: '请用户验证报告是否真实',
            validation_questions: [
                '1. 证据是否真实？',
                '2. 测试过程是否手动执行？',
                '3. 结果是否可复现？'
            ]
        };
    }
    
    static validateEvidence(evidence) {
        if (!evidence) {
            return {
                valid: false,
                reason: '未提供证据'
            };
        }
        
        // 检查是否是文件路径
        const isFilePath = typeof evidence === 'string' && 
            (evidence.includes('.png') || evidence.includes('.jpg') || 
             evidence.includes('.json') || evidence.includes('.txt'));
        
        // 检查是否是JSON数据
        const isJSON = typeof evidence === 'object' || 
            (typeof evidence === 'string' && evidence.startsWith('{'));
        
        if (isFilePath || isJSON) {
            return {
                valid: true,
                type: isFilePath ? 'file' : 'json'
            };
        }
        
        return {
            valid: false,
            reason: '证据格式不正确，需要截图路径或JSON结果'
        };
    }
}

module.exports = RealTestEnforcer;

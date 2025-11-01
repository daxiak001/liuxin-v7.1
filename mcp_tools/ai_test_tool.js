const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * AI测试工具类
 * 负责执行AI验收测试框架，集成11种测试策略
 */
class AITestTool {
  constructor(db) {
    this.db = db;
    this.testFrameworkPath = path.join(__dirname, '..', '..', 'tests', 'ai-acceptance');

    // 初始化增强版组件
    this.initEnhancedComponents();
  }

  /**
   * 初始化增强版证据收集器和结果验证器
   */
  initEnhancedComponents() {
    try {
      const evidenceCollectorPath = path.join(this.testFrameworkPath, 'tools', 'evidence_collector.js');
      const resultValidatorPath = path.join(this.testFrameworkPath, 'tools', 'result_validator.js');

      // 加载增强版证据收集器
      if (fs.existsSync(evidenceCollectorPath)) {
        const EvidenceCollector = require(evidenceCollectorPath);
        this.evidenceCollector = new EvidenceCollector({
          baseDir: path.join(this.testFrameworkPath, 'evidence'),
          enableScreenshots: true,
          enableLogs: true,
          enableReports: true,
          enablePerformance: true,
          enableNetwork: true
        });
        console.log('[AITestTool] ✅ 增强版证据收集器已初始化');
      }

      // 加载增强版结果验证器
      if (fs.existsSync(resultValidatorPath)) {
        const ResultValidator = require(resultValidatorPath);
        this.resultValidator = new ResultValidator(this.db, {
          strictMode: false,  // 宽松模式，适合日常开发
          minPassRate: 0.8,
          requireEvidence: true,
          performanceThresholds: {
            response_time_ms: 2000,
            error_rate: 0.05,
            memory_mb: 1024
          }
        });
        console.log('[AITestTool] ✅ 增强版结果验证器已初始化');
      }
    } catch (error) {
      console.warn('[AITestTool] ⚠️ 增强版组件初始化失败:', error.message);
      console.warn('[AITestTool] 将使用基础版证据收集和验证');
    }
  }

  /**
   * 识别测试场景
   */
  async identifyScenario(input) {
    const { changed_files = [], risk_level, custom_strategies } = input;

    // 分析文件类型
    const fileAnalysis = this.analyzeFileTypes(changed_files);

    // 匹配规则
    const matchedRules = await this.matchRules(fileAnalysis, risk_level);

    return {
      scenario: this.determineScenario(input.scenario, fileAnalysis),
      risk_level: risk_level || this.assessRisk(fileAnalysis),
      affected_modules: this.identifyModules(fileAnalysis),
      recommended_strategies: custom_strategies || this.selectStrategies(matchedRules, fileAnalysis)
    };
  }

  /**
   * 分析文件类型
   */
  analyzeFileTypes(files) {
    return {
      has_backend: files.some(f => f.match(/\.(js|ts)$/) && !f.includes('test')),
      has_frontend: files.some(f => f.match(/\.(vue|jsx|tsx)$/)),
      has_api: files.some(f => f.includes('api') || f.includes('route')),
      has_database: files.some(f => f.includes('model') || f.includes('schema') || f.match(/\.sql$/)),
      has_config: files.some(f => f.match(/\.(json|yaml|yml|env)$/)),
      has_security: files.some(f => f.includes('auth') || f.includes('security')),
      file_count: files.length
    };
  }

  /**
   * 匹配测试规则
   */
  matchRules(fileAnalysis, riskLevel) {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM ai_test_rules 
        WHERE enabled = 1 
        AND (
          trigger_on_risk_level IS NULL 
          OR trigger_on_risk_level LIKE ?
        )
        ORDER BY priority DESC
      `;

      this.db.all(sql, [`%${riskLevel}%`], (err, rules) => {
        if (err) reject(err);
        else resolve(rules);
      });
    });
  }

  /**
   * 确定测试场景
   */
  determineScenario(userScenario, fileAnalysis) {
    if (userScenario) return userScenario;

    if (fileAnalysis.has_security) return 'security_check';
    if (fileAnalysis.has_api) return 'code_change';
    if (fileAnalysis.has_database) return 'code_change';
    return 'code_change';
  }

  /**
   * 评估风险等级
   */
  assessRisk(fileAnalysis) {
    let score = 0;

    if (fileAnalysis.has_database) score += 30;
    if (fileAnalysis.has_security) score += 40;
    if (fileAnalysis.has_api) score += 20;
    if (fileAnalysis.file_count > 10) score += 15;

    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * 识别影响的模块
   */
  identifyModules(fileAnalysis) {
    const modules = [];
    if (fileAnalysis.has_api) modules.push('api');
    if (fileAnalysis.has_database) modules.push('database');
    if (fileAnalysis.has_security) modules.push('auth');
    if (fileAnalysis.has_frontend) modules.push('frontend');
    return modules;
  }

  /**
   * 选择测试策略
   */
  selectStrategies(rules, fileAnalysis) {
    const strategies = new Set();

    // 从规则中提取策略
    rules.forEach(rule => {
      const required = JSON.parse(rule.required_strategies || '[]');
      required.forEach(s => strategies.add(s));
    });

    // 如果没有策略，根据文件类型选择
    if (strategies.size === 0) {
      strategies.add('api-contract');
      if (fileAnalysis.has_frontend) strategies.add('e2e-web');
      if (fileAnalysis.has_security) strategies.add('security');
    }

    return Array.from(strategies);
  }

  /**
   * 执行测试 - 主入口
   */
  async executeTest(input) {
    const testId = this.generateTestId();
    const startTime = Date.now();

    try {
      // 1. 场景识别
      const sceneData = await this.identifyScenario(input);

      console.log(`[AITestTool] 测试ID: ${testId}`);
      console.log(`[AITestTool] 场景: ${sceneData.scenario}, 风险: ${sceneData.risk_level}`);
      console.log(`[AITestTool] 策略: ${sceneData.recommended_strategies.join(', ')}`);

      // 2. 构建运行配置
      const runConfig = {
        input: {
          touches: sceneData.affected_modules,
          risk: sceneData.risk_level,
          changed_files: input.changed_files
        }
      };

      // 3. 执行min_executor
      const result = await this.runMinExecutor(runConfig);

      // 4. 收集证据
      const evidence = await this.collectEvidence(result);

      // 5. 验证结果
      const validation = this.validateResults(result, evidence);

      // 6. 记录历史
      await this.recordHistory({
        test_id: testId,
        scenario: sceneData.scenario,
        risk_level: sceneData.risk_level,
        changed_files: JSON.stringify(input.changed_files || []),
        affected_modules: JSON.stringify(sceneData.affected_modules),
        strategies_executed: JSON.stringify(sceneData.recommended_strategies),
        execution_time_ms: Date.now() - startTime,
        success: validation.success ? 1 : 0,
        pass_rate: validation.pass_rate,
        total_tests: validation.total_tests,
        passed_tests: validation.passed_tests,
        failed_tests: validation.failed_tests,
        evidence_paths: JSON.stringify(evidence),
        issues_found: JSON.stringify(validation.issues || []),
        executed_by: input.executed_by || 'AI'
      });

      // 7. 返回结果
      return this.formatResponse(testId, sceneData, result, evidence, validation);

    } catch (error) {
      console.error('[AITestTool] 执行失败:', error);
      return {
        success: false,
        test_id: testId,
        error: error.message,
        execution_time_ms: Date.now() - startTime
      };
    }
  }

  /**
   * 运行min_executor
   */
  runMinExecutor(runConfig) {
    return new Promise((resolve, reject) => {
      const executor = path.join(this.testFrameworkPath, 'tools', 'min_executor.js');
      const configPath = path.join(this.testFrameworkPath, 'run_config.json');

      // 写入配置文件
      fs.writeFileSync(configPath, JSON.stringify(runConfig, null, 2));

      console.log(`[AITestTool] 执行: node ${executor}`);

      const child = spawn('node', [executor], {
        cwd: path.dirname(executor),
        env: process.env
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log(`[MinExecutor] ${data.toString().trim()}`);
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
        console.error(`[MinExecutor] 错误: ${data.toString().trim()}`);
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            success: true,
            stdout,
            stderr,
            exit_code: code
          });
        } else {
          reject(new Error(`MinExecutor退出码: ${code}\n${stderr}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });
  }

  /**
   * 收集证据（增强版）
   */
  async collectEvidence(result) {
    // 如果有增强版证据收集器，使用它
    if (this.evidenceCollector) {
      try {
        const evidenceResult = await this.evidenceCollector.collect({
          test_id: result.test_id || this.generateTestId(),
          screenshots: result.screenshots || [],
          logs: result.logs || [],
          reports: result.reports || [],
          performance: result.performance || null,
          network: result.network || null,
          errors: result.errors || []
        });

        if (evidenceResult.success) {
          console.log('[AITestTool] ✅ 使用增强版证据收集器完成');
          return evidenceResult.evidence;
        }
      } catch (error) {
        console.warn('[AITestTool] 增强版证据收集失败，使用基础版:', error.message);
      }
    }

    // 降级到基础版证据收集
    const reportsDir = path.join(this.testFrameworkPath, 'reports');
    const evidence = {
      screenshots: [],
      logs: [],
      reports: []
    };

    try {
      if (fs.existsSync(reportsDir)) {
        const files = fs.readdirSync(reportsDir);

        files.forEach(file => {
          const fullPath = path.join(reportsDir, file);
          if (file.endsWith('.png')) {
            evidence.screenshots.push({ path: fullPath });
          } else if (file.endsWith('.log') || file.endsWith('.txt')) {
            evidence.logs.push({ path: fullPath });
          } else if (file.endsWith('.json')) {
            evidence.reports.push({ path: fullPath });
          }
        });
      }
    } catch (error) {
      console.error('[AITestTool] 收集证据失败:', error);
    }

    return evidence;
  }

  /**
   * 验证结果（增强版）
   */
  async validateResults(result, evidence) {
    // 如果有增强版结果验证器，使用它
    if (this.resultValidator) {
      try {
        const validation = await this.resultValidator.validate(result, evidence);
        console.log('[AITestTool] ✅ 使用增强版结果验证器完成');

        // 转换为兼容格式
        return {
          success: validation.overall_pass,
          pass_rate: validation.score / 100,
          total_tests: 1,
          passed_tests: validation.overall_pass ? 1 : 0,
          failed_tests: validation.overall_pass ? 0 : 1,
          has_evidence: validation.evidence_complete,
          issues: validation.issues,
          warnings: validation.warnings,
          recommendations: validation.recommendations,
          score: validation.score
        };
      } catch (error) {
        console.warn('[AITestTool] 增强版结果验证失败，使用基础版:', error.message);
      }
    }

    // 降级到基础版验证
    const hasReports = evidence.reports && evidence.reports.length > 0;
    const hasEvidence = (evidence.screenshots && evidence.screenshots.length > 0) || (evidence.logs && evidence.logs.length > 0);

    return {
      success: result.success && hasReports,
      pass_rate: hasReports ? 1.0 : 0.0,
      total_tests: 1,
      passed_tests: result.success ? 1 : 0,
      failed_tests: result.success ? 0 : 1,
      has_evidence: hasEvidence,
      issues: []
    };
  }

  /**
   * 记录测试历史
   */
  recordHistory(data) {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO ai_test_history (
          test_id, scenario, risk_level, changed_files, affected_modules,
          strategies_executed, execution_time_ms, success, pass_rate,
          total_tests, passed_tests, failed_tests, evidence_paths,
          issues_found, executed_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      this.db.run(sql, [
        data.test_id, data.scenario, data.risk_level, data.changed_files,
        data.affected_modules, data.strategies_executed, data.execution_time_ms,
        data.success, data.pass_rate, data.total_tests, data.passed_tests,
        data.failed_tests, data.evidence_paths, data.issues_found, data.executed_by
      ], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * 格式化响应
   */
  formatResponse(testId, sceneData, result, evidence, validation) {
    return {
      success: validation.success,
      test_id: testId,
      scenario: sceneData.scenario,
      risk_level: sceneData.risk_level,
      strategies_executed: sceneData.recommended_strategies,
      pass_rate: validation.pass_rate,
      evidence_paths: evidence,
      issues_found: validation.issues,
      execution_time_ms: result.execution_time_ms,
      next_steps: this.generateNextSteps(validation)
    };
  }

  /**
   * 生成测试ID
   */
  generateTestId() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substr(2, 6);
    return `test_${timestamp}_${random}`;
  }

  /**
   * 生成下一步建议
   */
  generateNextSteps(validation) {
    const steps = [];

    if (validation.success) {
      steps.push('✅ 测试通过，可以继续开发');
      if (validation.pass_rate < 1.0) {
        steps.push('⚠️ 部分测试未通过，建议review失败项');
      }
    } else {
      steps.push('❌ 测试失败，请查看详细报告');
      steps.push('🔧 建议使用 mcp_ai_debug 工具分析失败原因');
    }

    return steps;
  }

  /**
   * 调试测试失败
   */
  async debugTest(params) {
    const { test_id, failure_category, enable_deep_analysis = true } = params;

    try {
      // 查询测试历史
      const history = await this.getTestHistory(test_id);

      if (!history) {
        return {
          success: false,
          error: `测试ID ${test_id} 不存在`
        };
      }

      // 分析失败原因
      const analysis = await this.analyzeFailure(history, failure_category, enable_deep_analysis);

      return {
        success: true,
        test_id,
        analysis,
        suggestions: this.generateFixSuggestions(analysis)
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取测试历史
   */
  getTestHistory(testId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM ai_test_history WHERE test_id = ?',
        [testId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  /**
   * 分析失败原因
   */
  async analyzeFailure(history, category, deepAnalysis) {
    const analysis = {
      test_id: history.test_id,
      scenario: history.scenario,
      risk_level: history.risk_level,
      failure_summary: {
        total_tests: history.total_tests,
        failed_tests: history.failed_tests,
        pass_rate: history.pass_rate
      },
      issues: JSON.parse(history.issues_found || '[]'),
      category: category || 'unknown'
    };

    if (deepAnalysis) {
      // 深度分析：读取报告文件
      const evidencePaths = JSON.parse(history.evidence_paths || '{}');
      analysis.evidence_analysis = await this.analyzeEvidence(evidencePaths);
    }

    return analysis;
  }

  /**
   * 分析证据
   */
  async analyzeEvidence(evidencePaths) {
    const analysis = {
      reports_found: evidencePaths.reports?.length || 0,
      logs_found: evidencePaths.logs?.length || 0,
      screenshots_found: evidencePaths.screenshots?.length || 0
    };

    // 可以进一步分析报告内容
    // 这里简化处理

    return analysis;
  }

  /**
   * 生成修复建议
   */
  generateFixSuggestions(analysis) {
    const suggestions = [];

    if (analysis.failure_summary.pass_rate < 0.5) {
      suggestions.push({
        priority: 'high',
        suggestion: '测试通过率过低，建议全面review代码变更'
      });
    }

    if (analysis.issues.length > 0) {
      suggestions.push({
        priority: 'high',
        suggestion: `发现 ${analysis.issues.length} 个问题，建议逐一修复`
      });
    }

    suggestions.push({
      priority: 'medium',
      suggestion: '查看详细测试报告获取更多信息'
    });

    return suggestions;
  }
}

module.exports = AITestTool;










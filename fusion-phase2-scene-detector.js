/**
 * 融合方案 Phase 2.1: 场景识别器
 * 版本: v7.5.0
 * 
 * 功能：
 * 1. 识别对话/开发/调试/规划/测试场景
 * 2. 返回推荐的加载层级
 * 3. 区分目录加载和详情加载
 */

class SceneDetector {
    constructor() {
        // 场景关键词定义
        this.sceneKeywords = {
            dialogue: {
                keywords: /介绍|说明|解释|什么是|有哪些|列出|查看|显示/i,
                description: '对话场景',
                loadStrategy: 'catalog_only'  // 仅加载目录
            },
            develop: {
                keywords: /开发|实现|创建|修改|添加功能|写代码|编写|构建/i,
                description: '开发场景',
                loadStrategy: 'on_demand'  // 按需加载详情
            },
            debug: {
                keywords: /错误|问题|失败|不工作|修复|bug|调试|排查|失效|异常|报错|崩溃/i,
                description: '调试场景',
                loadStrategy: 'detail_required',  // 需要详情
                priority: 'high'  // 高优先级
            },
            plan: {
                keywords: /计划|设计|架构|方案|评估|规划|讨论/i,
                description: '规划场景',
                loadStrategy: 'catalog_only'
            },
            test: {
                keywords: /测试|验证|检查|质量|评测/i,
                description: '测试场景',
                loadStrategy: 'detail_required'
            }
        };

        // 详情需求关键词
        this.detailKeywords = {
            api_usage: /调用|使用|如何用|怎么用.*API|API.*用法/i,
            tool_usage: /.*工具.*怎么用|使用方法|工具.*用法/i,
            experience_detail: /这个问题.*怎么解决|历史.*解决方案|之前.*怎么.*的/i,
            code_example: /示例|例子|怎么写|代码.*写法/i,
            table_structure: /表结构|字段|数据库.*结构/i
        };
    }

    /**
     * 检测场景类型
     * 优先级: 调试 > 开发 > 测试 > 规划 > 对话
     */
    detectScene(userInput) {
        if (!userInput || typeof userInput !== 'string') {
            return this.getDefaultScene();
        }

        const input = userInput.toLowerCase();

        // 按优先级检测（调试场景优先级最高）
        if (this.sceneKeywords.debug.keywords.test(input)) {
            return {
                scene: 'debug',
                description: this.sceneKeywords.debug.description,
                loadStrategy: this.sceneKeywords.debug.loadStrategy,
                priority: 'high',
                recommendedLayers: [1, 4, 6, 7],  // P0角色, P1上下文, P2经验, P2技术债务
                loadDetail: true
            };
        }

        // 开发场景
        if (this.sceneKeywords.develop.keywords.test(input)) {
            return {
                scene: 'develop',
                description: this.sceneKeywords.develop.description,
                loadStrategy: this.sceneKeywords.develop.loadStrategy,
                priority: 'medium',
                recommendedLayers: [1, 2, 3, 5],  // P0角色+技能+项目, P1规则
                loadDetail: this.needDetailInDevelop(input)
            };
        }

        // 测试场景
        if (this.sceneKeywords.test.keywords.test(input)) {
            return {
                scene: 'test',
                description: this.sceneKeywords.test.description,
                loadStrategy: this.sceneKeywords.test.loadStrategy,
                priority: 'medium',
                recommendedLayers: [1, 5, 6],  // P0角色, P1规则, P2经验
                loadDetail: true
            };
        }

        // 规划场景
        if (this.sceneKeywords.plan.keywords.test(input)) {
            return {
                scene: 'plan',
                description: this.sceneKeywords.plan.description,
                loadStrategy: this.sceneKeywords.plan.loadStrategy,
                priority: 'low',
                recommendedLayers: [1, 3, 9],  // P0角色, P1项目, P1功能清单
                loadDetail: false
            };
        }

        // 对话场景（默认）
        return {
            scene: 'dialogue',
            description: this.sceneKeywords.dialogue.description,
            loadStrategy: this.sceneKeywords.dialogue.loadStrategy,
            priority: 'low',
            recommendedLayers: [1, 4, 5, 9],  // P0角色, P1上下文, P1规则, P1功能清单
            loadDetail: false
        };
    }

    /**
     * 检测开发场景是否需要详情
     */
    needDetailInDevelop(input) {
        for (const [type, pattern] of Object.entries(this.detailKeywords)) {
            if (pattern.test(input)) {
                return {
                    needed: true,
                    type: type,
                    reason: this.getDetailReason(type)
                };
            }
        }
        return false;
    }

    /**
     * 检测是否需要加载详情
     */
    detectDetailLoadNeeded(userInput) {
        if (!userInput || typeof userInput !== 'string') {
            return { need_detail: false };
        }

        for (const [type, pattern] of Object.entries(this.detailKeywords)) {
            if (pattern.test(userInput)) {
                return {
                    need_detail: true,
                    type: type,
                    priority: 'P1',  // 立即加载
                    reason: this.getDetailReason(type)
                };
            }
        }

        return { need_detail: false };
    }

    /**
     * 获取详情需求原因
     */
    getDetailReason(type) {
        const reasons = {
            api_usage: '用户询问API使用方法',
            tool_usage: '用户询问工具使用方法',
            experience_detail: '用户需要历史解决方案',
            code_example: '用户需要代码示例',
            table_structure: '用户需要数据库表结构'
        };
        return reasons[type] || '用户需要详细信息';
    }

    /**
     * 获取默认场景
     */
    getDefaultScene() {
        return {
            scene: 'dialogue',
            description: '对话场景',
            loadStrategy: 'catalog_only',
            priority: 'low',
            recommendedLayers: [1, 4, 5, 9],
            loadDetail: false
        };
    }

    /**
     * 生成场景报告
     */
    generateSceneReport(sceneInfo) {
        let report = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 场景识别报告
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 场景类型: ${sceneInfo.description} (${sceneInfo.scene})
📋 加载策略: ${sceneInfo.loadStrategy}
⭐ 优先级: ${sceneInfo.priority}
📊 推荐层级: ${sceneInfo.recommendedLayers.join(', ')}
📖 加载详情: ${sceneInfo.loadDetail ? '是' : '否'}
`;

        if (sceneInfo.loadDetail && sceneInfo.loadDetail.type) {
            report += `\n💡 详情类型: ${sceneInfo.loadDetail.type}`;
            report += `\n📝 原因: ${sceneInfo.loadDetail.reason}`;
        }

        report += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

        return report;
    }
}

// ============================================================
// 测试代码
// ============================================================
if (require.main === module) {
    const detector = new SceneDetector();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 场景识别器测试');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const testCases = [
        '系统有哪些统计功能？',
        '我要开发一个登录功能',
        'MCP拦截器失效了，怎么修复？',
        '如何调用经验API？',
        '设计一个新的数据库架构',
        '测试规则触发功能'
    ];

    testCases.forEach((input, index) => {
        console.log(`\n测试案例 ${index + 1}: "${input}"`);
        const result = detector.detectScene(input);
        console.log(detector.generateSceneReport(result));
    });

    console.log('✅ 场景识别器测试完成！\n');
}

module.exports = SceneDetector;



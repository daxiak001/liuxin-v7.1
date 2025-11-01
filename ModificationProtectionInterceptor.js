/**
 * 🛡️ 修改防护拦截器
 * 集成到MCP工具调用链，自动拦截越界修改
 */

const { getInstance } = require('./ModificationProtectionSystem');

class ModificationProtectionInterceptor {
    constructor() {
        this.protectionSystem = getInstance();
        console.error('🛡️ [ProtectionInterceptor] 修改防护拦截器已初始化');
    }

    /**
     * 拦截工具调用，检查是否为文件修改操作
     * @param {string} toolName - 工具名称
     * @param {object} args - 工具参数
     * @returns {object} { blocked: boolean, message: string }
     */
    intercept(toolName, args) {
        // 识别文件修改操作
        const modificationTools = [
            'mcp_write',
            'write',
            'mcp_search_replace',
            'search_replace',
            'mcp_delete_file',
            'delete_file'
        ];

        if (!modificationTools.includes(toolName)) {
            // 不是文件修改操作，放行
            return { blocked: false };
        }

        // 提取文件路径
        const filePath = args.file_path || args.target_file;
        if (!filePath) {
            return { blocked: false };
        }

        // 检查修改是否允许
        const operationType = toolName.includes('delete') ? 'delete' :
            toolName.includes('search_replace') ? 'search_replace' : 'write';

        const result = this.protectionSystem.checkModification(filePath, operationType);

        if (!result.allowed) {
            // 🚨 越界修改，阻止操作
            return {
                blocked: true,
                message: result.message,
                feedback: this.generateFeedback(filePath, operationType),
                violation: result.violation
            };
        }

        return { blocked: false };
    }

    /**
     * 生成反馈消息
     */
    generateFeedback(filePath, operation) {
        const fileName = require('path').basename(filePath);

        return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚨 修改防护系统：检测到越界修改
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  您尝试修改的文件不在当前任务范围内

📁 文件：${fileName}
🔧 操作：${operation}

🚫 禁止的行为：
   - 修复A功能时顺便修改B功能
   - 发现其他问题时擅自修改
   - 超出任务范围的代码优化

✅ 正确的做法：
   1. 停止当前操作
   2. 只修改任务明确指定的文件
   3. 如果发现其他问题：
      → 先完成当前任务
      → 报告其他问题
      → 询问用户是否修复
      → 获得授权后再改

💬 请向用户说明：
   "检测到${fileName}需要修改，但这不在当前任务范围内。
    是否需要将其加入修改范围？"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    }
}

module.exports = ModificationProtectionInterceptor;


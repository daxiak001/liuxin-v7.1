/**
 * 命令执行拦截器 - MCP强制检查工具
 * 功能：在AI执行命令前强制检查，不符合规则则拦截
 * 版本：v1.0
 * 作者：开发工程师-小柳
 */

const TOOL_NAME = 'liuxin_command_interceptor';

const TOOL_DESCRIPTION = `
命令执行前强制检查工具

AI在执行run_terminal_cmd之前，必须先调用此工具检查命令是否安全。

参数：
- command: 要执行的命令（字符串）

返回：
- blocked: true/false（是否拦截）
- safe: true/false（是否安全）
- errors: 错误列表
- warnings: 警告列表
- fixed_command: 修复后的命令（如果可自动修复）
`;

/**
 * 检查SSH/SCP命令
 */
function checkSSHCommand(command) {
    const errors = [];
    const warnings = [];
    let fixed = command;

    // 检查1：是否包含超时设置
    if (!command.includes('ConnectTimeout')) {
        errors.push({
            code: 'SSH-001',
            message: 'SSH/SCP命令必须设置ConnectTimeout',
            required: '-o ConnectTimeout=30'
        });
        fixed += ' -o ConnectTimeout=30';
    }

    // 检查2：是否禁用交互模式
    if (!command.includes('BatchMode=yes')) {
        errors.push({
            code: 'SSH-002',
            message: 'SSH/SCP命令必须禁用交互模式',
            required: '-o BatchMode=yes'
        });
        fixed += ' -o BatchMode=yes';
    }

    // 检查3：是否禁用StrictHostKeyChecking
    if (!command.includes('StrictHostKeyChecking=no')) {
        errors.push({
            code: 'SSH-003',
            message: 'SSH/SCP命令必须禁用主机密钥检查',
            required: '-o StrictHostKeyChecking=no'
        });
        fixed += ' -o StrictHostKeyChecking=no';
    }

    // 检查4：是否设置ConnectionAttempts
    if (!command.includes('ConnectionAttempts')) {
        warnings.push({
            code: 'SSH-004',
            message: '建议设置ConnectionAttempts=1避免重试',
            suggested: '-o ConnectionAttempts=1'
        });
        fixed += ' -o ConnectionAttempts=1';
    }

    // 检查5：是否使用密钥认证（推荐）
    if (!command.includes('-i ') && command.includes('plink') && !command.includes('-pw')) {
        errors.push({
            code: 'SSH-005',
            message: 'SSH命令必须使用密钥认证或密码认证',
            required: '-i ~/.ssh/id_ed25519 或 plink -pw 密码'
        });
    }

    return { errors, warnings, fixed };
}

/**
 * 检查长时间运行命令
 */
function checkLongRunningCommand(command) {
    const errors = [];
    const longRunningPatterns = [
        'npm run dev',
        'npm start',
        'node server',
        'python -m http.server',
        'serve',
        'http-server'
    ];

    const isLongRunning = longRunningPatterns.some(pattern =>
        command.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isLongRunning && !command.includes('is_background')) {
        errors.push({
            code: 'CMD-001',
            message: '长时间运行的命令必须设置后台执行',
            required: 'is_background: true'
        });
    }

    return { errors };
}

/**
 * 检查交互式命令
 */
function checkInteractiveCommand(command) {
    const errors = [];

    const interactiveCommands = [
        { pattern: 'npx', flag: '--yes' },
        { pattern: 'npm install', flag: '--yes' },
        { pattern: 'git commit', flag: '-m' }
    ];

    for (const { pattern, flag } of interactiveCommands) {
        if (command.includes(pattern) && !command.includes(flag)) {
            errors.push({
                code: 'CMD-002',
                message: `${pattern}命令必须加非交互参数`,
                required: flag
            });
        }
    }

    return { errors };
}

/**
 * 主检查函数
 */
function interceptCommand(params) {
    const { command } = params;

    if (!command) {
        return {
            success: false,
            blocked: true,
            error: '命令不能为空'
        };
    }

    const allErrors = [];
    const allWarnings = [];
    let fixedCommand = command;

    // 检查SSH/SCP命令
    if (command.includes('ssh') || command.includes('scp') ||
        command.includes('plink') || command.includes('pscp')) {
        const sshCheck = checkSSHCommand(command);
        allErrors.push(...sshCheck.errors);
        allWarnings.push(...sshCheck.warnings);
        fixedCommand = sshCheck.fixed;
    }

    // 检查长时间运行命令
    const longRunCheck = checkLongRunningCommand(command);
    allErrors.push(...longRunCheck.errors);

    // 检查交互式命令
    const interactiveCheck = checkInteractiveCommand(command);
    allErrors.push(...interactiveCheck.errors);

    // 判断是否拦截
    const blocked = allErrors.length > 0;

    if (blocked) {
        return {
            success: false,
            blocked: true,
            errors: allErrors,
            warnings: allWarnings,
            fixed_command: fixedCommand,
            message: `🚫 命令被拦截！发现${allErrors.length}个错误`,
            help: {
                original_command: command,
                suggested_fix: fixedCommand,
                errors_detail: allErrors,
                action: '请使用fixed_command或根据errors_detail修复命令'
            }
        };
    }

    // 通过检查
    return {
        success: true,
        blocked: false,
        safe: true,
        warnings: allWarnings,
        message: `✅ 命令检查通过${allWarnings.length > 0 ? `（有${allWarnings.length}个警告）` : ''}`,
        command: command
    };
}

module.exports = {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    inputSchema: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: '要检查的命令'
            }
        },
        required: ['command']
    },
    handler: interceptCommand
};


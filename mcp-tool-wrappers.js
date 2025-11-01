/**
 * MCP工具包装器实现 v7.7.0
 * 包装所有Cursor原生工具，实现拦截和规则检查
 */

const fs = require('fs').promises;
const { spawn, execSync } = require('child_process');

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 MCP工具包装器基类
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MCPToolWrapper {
    constructor(toolName, nativeImplementation) {
        this.toolName = toolName;
        this.nativeImpl = nativeImplementation;
        this.interceptor = null;
    }

    setInterceptor(interceptor) {
        this.interceptor = interceptor;
    }

    async handle(args) {
        try {
            // 1. 前置拦截检查
            const interceptResult = await this.preCheck(args);
            if (interceptResult && interceptResult.blocked) {
                console.error(`🚫 ${this.toolName} 被拦截:`, interceptResult.message);
                throw new Error(interceptResult.message);
            }

            // 2. 执行原生操作
            const result = await this.nativeImpl(args);

            // 3. 记录执行日志
            this.logExecution(args, result);

            return result;
        } catch (error) {
            this.logError(args, error);
            throw error;
        }
    }

    async preCheck(args) {
        if (!this.interceptor) return { blocked: false };
        return await this.interceptor.preIntercept(this.toolName, args);
    }

    logExecution(args, result) {
        if (!this.interceptor) return;
        this.interceptor.logInterception(
            'TOOL-WRAPPER',
            this.toolName,
            args,
            { blocked: false, message: 'Success' },
            'pre'
        );
    }

    logError(args, error) {
        console.error(`❌ ${this.toolName} 执行失败:`, error.message);
        if (this.interceptor) {
            this.interceptor.logInterception(
                'TOOL-ERROR',
                this.toolName,
                args,
                { blocked: true, message: error.message },
                'pre'
            );
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 包装工具实现
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 1. mcp_read_file - 读取文件
const mcp_read_file_impl = async (args) => {
    const { target_file, offset, limit } = args;

    const content = await fs.readFile(target_file, 'utf-8');
    const lines = content.split('\n');

    const startLine = offset || 0;
    const endLine = limit ? startLine + limit : lines.length;
    const selectedLines = lines.slice(startLine, endLine);

    const numberedLines = selectedLines.map((line, idx) => {
        const lineNum = (startLine + idx + 1).toString().padStart(6);
        return `${lineNum}|${line}`;
    }).join('\n');

    return numberedLines || 'File is empty.';
};

// 2. mcp_write - 写入文件
const mcp_write_impl = async (args) => {
    const { file_path, contents } = args;
    await fs.writeFile(file_path, contents, 'utf-8');
    return `File written successfully: ${file_path}`;
};

// 3. mcp_search_replace - 搜索替换
const mcp_search_replace_impl = async (args) => {
    const { file_path, old_string, new_string, replace_all } = args;

    let content = await fs.readFile(file_path, 'utf-8');

    if (replace_all) {
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escapeRegex(old_string), 'g');
        content = content.replace(regex, new_string);
    } else {
        content = content.replace(old_string, new_string);
    }

    await fs.writeFile(file_path, content, 'utf-8');
    return `Search and replace completed: ${file_path}`;
};

// 4. mcp_run_terminal_cmd - 执行命令
const mcp_run_terminal_cmd_impl = async (args) => {
    const { command, is_background } = args;

    return new Promise((resolve, reject) => {
        const child = spawn(command, {
            shell: true,
            stdio: is_background ? 'ignore' : 'pipe'
        });

        if (is_background) {
            child.unref();
            resolve(`Command started in background (PID: ${child.pid})`);
            return;
        }

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            const output = `Exit code: ${code}\n\nCommand output:\n\`\`\`\n${stdout}\n\`\`\`${stderr ? `\n\nErrors:\n${stderr}` : ''}`;
            resolve(output);
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
};

// 5. mcp_grep - 文件搜索
const mcp_grep_impl = async (args) => {
    const { pattern, path: searchPath, output_mode, ...options } = args;

    let cmd = `rg "${pattern}"`;
    if (searchPath) cmd += ` "${searchPath}"`;
    if (options['-i']) cmd += ' -i';
    if (options['-C']) cmd += ` -C ${options['-C']}`;
    if (options['-A']) cmd += ` -A ${options['-A']}`;
    if (options['-B']) cmd += ` -B ${options['-B']}`;
    if (output_mode === 'files_with_matches') cmd += ' -l';
    if (output_mode === 'count') cmd += ' -c';
    if (options.head_limit) cmd += ` | head -${options.head_limit}`;

    try {
        const result = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
        return result || 'No matches found';
    } catch (error) {
        if (error.status === 1) {
            return 'No matches found';
        }
        throw error;
    }
};

// 6. mcp_delete_file - 删除文件
const mcp_delete_file_impl = async (args) => {
    const { target_file } = args;
    await fs.unlink(target_file);
    return `File deleted successfully: ${target_file}`;
};

// 7. mcp_list_dir - 列出目录
const mcp_list_dir_impl = async (args) => {
    const { target_directory, ignore_globs } = args;
    const entries = await fs.readdir(target_directory, { withFileTypes: true });

    const result = entries
        .filter(entry => !entry.name.startsWith('.'))
        .map(entry => ({
            name: entry.name,
            type: entry.isDirectory() ? 'directory' : 'file'
        }));

    return JSON.stringify(result, null, 2);
};

// 8. mcp_glob_file_search - 文件名搜索
const mcp_glob_file_search_impl = async (args) => {
    const { glob_pattern, target_directory } = args;
    const pattern = glob_pattern.startsWith('**/') ? glob_pattern : '**/' + glob_pattern;

    // Windows环境下使用PowerShell的Get-ChildItem
    const isWindows = process.platform === 'win32';
    if (isWindows) {
        const psCmd = `Get-ChildItem -Path "${target_directory || '.'}" -Recurse -Filter "${pattern.replace('**/', '')}" | Select-Object FullName | Format-Table -HideTableHeaders`;
        try {
            const result = execSync(`powershell -Command "${psCmd}"`, { encoding: 'utf-8' });
            return result || 'No files found';
        } catch (error) {
            return 'No files found';
        }
    } else {
        const cmd = `find "${target_directory || '.'}" -name "${pattern.replace('**/', '')}"`;
        try {
            const result = execSync(cmd, { encoding: 'utf-8' });
            return result || 'No files found';
        } catch (error) {
            return 'No files found';
        }
    }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 创建包装器实例
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const wrappers = {
    // v7.10.9: MCP包装工具（mcp_前缀）
    mcp_read_file: new MCPToolWrapper('mcp_read_file', mcp_read_file_impl),
    mcp_write: new MCPToolWrapper('mcp_write', mcp_write_impl),
    mcp_search_replace: new MCPToolWrapper('mcp_search_replace', mcp_search_replace_impl),
    mcp_run_terminal_cmd: new MCPToolWrapper('mcp_run_terminal_cmd', mcp_run_terminal_cmd_impl),
    mcp_grep: new MCPToolWrapper('mcp_grep', mcp_grep_impl),
    mcp_delete_file: new MCPToolWrapper('mcp_delete_file', mcp_delete_file_impl),
    mcp_list_dir: new MCPToolWrapper('mcp_list_dir', mcp_list_dir_impl),
    mcp_glob_file_search: new MCPToolWrapper('mcp_glob_file_search', mcp_glob_file_search_impl),

    // ✅ v7.10.9-ultimate: 同名覆盖工具（覆盖Cursor原生工具）
    // 目的：让AI无法使用原生工具，强制使用MCP拦截版本
    read_file: new MCPToolWrapper('read_file', mcp_read_file_impl),
    write: new MCPToolWrapper('write', mcp_write_impl),
    search_replace: new MCPToolWrapper('search_replace', mcp_search_replace_impl),
    run_terminal_cmd: new MCPToolWrapper('run_terminal_cmd', mcp_run_terminal_cmd_impl),
    grep: new MCPToolWrapper('grep', mcp_grep_impl),
    delete_file: new MCPToolWrapper('delete_file', mcp_delete_file_impl),
    list_dir: new MCPToolWrapper('list_dir', mcp_list_dir_impl),
    glob_file_search: new MCPToolWrapper('glob_file_search', mcp_glob_file_search_impl)
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🔥 工具定义（MCP Protocol格式）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const toolDefinitions = [
    // ✅ v7.10.9-ultimate: 原生工具同名覆盖版本（优先级最高）
    // 当AI尝试使用 read_file 时，实际会调用这个MCP版本
    {
        name: 'read_file',
        description: '📄 Read and display a file from the filesystem (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                target_file: { type: 'string', description: 'The path of the file to read' },
                offset: { type: 'number', description: 'The line number to start reading from' },
                limit: { type: 'number', description: 'The number of lines to read' }
            },
            required: ['target_file']
        }
    },
    {
        name: 'write',
        description: '✏️ Writes a file to the local filesystem (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: 'The path to the file to modify' },
                contents: { type: 'string', description: 'The contents of the file to write' }
            },
            required: ['file_path', 'contents']
        }
    },
    {
        name: 'search_replace',
        description: '🔍 Performs exact string replacements in files (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: 'The path to the file to modify' },
                old_string: { type: 'string', description: 'The text to replace' },
                new_string: { type: 'string', description: 'The text to replace it with' },
                replace_all: { type: 'boolean', description: 'Replace all occurences' }
            },
            required: ['file_path', 'old_string', 'new_string']
        }
    },
    {
        name: 'run_terminal_cmd',
        description: '💻 PROPOSE a command to run on behalf of the user (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: 'The terminal command to execute' },
                is_background: { type: 'boolean', description: 'Whether the command should be run in the background' }
            },
            required: ['command', 'is_background']
        }
    },
    {
        name: 'grep',
        description: '🔎 A powerful search tool built on ripgrep (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: 'The regular expression pattern to search for' },
                path: { type: 'string', description: 'File or directory to search in' },
                output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'] },
                '-i': { type: 'boolean', description: 'Case insensitive search' },
                '-C': { type: 'number', description: 'Number of lines to show before and after' },
                '-A': { type: 'number', description: 'Number of lines to show after each match' },
                '-B': { type: 'number', description: 'Number of lines to show before each match' },
                head_limit: { type: 'number', description: 'Limit output to first N lines/entries' }
            },
            required: ['pattern']
        }
    },
    {
        name: 'delete_file',
        description: '🗑️ Deletes a file at the specified path (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                target_file: { type: 'string', description: 'The path of the file to delete' }
            },
            required: ['target_file']
        }
    },
    {
        name: 'list_dir',
        description: '📁 Lists files and directories in a given path (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                target_directory: { type: 'string', description: 'Path to directory to list contents of' },
                ignore_globs: { type: 'array', items: { type: 'string' }, description: 'Optional array of glob patterns to ignore' }
            },
            required: ['target_directory']
        }
    },
    {
        name: 'glob_file_search',
        description: '🔍 Tool to search for files matching a glob pattern (MCP intercepted version)',
        inputSchema: {
            type: 'object',
            properties: {
                glob_pattern: { type: 'string', description: 'The glob pattern to match files against' },
                target_directory: { type: 'string', description: 'Path to directory to search for files in' }
            },
            required: ['glob_pattern']
        }
    },

    // ========== v7.10.9: MCP包装工具（mcp_前缀，保留向后兼容）==========
    {
        name: 'mcp_read_file',
        description: '📄 读取文件内容（带规则检查）- 替代read_file',
        inputSchema: {
            type: 'object',
            properties: {
                target_file: { type: 'string', description: '文件路径' },
                offset: { type: 'number', description: '起始行号（可选）' },
                limit: { type: 'number', description: '读取行数（可选）' }
            },
            required: ['target_file']
        }
    },
    {
        name: 'mcp_write',
        description: '✏️ 写入文件（带规则检查）- 替代write',
        inputSchema: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: '文件路径' },
                contents: { type: 'string', description: '文件内容' }
            },
            required: ['file_path', 'contents']
        }
    },
    {
        name: 'mcp_search_replace',
        description: '🔍 搜索替换文件内容（带规则检查）- 替代search_replace',
        inputSchema: {
            type: 'object',
            properties: {
                file_path: { type: 'string', description: '文件路径' },
                old_string: { type: 'string', description: '要替换的文本' },
                new_string: { type: 'string', description: '新文本' },
                replace_all: { type: 'boolean', description: '是否替换所有匹配' }
            },
            required: ['file_path', 'old_string', 'new_string']
        }
    },
    {
        name: 'mcp_run_terminal_cmd',
        description: '💻 执行终端命令（带规则检查）- 替代run_terminal_cmd',
        inputSchema: {
            type: 'object',
            properties: {
                command: { type: 'string', description: '要执行的命令' },
                is_background: { type: 'boolean', description: '是否后台运行' }
            },
            required: ['command']
        }
    },
    {
        name: 'mcp_grep',
        description: '🔎 搜索文件内容（带规则检查）- 替代grep',
        inputSchema: {
            type: 'object',
            properties: {
                pattern: { type: 'string', description: '搜索模式' },
                path: { type: 'string', description: '搜索路径' },
                output_mode: { type: 'string', enum: ['content', 'files_with_matches', 'count'] },
                '-i': { type: 'boolean', description: '忽略大小写' },
                '-C': { type: 'number', description: '上下文行数' },
                '-A': { type: 'number', description: '后续行数' },
                '-B': { type: 'number', description: '前置行数' },
                head_limit: { type: 'number', description: '限制结果数量' }
            },
            required: ['pattern']
        }
    },
    {
        name: 'mcp_delete_file',
        description: '🗑️ 删除文件（带规则检查）- 替代delete_file',
        inputSchema: {
            type: 'object',
            properties: {
                target_file: { type: 'string', description: '要删除的文件路径' }
            },
            required: ['target_file']
        }
    },
    {
        name: 'mcp_list_dir',
        description: '📁 列出目录内容（带规则检查）- 替代list_dir',
        inputSchema: {
            type: 'object',
            properties: {
                target_directory: { type: 'string', description: '目录路径' },
                ignore_globs: { type: 'array', items: { type: 'string' }, description: '忽略模式' }
            },
            required: ['target_directory']
        }
    },
    {
        name: 'mcp_glob_file_search',
        description: '🔍 按文件名搜索（带规则检查）- 替代glob_file_search',
        inputSchema: {
            type: 'object',
            properties: {
                glob_pattern: { type: 'string', description: 'Glob模式' },
                target_directory: { type: 'string', description: '搜索目录' }
            },
            required: ['glob_pattern']
        }
    }
];

module.exports = {
    wrappers,
    toolDefinitions,
    MCPToolWrapper
};









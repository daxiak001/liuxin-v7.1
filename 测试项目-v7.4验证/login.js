/**
 * 用户登录验证逻辑
 * 项目：测试项目-v7.4验证
 * 版本：1.0.0
 * 作者：柳芯系统-开发工程师-小柳
 * 创建时间：2025-10-24
 */

// 测试用户数据（实际项目应从后端API获取）
const TEST_USERS = [
    {
        username: 'admin',
        password: 'admin123',
        role: '管理员',
        displayName: '管理员'
    },
    {
        username: 'test',
        password: 'test123',
        role: '测试用户',
        displayName: '测试用户'
    },
    {
        username: 'liuxin',
        password: 'liuxin123',
        role: '开发者',
        displayName: '柳芯开发者'
    }
];

/**
 * 显示错误消息
 * @param {string} message - 错误消息内容
 */
function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');

    successDiv.style.display = 'none';
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    // 3秒后自动隐藏
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 3000);
}

/**
 * 显示成功消息
 * @param {string} message - 成功消息内容
 */
function showSuccess(message) {
    const errorDiv = document.getElementById('errorMessage');
    const successDiv = document.getElementById('successMessage');

    errorDiv.style.display = 'none';
    successDiv.textContent = message;
    successDiv.style.display = 'block';
}

/**
 * 验证用户凭证
 * @param {string} username - 用户名
 * @param {string} password - 密码
 * @returns {Object|null} 用户信息或null
 */
function validateCredentials(username, password) {
    // 输入验证
    if (!username || !password) {
        return null;
    }

    // 去除首尾空格
    username = username.trim();

    // 查找匹配的用户
    const user = TEST_USERS.find(u =>
        u.username === username && u.password === password
    );

    return user || null;
}

/**
 * 保存登录会话
 * @param {Object} user - 用户信息
 * @param {boolean} remember - 是否记住登录
 */
function saveSession(user, remember) {
    const sessionData = {
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        loginTime: new Date().toISOString()
    };

    if (remember) {
        // 使用localStorage持久化保存
        localStorage.setItem('userSession', JSON.stringify(sessionData));
    } else {
        // 使用sessionStorage仅在会话期间保存
        sessionStorage.setItem('userSession', JSON.stringify(sessionData));
    }
}

/**
 * 登录成功处理
 * @param {Object} user - 用户信息
 */
function onLoginSuccess(user) {
    showSuccess(`✅ 登录成功！欢迎回来，${user.displayName}！`);

    // 2秒后跳转到主页（实际项目应跳转到真实页面）
    setTimeout(() => {
        alert(`登录成功！\n\n用户：${user.displayName}\n角色：${user.role}\n登录时间：${new Date().toLocaleString()}\n\n（实际项目中这里会跳转到主页）`);

        // 重置表单
        document.getElementById('loginForm').reset();
    }, 1500);
}

/**
 * 表单提交处理
 */
document.getElementById('loginForm').addEventListener('submit', function (event) {
    event.preventDefault();

    // 获取表单数据
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('remember').checked;

    // 输入验证
    if (!username || !password) {
        showError('❌ 请输入用户名和密码！');
        return;
    }

    if (username.length < 3) {
        showError('❌ 用户名至少3个字符！');
        return;
    }

    if (password.length < 6) {
        showError('❌ 密码至少6个字符！');
        return;
    }

    // 验证用户凭证
    const user = validateCredentials(username, password);

    if (user) {
        // 登录成功
        saveSession(user, remember);
        onLoginSuccess(user);

        // 记录登录日志（实际项目应发送到后端）
        console.log('登录成功', {
            username: user.username,
            role: user.role,
            timestamp: new Date().toISOString(),
            remember: remember
        });
    } else {
        // 登录失败
        showError('❌ 用户名或密码错误！请重试。');

        // 记录失败日志
        console.warn('登录失败', {
            username: username,
            timestamp: new Date().toISOString()
        });

        // 清空密码输入框
        document.getElementById('password').value = '';
        document.getElementById('password').focus();
    }
});

/**
 * 页面加载时检查是否已登录
 */
window.addEventListener('load', function () {
    const session = localStorage.getItem('userSession') || sessionStorage.getItem('userSession');

    if (session) {
        try {
            const userData = JSON.parse(session);
            console.log('检测到已登录会话', userData);

            // 可以在这里自动跳转或显示提示
            // alert(`检测到已登录：${userData.displayName}`);
        } catch (e) {
            console.error('会话数据解析失败', e);
        }
    }

    console.log('=== 测试用户账号 ===');
    console.log('1. admin / admin123 (管理员)');
    console.log('2. test / test123 (测试用户)');
    console.log('3. liuxin / liuxin123 (开发者)');
    console.log('==================');
});

// 防止XSS攻击的输入过滤
document.querySelectorAll('input[type="text"], input[type="password"]').forEach(input => {
    input.addEventListener('input', function (e) {
        // 过滤危险字符
        this.value = this.value.replace(/<|>|&|"|'/g, '');
    });
});


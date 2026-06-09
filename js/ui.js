/* Next K — 共享 UI 增强（app.js 未覆盖的额外功能） */

/* 主题持久化 — 页面加载前应用 */
(function () {
    var saved = localStorage.getItem('NEXT_K_THEME');
    if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }
})();

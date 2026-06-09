/* Next K — 共享基础设施 */
const API_BASE = resolveApiBase();

        const API_BASE = resolveApiBase();

        /** 避免 health / 长任务占满单 worker 时页面永远「连接中」 */
        async function fetchWithTimeout(url, options, ms) {
            const timeoutMs = ms == null ? 12000 : ms;
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), timeoutMs);
            try {
                return await fetch(url, { ...options, signal: ctrl.signal });
            } finally {
                clearTimeout(timer);
            }
        }

        function updateMaintTokenStatus() {
            const el = document.getElementById('maint-token-status');
            if (!el) return;
            const tok = getMaintenanceToken();
            if (tok) {
                el.textContent = '已配置（' + tok.length + ' 字符）';
                el.className = 'text-[10px] text-neon-green';
            } else {
                el.textContent = '未配置（清库 / Cron 可能 403）';
                el.className = 'text-[10px] text-warn';
            }
        }

        function maintenanceHeaders(extra) {
            const h = Object.assign({}, extra || {});
            const tok = getMaintenanceToken();
            if (tok) h['X-Maintenance-Token'] = tok;
            return h;
        }

        function formatBytes(n) {
            const num = Number(n);
            if (!Number.isFinite(num) || num < 0) return '?';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let v = num;
            let i = 0;
            while (v >= 1024 && i < units.length - 1) {
                v /= 1024;
                i += 1;
            }
            const digits = v >= 100 || i === 0 ? 0 : v >= 10 ? 1 : 2;
            return v.toFixed(digits) + ' ' + units[i];
        }

        function buildExportVolumeUrl(fmt) {
            const tok = getMaintenanceToken();
            const params = new URLSearchParams({ fmt: fmt || 'zip' });
            if (tok) params.set('maintenance_token', tok);
            return `${API_BASE}/export-volume?${params.toString()}`;
        }

        function apiErrorDetail(data, text, res) {
            const d = data && data.detail;
            if (d === 'maintenance_token_required') {
                return '需要维护令牌：在维护面板上方粘贴并保存，或服务端的 NEXT_K_MAINTENANCE_TOKEN 一致';
            }
            if (d === 'export_volume_disabled_set_NEXT_K_EXPORT_VOLUME_ENABLED=1') {
                return '服务端未开启卷导出：请设置 NEXT_K_EXPORT_VOLUME_ENABLED=1 并重新部署';
            }
            if (d && typeof d === 'object' && d.error === 'rate_limited') {
                return d.message || ('刷新过于频繁，请 ' + (d.retry_after_sec != null ? d.retry_after_sec : '?') + ' 秒后再试');
            }
            if (typeof d === 'string') return d;
            if (Array.isArray(d)) return d.map((x) => x.msg || x).join('; ');
            return JSON.stringify(d || data || text || (res && res.statusText) || '请求失败');
        }

        const API = {
            async health() {
                const res = await fetchWithTimeout(`${API_BASE}/api/health`, {}, 8000);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async accumulationOiRadar() {
                const res = await fetch(`${API_BASE}/api/accumulation/oi-radar`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async accumulationOiRadarRefresh() {
                const res = await fetch(`${API_BASE}/api/accumulation/oi-radar/refresh`, { method: 'POST' });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async worthWatch() {
                const res = await fetch(`${API_BASE}/api/accumulation/worth-watch`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async focusWatch() {
                const res = await fetch(`${API_BASE}/api/accumulation/focus-watch`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            /** 热度+收筹专用：含 1h 突破—回踩—延续（bpc_json），与 worth 中 heat_accum 按 symbol 对齐 */
            async heatAccumWatch() {
                const res = await fetch(`${API_BASE}/api/accumulation/heat-accum-watch`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async s2FundingSignals() {
                const res = await fetch(`${API_BASE}/api/s2/funding-signals`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async s6AutonomousAlpha() {
                const res = await fetch(`${API_BASE}/api/s6/autonomous-alpha`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            /** 清空收筹池 SQLite 表 watchlist，并更新 OI 快照状态（需后续 pool + 刷新） */
            async clearWatchlistPool() {
                return this.clearWatchTables(['watchlist']);
            },
            async clearWatchTables(tables) {
                const res = await fetch(`${API_BASE}/api/accumulation/maintenance/clear-watch-tables`, {
                    method: 'POST',
                    headers: maintenanceHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ tables }),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async triggerCron(task) {
                const res = await fetch(`${API_BASE}/api/accumulation/maintenance/trigger-cron`, {
                    method: 'POST',
                    headers: maintenanceHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ task }),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            /** VP 量价环境扫描（同步，可能数十秒） */
            async vpRegimeScan(body) {
                const res = await fetch(`${API_BASE}/api/vp-regime/scan`, {
                    method: 'POST',
                    headers: maintenanceHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            /** ZCT 触轨资产池 walk-forward（同步，可能数分钟；默认 symbols_source=生产并落库 touch_pool） */
            async zctTouchPoolScan(body) {
                const res = await fetch(`${API_BASE}/api/zct-vwap/touch-pool-scan`, {
                    method: 'POST',
                    headers: maintenanceHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async refreshHeatWatch() {
                const res = await fetch(`${API_BASE}/api/accumulation/maintenance/refresh-heat-watch`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            /** 清空 ZCT VWAP 两张 SQLite 表（快照 + 结算历史） */
            async zctVwapClearDb() {
                const res = await fetch(`${API_BASE}/api/zct-vwap/maintenance/clear-db`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            /** ZCT VWAP 信号汇总（持仓数、累计盈亏 USDT、胜率等） */
            async zctVwapSummary() {
                const res = await fetch(`${API_BASE}/api/zct-vwap/summary`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async momSummary() {
                const res = await fetch(`${API_BASE}/api/momentum/summary`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async momSignals() {
                const res = await fetch(`${API_BASE}/api/momentum/signals`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async topTraderClear() {
                const res = await fetch(`${API_BASE}/api/accumulation/maintenance/clear-top-trader`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async momClearDb() {
                const res = await fetch(`${API_BASE}/api/momentum/maintenance/clear-db`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async momScan() {
                const res = await fetch(`${API_BASE}/api/momentum/scan`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async jzSummary() {
                const res = await fetch(`${API_BASE}/api/jiezhen/summary`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async jzSignals() {
                const res = await fetch(`${API_BASE}/api/jiezhen/signals`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async jzUniverse() {
                const res = await fetch(`${API_BASE}/api/jiezhen/universe`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async jzClearDb() {
                const res = await fetch(`${API_BASE}/api/jiezhen/maintenance/clear-db`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async orbSummary() {
                const res = await fetch(`${API_BASE}/api/orb/summary`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async orbSignals() {
                const res = await fetch(`${API_BASE}/api/orb/signals?limit=200`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async orbSessionToday() {
                const res = await fetch(`${API_BASE}/api/orb/session/today`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async orbClearDb() {
                const res = await fetch(`${API_BASE}/api/orb/maintenance/clear-db`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqSummary() {
                const res = await fetch(`${API_BASE}/api/moss-quant/summary`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async mqSignals() {
                const res = await fetch(`${API_BASE}/api/moss-quant/signals`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async mqClearDb() {
                const res = await fetch(`${API_BASE}/api/moss-quant/maintenance/clear-db`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqProfiles() {
                const res = await fetch(`${API_BASE}/api/moss-quant/profiles`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async mqUniverse() {
                const res = await fetch(`${API_BASE}/api/moss-quant/universe`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async mqProfileFromDaily(body) {
                const res = await fetch(`${API_BASE}/api/moss-quant/profiles/from-daily`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqCreateProfile(body) {
                const res = await fetch(`${API_BASE}/api/moss-quant/profiles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqPatchProfile(profileId, body) {
                const res = await fetch(`${API_BASE}/api/moss-quant/profiles/${encodeURIComponent(profileId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqDeleteProfile(profileId) {
                const res = await fetch(`${API_BASE}/api/moss-quant/profiles/${encodeURIComponent(profileId)}`, {
                    method: 'DELETE',
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqPaperScanLatest() {
                const res = await fetch(`${API_BASE}/api/moss-quant/paper-scan/latest`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async _mqPost(path, body) {
                const res = await fetch(`${API_BASE}${path}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async mqBacktest(body) {
                return API._mqPost('/api/moss-quant/backtest', body);
            },
            async mqEvolveBaseline(body) {
                return API._mqPost('/api/moss-quant/evolve/baseline', body);
            },
            async mqEvolveReflect(baselineRunId) {
                return API._mqPost('/api/moss-quant/evolve/reflect', { baseline_run_id: baselineRunId });
            },
            async mqEvolveRun(baselineRunId) {
                return API._mqPost('/api/moss-quant/evolve/run', { baseline_run_id: baselineRunId });
            },
            async mqGetBacktest(runId) {
                const res = await fetch(`${API_BASE}/api/moss-quant/backtests/${encodeURIComponent(runId)}`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async mqApplyFinalParams(profileId, body) {
                return API._mqPost(
                    '/api/moss-quant/profiles/' + encodeURIComponent(profileId) + '/apply-final-params',
                    body || {},
                );
            },
            async mqOptimize(body) {
                return API._mqPost('/api/moss-quant/optimize', body || {});
            },
            async mqDailyOptimizeLatest() {
                const res = await fetch(`${API_BASE}/api/moss-quant/daily-optimize/latest`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async mqDailyOptimizeRun(body) {
                return API._mqPost('/api/moss-quant/daily-optimize/run', body || {});
            },
            async mqDailyCoreAdd(body) {
                return API._mqPost('/api/moss-quant/daily-core-symbols', body || {});
            },
            async m2Summary(refreshMarks) {
                const q = refreshMarks === false ? '?refresh=false' : '';
                const res = await fetch(`${API_BASE}/api/moss2/summary${q}`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2Signals(refreshMarks) {
                const q = refreshMarks === false ? '?refresh=false' : '';
                const res = await fetch(`${API_BASE}/api/moss2/signals${q}`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2Profiles() {
                const res = await fetch(`${API_BASE}/api/moss2/profiles`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2Catalog() {
                const res = await fetch(`${API_BASE}/api/moss2/catalog`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2Defaults(variant, template) {
                const q = new URLSearchParams();
                if (variant) q.set('variant', variant);
                if (template) q.set('template', template);
                const res = await fetch(`${API_BASE}/api/moss2/defaults?` + q.toString());
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2OnboardingSuggest(symbol) {
                const q = new URLSearchParams({ symbol: String(symbol || '').trim().toUpperCase() });
                const res = await fetch(`${API_BASE}/api/moss2/onboarding/suggest?` + q.toString());
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async m2TradeableSymbols() {
                const res = await fetch(`${API_BASE}/api/moss2/onboarding/tradeable`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2CreateProfile(body) {
                const res = await fetch(`${API_BASE}/api/moss2/profiles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async m2PatchProfile(profileId, body) {
                const res = await fetch(`${API_BASE}/api/moss2/profiles/${encodeURIComponent(profileId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async m2PaperScanLatest(refreshMarks) {
                const q = refreshMarks === false ? '?refresh=false' : '';
                const res = await fetch(`${API_BASE}/api/moss2/paper-scan/latest${q}`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2Backtest(body) {
                return API._mqPost('/api/moss2/backtest', body);
            },
            m2TearsheetHtmlUrl(profileId, mode, runBacktest) {
                const q = new URLSearchParams({ mode: mode || 'backtest', format: 'html' });
                if (runBacktest) q.set('run_backtest', 'true');
                return `${API_BASE}/api/moss2/profiles/${encodeURIComponent(String(profileId))}/tearsheet?${q.toString()}`;
            },
            async m2TearsheetMeta(profileId, mode, runBacktest) {
                const q = new URLSearchParams({ mode: mode || 'backtest', format: 'json' });
                if (runBacktest) q.set('run_backtest', 'true');
                const res = await fetchWithTimeout(
                    `${API_BASE}/api/moss2/profiles/${encodeURIComponent(String(profileId))}/tearsheet?${q.toString()}`,
                    {},
                    120000
                );
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async m2ReportsStatus() {
                const res = await fetch(`${API_BASE}/api/moss2/reports/status`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2LastAutoRun() {
                const res = await fetch(`${API_BASE}/api/moss2/maintenance/last-auto-run`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async m2PaperScan(opts) {
                const sync = !opts || opts.sync !== false;
                const q = sync ? '?sync=true' : '?sync=false';
                const res = await fetchWithTimeout(
                    `${API_BASE}/api/moss2/paper-scan${q}`,
                    {
                        method: 'POST',
                        headers: maintenanceHeaders({ 'Content-Type': 'application/json' }),
                        body: '{}',
                    },
                    sync ? 120000 : 20000
                );
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async m2EvolveProfile(profileId, force) {
                const q = force ? '?force=true' : '';
                return API._mqPost('/api/moss2/profiles/' + profileId + '/evolve' + q, {});
            },
            async m2ApproveCandidate(profileId) {
                return API._mqPost('/api/moss2/profiles/' + profileId + '/approve-candidate', {});
            },
            async m2ClearDb() {
                const res = await fetch(`${API_BASE}/api/moss2/maintenance/clear-db`, {
                    method: 'POST',
                    headers: maintenanceHeaders(),
                });
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async m2MaintenancePost(path, query, timeoutMs) {
                const q = query && Object.keys(query).length
                    ? '?' + new URLSearchParams(query).toString()
                    : '';
                const res = await fetchWithTimeout(
                    `${API_BASE}/api/moss2/maintenance/${path}${q}`,
                    { method: 'POST', headers: maintenanceHeaders() },
                    timeoutMs == null ? 60000 : timeoutMs
                );
                const text = await res.text();
                let data;
                try { data = JSON.parse(text); } catch (e) { throw new Error(text || res.statusText); }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            /** ZCT VWAP 信号列表；query 为 URLSearchParams 或对象 */
            async zctVwapSignals(query) {
                const q = query instanceof URLSearchParams ? query : new URLSearchParams(query || {});
                const res = await fetch(`${API_BASE}/api/zct-vwap/signals?` + q.toString());
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            /** 更新实盘入场/平仓/备注（PATCH，部分字段） */
            async zctVwapPatchManual(signalId, body) {
                const res = await fetch(`${API_BASE}/api/zct-vwap/signals/${encodeURIComponent(signalId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
            async zctHotOiClearDb() {
                const res = await fetch(`${API_BASE}/api/zct-hot-oi/maintenance/clear-db`, { method: 'POST' });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) {
                    const d = data.detail;
                    const msg = typeof d === 'string' ? d : (Array.isArray(d) ? d.map((x) => x.msg || x).join('; ') : JSON.stringify(d || data));
                    throw new Error(msg || text || res.statusText);
                }
                return data;
            },
            async zctHotOiSummary() {
                const res = await fetch(`${API_BASE}/api/zct-hot-oi/summary`);
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async zctHotOiSignals(query) {
                const q = query instanceof URLSearchParams ? query : new URLSearchParams(query || {});
                const res = await fetch(`${API_BASE}/api/zct-hot-oi/signals?` + q.toString());
                if (!res.ok) throw new Error(await res.text());
                return res.json();
            },
            async zctHotOiPatchManual(signalId, body) {
                const res = await fetch(`${API_BASE}/api/zct-hot-oi/signals/${encodeURIComponent(signalId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body || {}),
                });
                const text = await res.text();
                let data;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    throw new Error(text || res.statusText);
                }
                if (!res.ok) throw new Error(apiErrorDetail(data, text, res));
                return data;
            },
        };

        /** 1H 结构（BPC）表格列：后端 breakout_pullback_fsm 已移除，此处保持 false */
        const SHOW_BPC_UI = false;

        function escHtml(s) {
            if (s == null || s === '') return '';
            const d = document.createElement('div');
            d.textContent = String(s);
            return d.innerHTML;
        }

        function showToast(msg, ok) {
            let container = document.getElementById('toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toast-container';
                document.body.appendChild(container);
            }
            const el = document.createElement('div');
            el.className = 'toast ' + (ok ? 'toast-ok' : 'toast-err');
            el.textContent = String(msg || '');
            container.appendChild(el);
            setTimeout(() => el.remove(), 3000);
        }

        /** 永续合约 symbol（如 BTCUSDT）→ 展示/外链用 pair（如 BTC/USDT） */
        function perpSymToPairLabel(sym) {
            if (!sym || typeof sym !== 'string') return null;
            if (!sym.endsWith('USDT')) return null;
            const base = sym.slice(0, -4);
            return base + '/USDT';
        }

        function formatMcapUsd(v) {
            if (v == null || v === 0 || Number.isNaN(v)) return '--';
            const n = Number(v);
            if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
            if (n >= 1e6) return '$' + (n / 1e6).toFixed(0) + 'M';
            if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
            return '$' + n.toFixed(0);
        }

        function pxClass(px) {
            const n = Number(px);
            if (n > 0) return 'text-neon-green';
            if (n < 0) return 'text-neon-red';
            return 'text-text-muted';
        }

        function pctSigned(v, digits) {
            if (v == null || Number.isNaN(Number(v))) return '--';
            const n = Number(v);
            const d = digits != null ? digits : 2;
            return (n >= 0 ? '+' : '') + n.toFixed(d) + '%';
        }

        function oiRadarHotTags(d) {
            const t = [];
            if (d.in_cg) t.push('<span class="text-neon-blue">🌐CG</span>');
            if (d.vol_surge) t.push('<span class="text-warn/95">📈放量</span>');
            if (Math.abs(Number(d.d6h) || 0) >= 3) {
                const v = Number(d.d6h);
                t.push('<span class="text-neon-purple">⚡OI' + (v >= 0 ? '+' : '') + v.toFixed(0) + '%</span>');
            }
            if (d.in_pool) t.push('<span class="text-text-secondary">💤池' + (Number(d.sw_days) || 0) + '天</span>');
            if (Number(d.fr_pct) < -0.03) t.push('<span class="text-neon-blue">🧊' + Number(d.fr_pct).toFixed(2) + '%</span>');
            return t.join(' ');
        }

        function oiRadarCard(title, emoji, innerHtml) {
            return `
                <div class="bg-surface-light rounded-xl border border-border p-3 min-h-[120px] shadow-[0_2px_8px_rgba(74,74,74,0.05)]">
                    <div class="text-text-secondary text-xs font-medium tracking-wide mb-2 flex items-center gap-1.5">${emoji} ${escHtml(title)}</div>
                    <div class="space-y-1.5 text-sm">${innerHtml}</div>
                </div>`;
        }

        function oiRadarRowClickable(sym, innerLineHtml) {
            const perpPair = perpSymToPairLabel(sym);
            if (!perpPair) return `<div class="text-xs text-text-secondary leading-relaxed py-0.5">${innerLineHtml}</div>`;
            const safe = perpPair.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
            return `<div role="button" tabindex="0" class="oi-radar-pick w-full text-left text-xs text-text-secondary leading-relaxed py-0.5 px-1 -mx-1 rounded-lg hover:bg-surface-light/55 transition-colors cursor-pointer border border-transparent hover:border-border/60" data-perp-pair="${safe}">${innerLineHtml}</div>`;
        }

        function openBinanceFuturesByPair(perpPair) {
            if (!perpPair) return;
            const perp = perpPair.replace('/', '').toUpperCase();
            const url = 'https://www.binance.com/zh-CN/futures/' + encodeURIComponent(perp);
            window.open(url, '_blank', 'noopener,noreferrer');
        }

        /** 看盘表：生成日期倒序；同日同分时按最近刷新时间（last_seen_cst）倒序 */
        function sortWatchItemsByGeneratedDesc(items) {
            return [...items].sort((a, b) => {
                const g = String(b.generated_date || '').localeCompare(String(a.generated_date || ''));
                if (g !== 0) return g;
                const ls = String(b.last_seen_cst || '').localeCompare(String(a.last_seen_cst || ''));
                if (ls !== 0) return ls;
                return String(a.symbol || '').localeCompare(String(b.symbol || ''));
            });
        }

        /**
         * 七类值得看盘：时间倒序；同一生成日+last_seen 的快照内按 rank_in_category 升序（#1 在 #2 前），
         * 避免仅按 symbol 字母序把名次显示反了（与后端「每类前两名」逻辑一致）。
         */
        function sortWorthHighlightItemsDesc(items) {
            return [...items].sort((a, b) => {
                const g = String(b.generated_date || '').localeCompare(String(a.generated_date || ''));
                if (g !== 0) return g;
                const ls = String(b.last_seen_cst || '').localeCompare(String(a.last_seen_cst || ''));
                if (ls !== 0) return ls;
                const ra = Number(a.rank_in_category);
                const rb = Number(b.rank_in_category);
                const ha = Number.isFinite(ra);
                const hb = Number.isFinite(rb);
                if (ha && hb && ra !== rb) return ra - rb;
                if (ha && !hb) return -1;
                if (!ha && hb) return 1;
                return String(a.symbol || '').localeCompare(String(b.symbol || ''));
            });
        }

        /** 与后端 WORTH_HIGHLIGHT_CATEGORY_ORDER 顺序一致 */
        const WORTH_WATCH_META = [
            ['heat_accum', '🔥💤 热度+收筹'],
            ['patrick_core', '📍 Patrick核心'],
            ['hot_oi', '🔥⚡ 热度+OI'],
            ['chase_fire', '🔥 追多·费率加速'],
            ['dual_list', '⭐ 追多+综合双榜'],
            ['ambush_dark', '🎯 埋伏·暗流'],
            ['ambush_gem', '💎 埋伏·低市值+OI'],
        ];
        /** 顶部 Tab：重点关注 + 七类 worth（与后端归档一致） */
        const WORTH_HISTORY_TAB_META = [['focus_watch', '👑 重点关注'], ...WORTH_WATCH_META];
        /** 每处历史表约 10 行可视高度，超出在容器内纵向/横向滚动（八类均以 Tab 切换） */
        const HISTORY_TABLE_SCROLL_WRAP =
            'max-h-[min(26rem,40vh)] overflow-y-auto overflow-x-auto';

        /** 与后端 BPC_CONTINUATION_REASON_ZH 对齐；旧快照仅有英文 reason 时兜底 */
        const BPC_CONTINUATION_REASON_ZH = {
            pin_bar: '长下影·Pin',
            bullish_engulfing: '看涨吞没',
            reclaim_micro_high: '收复回踩段前高',
        };

        /** 与旧「热度·收筹看盘」一致：1h K 线状态机展示 */
        function formatHeatAccumBpcCell(bpc) {
            if (!bpc || typeof bpc !== 'object') {
                return '<span class="text-text-muted">--</span>';
            }
            const zh = escHtml(bpc.phase_zh || bpc.phase || '--');
            const bits = [];
            let reasonLine = '';
            // 与后端一致：延续形态副标题仅当相位为 continuation（避免陈旧 last_* 污染观望/回踩）
            if (bpc.phase === 'continuation') {
                if (bpc.continuation_reason_zh) reasonLine = String(bpc.continuation_reason_zh);
                else if (bpc.continuation_reason) {
                    const r = String(bpc.continuation_reason);
                    reasonLine = BPC_CONTINUATION_REASON_ZH[r] || r;
                }
            }
            if (reasonLine) bits.push(reasonLine);
            if (bpc.pullback_vol_contracted) bits.push('缩量回踩');
            if (bpc.ok === false && bpc.last_invalid_reason) bits.push(String(bpc.last_invalid_reason));
            const sub = bits.length
                ? `<span class="block text-[10px] text-text-muted mt-0.5">${escHtml(bits.join(' · '))}</span>`
                : '';
            return `<div class="text-xs">${zh}${sub}</div>`;
        }

        function buildBpcBySymbolFromHeatAccum(heatWl) {
            const m = new Map();
            const items = heatWl && Array.isArray(heatWl.items) ? heatWl.items : [];
            items.forEach((it) => {
                const s = it && it.symbol ? String(it.symbol) : '';
                if (s) m.set(s, it.bpc);
            });
            return m;
        }

        function ensureWorthHistoryTabShell() {
            const root = document.getElementById('worth-watch-boards-root');
            if (!root) return null;
            let tabBar = document.getElementById('worth-history-tab-bar');
            let panelsRoot = document.getElementById('worth-history-tab-panels');
            let footEl = document.getElementById('worth-history-footnote');
            if (!tabBar || !panelsRoot || !footEl) {
                root.className = 'flex flex-col min-w-0';
                root.innerHTML = `
                    <div id="worth-history-tab-bar" class="flex flex-nowrap items-end gap-0.5 overflow-x-auto px-2 sm:px-3 pt-2 border-b border-border/70 bg-surface-light/[0.2] scrollbar-thin" role="tablist" aria-label="重点关注与值得关注七类"></div>
                    <div class="px-4 pb-4 pt-3 min-w-0">
                        <div id="worth-history-tab-panels"></div>
                        <p id="worth-history-footnote" class="hidden text-text-muted text-[11px] mt-3 mb-0 leading-relaxed"></p>
                    </div>`;
                tabBar = document.getElementById('worth-history-tab-bar');
                panelsRoot = document.getElementById('worth-history-tab-panels');
                footEl = document.getElementById('worth-history-footnote');
            }
            return { root, tabBar, panelsRoot, footEl };
        }

        function worthHistTabBtnClass(active) {
            const base =
                'shrink-0 px-2.5 sm:px-3 py-2 text-[11px] sm:text-sm font-medium rounded-t-md border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-0 focus-visible:ring-offset-background';
            return active
                ? `${base} border-accent text-text-primary bg-surface-light/40`
                : `${base} border-transparent text-text-secondary hover:text-text-primary hover:bg-surface-light/20`;
        }

        function worthHistoryPreferredTabKey() {
            try {
                const k = localStorage.getItem('worthHistoryTabKey');
                if (k && WORTH_HISTORY_TAB_META.some(([id]) => id === k)) return k;
            } catch (e) { /* ignore */ }
            return 'focus_watch';
        }

        function switchWorthHistoryTab(key) {
            if (!WORTH_HISTORY_TAB_META.some(([id]) => id === key)) return;
            WORTH_HISTORY_TAB_META.forEach(([id]) => {
                const tab = document.getElementById(`worth-tab-${id}`);
                const panel = document.getElementById(`worth-panel-${id}`);
                const on = id === key;
                if (tab) {
                    tab.setAttribute('aria-selected', on ? 'true' : 'false');
                    tab.tabIndex = on ? 0 : -1;
                    tab.className = worthHistTabBtnClass(on);
                }
                if (panel) {
                    if (on) panel.removeAttribute('hidden');
                    else panel.setAttribute('hidden', '');
                }
            });
            try {
                localStorage.setItem('worthHistoryTabKey', key);
            } catch (e) { /* ignore */ }
            const activeTab = document.getElementById(`worth-tab-${key}`);
            if (activeTab && typeof activeTab.scrollIntoView === 'function') {
                try {
                    activeTab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } catch (e2) { /* ignore */ }
            }
        }

        
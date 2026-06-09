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

        function initWorthHistoryTabDelegationOnce() {
            const root = document.getElementById('worth-watch-boards-root');
            if (!root || root.dataset.worthTabDeleg === '1') return;
            root.dataset.worthTabDeleg = '1';
            root.addEventListener('click', (ev) => {
                const btn = ev.target && ev.target.closest && ev.target.closest('button[data-worth-tab-key]');
                if (!btn || !root.contains(btn)) return;
                ev.preventDefault();
                const k = btn.getAttribute('data-worth-tab-key');
                if (k) switchWorthHistoryTab(k);
            });
        }

        /**
         * 重点关注面板 HTML（与原 focus 看盘表格一致，供 Tab 内嵌）。
         * @param heatWl 热度看盘兜底 bpc
         */
        function buildFocusWatchPanelInnerHtml(fw, heatWl) {
            const items = fw && Array.isArray(fw.items) ? fw.items : [];
            const showBpc = SHOW_BPC_UI;
            const bpcBySym = showBpc ? buildBpcBySymbolFromHeatAccum(heatWl || {}) : new Map();
            if (!items.length) {
                const hint = fw && fw.message ? String(fw.message) : '暂无命中。需先跑 pool 写入收筹池，且满足逼空/天量/暗流条件；整点 :30 OI 扫描或点下方「刷新」后入库。';
                return `<div class="text-text-muted text-sm leading-relaxed">${escHtml(hint)}</div>`;
            }
            const thBpc = showBpc
                ? '<th class="py-2 pr-3 font-medium whitespace-nowrap" title="1h K 线：突破→回踩→延续（不含 OI），与热度看盘按 symbol 对齐">1H 结构</th>'
                : '';
            const thead = `
                <table class="w-full text-left text-xs border-collapse min-w-[560px]">
                    <thead>
                        <tr class="text-text-muted border-b border-border">
                            <th class="py-2 pr-3 font-medium whitespace-nowrap">标的</th>
                            ${thBpc}
                            <th class="py-2 pr-3 font-medium whitespace-nowrap">通道</th>
                            <th class="py-2 pr-3 font-medium">摘要</th>
                            <th class="py-2 pr-3 font-medium">策略提示</th>
                        </tr>
                    </thead><tbody>`;
            const rows = items.map((row) => {
                const sym = row.symbol || '';
                const ch = escHtml(row.channel_label_zh || row.channel || '--');
                const sum = row.summary_line ? oiRadarRowClickable(sym, escHtml(row.summary_line)) : oiRadarRowClickable(sym, escHtml(row.coin || sym));
                const st = row.strategy_tip ? `<span class="text-text-secondary">${escHtml(row.strategy_tip)}</span>` : '--';
                const coinLine = '<span class="font-semibold text-warn/95">' + escHtml(row.coin || '') + '</span>';
                const coinCell = oiRadarRowClickable(sym, coinLine);
                const bpcCell = showBpc
                    ? `<td class="py-2 pr-3 align-top">${formatHeatAccumBpcCell(row.bpc || bpcBySym.get(sym))}</td>`
                    : '';
                return `<tr class="border-b border-border/60 hover:bg-surface-light/30 align-top">
                    <td class="py-2 pr-3 whitespace-nowrap">${coinCell}</td>
                    ${bpcCell}
                    <td class="py-2 pr-3 whitespace-nowrap">${ch}</td>
                    <td class="py-2 pr-3">${sum}</td>
                    <td class="py-2 pr-3 text-[11px] max-w-[220px]">${st}</td>
                </tr>`;
            }).join('');
            return (
                `<div class="${HISTORY_TABLE_SCROLL_WRAP} -mx-0.5 px-0.5">` +
                thead +
                rows +
                '</tbody></table></div>'
            );
        }

        /**
         * @param heatWl 可选；热度看盘兜底：仅当 worth 行尚无 bpc 时按 symbol 对齐（ heat-accum-watch ）
         * @param fw 重点关注 focus_watch 载荷
         */
        function renderWorthSevenBoards(wl, heatWl, fw) {
            const shell = ensureWorthHistoryTabShell();
            if (!shell) return;
            const { root, tabBar, panelsRoot, footEl } = shell;
            const cats = (wl && wl.categories) || {};
            const showBpc = SHOW_BPC_UI;
            const bpcBySym = showBpc ? buildBpcBySymbolFromHeatAccum(heatWl || {}) : new Map();
            const thBpc = showBpc
                ? '<th class="py-2 pr-3 font-medium whitespace-nowrap align-top" title="1h K 线：突破→回踩→延续（不含 OI），与各板归档按 symbol 对齐">1H 结构</th>'
                : '';
            const colgroup = showBpc
                ? `<colgroup>
                        <col style="width:12%" />
                        <col style="width:20%" />
                        <col style="width:14%" />
                        <col />
                    </colgroup>`
                : `<colgroup>
                        <col style="width:14%" />
                        <col style="width:22%" />
                        <col />
                    </colgroup>`;
            const thead = `
                <table class="w-full table-fixed text-left text-xs border-collapse min-w-[560px]">
                    ${colgroup}
                    <thead>
                        <tr class="text-text-muted border-b border-border">
                            <th class="py-2 pr-3 font-medium whitespace-nowrap align-top">标的</th>
                            <th class="py-2 pr-3 font-medium whitespace-nowrap align-top">生成日期</th>
                            ${thBpc}
                            <th class="py-2 pr-3 font-medium align-top">摘要</th>
                        </tr>
                    </thead><tbody>`;
            const pref = worthHistoryPreferredTabKey();
            const tabHtml = WORTH_HISTORY_TAB_META.map(([key, label]) => {
                const active = key === pref;
                return `<button type="button" role="tab" id="worth-tab-${key}" data-worth-tab-key="${key}"
                    class="${worthHistTabBtnClass(active)}"
                    aria-selected="${active ? 'true' : 'false'}" aria-controls="worth-panel-${key}" tabindex="${active ? '0' : '-1'}">${escHtml(label)}</button>`;
            }).join('');
            const panelsHtml = WORTH_HISTORY_TAB_META.map(([key]) => {
                const active = key === pref;
                let inner;
                if (key === 'focus_watch') {
                    inner = buildFocusWatchPanelInnerHtml(fw || { items: [] }, heatWl);
                } else {
                    const sec = cats[key] || { items: [] };
                    const items = sortWorthHighlightItemsDesc(sec.items || []);
                    if (!items.length) {
                        inner = '<div class="text-text-muted text-sm py-2">本类暂无归档。</div>';
                    } else {
                        const rows = items.map((row) => {
                            const gd = escHtml(row.generated_date || '--');
                            const sym = row.symbol || '';
                            const sum = escHtml(row.summary_line || '');
                            const coinLine = '<span class="font-semibold text-accent">' + escHtml(row.coin || '') + '</span>';
                            const summaryCell = oiRadarRowClickable(sym, sum);
                            const bpcCell = showBpc
                                ? `<td class="py-2 pr-3 align-top">${formatHeatAccumBpcCell(row.bpc || bpcBySym.get(sym))}</td>`
                                : '';
                            return `<tr class="border-b border-border/60 hover:bg-surface-light/30">
                            <td class="py-2 pr-3 align-top whitespace-nowrap">${oiRadarRowClickable(sym, coinLine)}</td>
                            <td class="py-2 pr-3 align-top text-text-secondary whitespace-nowrap font-mono tabular-nums">${gd}</td>
                            ${bpcCell}
                            <td class="py-2 pr-3 align-top break-words">${summaryCell}</td>
                        </tr>`;
                        }).join('');
                        inner = thead + rows + '</tbody></table>';
                    }
                }
                const hiddenAttr = active ? '' : ' hidden';
                return `<div role="tabpanel" id="worth-panel-${key}" aria-labelledby="worth-tab-${key}"${hiddenAttr}
                    class="rounded-lg border border-border/70 bg-surface-light/[0.15] overflow-hidden">
                    <div class="p-3 min-w-0${key !== 'focus_watch' ? ' ' + HISTORY_TABLE_SCROLL_WRAP : ''}">${inner}</div>
                </div>`;
            }).join('');
            const footHtml = '';
            tabBar.innerHTML = tabHtml;
            panelsRoot.innerHTML = panelsHtml;
            if (footEl) {
                footEl.innerHTML = footHtml;
                footEl.classList.add('hidden');
            }
            switchWorthHistoryTab(pref);
            bindOiRadarPickHandlers(root);
        }

        async function hydrateWorthHighlightBoards(snapshotPayload) {
            let wl;
            let fw = snapshotPayload && snapshotPayload.focus_watchlist;
            const hasSnapFocus = fw && Array.isArray(fw.items) && fw.items.length > 0;
            let heatWl = { items: [] };
            const fetchFns = [() => API.worthWatch()];
            if (!hasSnapFocus) {
                fetchFns.push(() => API.focusWatch());
            }
            if (SHOW_BPC_UI) {
                fetchFns.push(() => API.heatAccumWatch());
            }
            try {
                const results = await Promise.all(fetchFns.map((fn) => fn()));
                let i = 0;
                wl = results[i++];
                if (!hasSnapFocus) {
                    fw = results[i++];
                }
                if (SHOW_BPC_UI) {
                    heatWl = results[i++];
                }
            } catch (e) {
                console.error('worth / focus / heat accum watch:', e);
                try {
                    wl = await API.worthWatch();
                } catch (e2) {
                    wl = { categories: {}, message: '看盘接口暂不可用' };
                }
                if (!hasSnapFocus) {
                    try {
                        fw = await API.focusWatch();
                    } catch (e3) {
                        fw = { items: [], message: 'focus_watch 接口暂不可用' };
                    }
                } else if (!fw) {
                    fw = { items: [] };
                }
                if (SHOW_BPC_UI) {
                    try {
                        heatWl = await API.heatAccumWatch();
                    } catch (e4) {
                        heatWl = { items: [] };
                    }
                }
            }
            renderWorthSevenBoards(wl || { categories: {} }, heatWl || { items: [] }, fw || { items: [] });
        }

        function bindOiRadarPickHandlers(root) {
            if (!root) return;
            root.querySelectorAll('.oi-radar-pick[data-perp-pair]').forEach((el) => {
                const go = () => openBinanceFuturesByPair(el.getAttribute('data-perp-pair'));
                el.addEventListener('click', go);
                el.addEventListener('keydown', (ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        go();
                    }
                });
            });
        }

        function fmtS2RecordedAt(iso) {
            if (!iso) return '--';
            try {
                const d = new Date(iso);
                if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace('T', ' ');
                return d.toLocaleString('zh-CN', {
                    timeZone: 'Asia/Shanghai',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                });
            } catch (e) {
                return String(iso).slice(0, 16);
            }
        }

        function fmtFrPct(raw) {
            const n = Number(raw);
            if (Number.isNaN(n)) return '--';
            return (n * 100).toFixed(4) + '%';
        }

        function fillS2FundingSignals(data, body, tsEl) {
            if (!body) return;
            const list = (data && data.signals) || [];
            tsEl.textContent = data && data.count != null ? `共 ${data.count} 条` : '';
            if (!list.length) {
                body.innerHTML = '<div class="text-text-muted text-sm py-2">近 2 日尚无强信号。信号在「费率由非负刚转负」且「OI 四段首尾抬升」时写入（与 TG 推送条件一致）。</div>';
                return;
            }
            const head = `
                <table class="w-full text-left text-xs border-collapse min-w-[720px]">
                    <thead>
                        <tr class="text-text-muted border-b border-border">
                            <th class="py-2 pr-3 font-medium">时间 (CST)</th>
                            <th class="py-2 pr-3 font-medium">币种</th>
                            <th class="py-2 pr-3 font-mono font-medium">费率 前→今</th>
                            <th class="py-2 pr-3 font-medium">OI Δ</th>
                            <th class="py-2 pr-3 font-medium">24h</th>
                            <th class="py-2 pr-3 font-medium">成交额</th>
                            <th class="py-2 pr-3 font-medium">市值</th>
                            <th class="py-2 pr-3 font-medium">现货</th>
                            <th class="py-2 pr-3 font-medium">广场</th>
                        </tr>
                    </thead>
                    <tbody>`;
            const rows = list.map((s) => {
                const sym = s.symbol || (s.coin ? s.coin + 'USDT' : '');
                const perpPair = perpSymToPairLabel(sym);
                const px = Number(s.price_chg_24h);
                const oi = Number(s.oi_change_pct);
                const frFrom = fmtFrPct(s.prev_fr);
                const frTo = fmtFrPct(s.current_fr);
                const volM = Number(s.volume_usd) / 1e6;
                const spot = s.has_spot ? '<span class="text-neon-green">有</span>' : '<span class="text-text-muted">仅合约</span>';
                let sq = '<span class="text-text-muted">-</span>';
                if (Number(s.square_posts) > 0) {
                    const v = Number(s.square_views) || 0;
                    const vStr = v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(0) + 'K' : String(v);
                    sq = escHtml(String(s.square_posts)) + '帖 / ' + escHtml(vStr);
                }
                const coinCell = perpPair
                    ? `<button type="button" class="s2-sym-pick font-semibold text-accent hover:underline decoration-accent/40" data-perp-pair="${perpPair.replace(/"/g, '&quot;')}">${escHtml(s.coin || '')}</button>`
                    : escHtml(s.coin || '');
                return `<tr class="border-b border-border/60 hover:bg-surface-light/30">
                    <td class="py-2 pr-3 text-text-secondary whitespace-nowrap">${escHtml(fmtS2RecordedAt(s.recorded_at))}</td>
                    <td class="py-2 pr-3">${coinCell}</td>
                    <td class="py-2 pr-3 text-text-secondary whitespace-nowrap">${escHtml(frFrom)} → ${escHtml(frTo)}</td>
                    <td class="py-2 pr-3 ${oi >= 0 ? 'text-neon-green' : 'text-neon-red'}">${oi >= 0 ? '+' : ''}${oi.toFixed(1)}%</td>
                    <td class="py-2 pr-3 ${pxClass(px)}">${px >= 0 ? '+' : ''}${px.toFixed(1)}%</td>
                    <td class="py-2 pr-3 text-text-muted">$${volM.toFixed(1)}M</td>
                    <td class="py-2 pr-3 text-text-muted">${formatMcapUsd(s.est_mcap_usd)}</td>
                    <td class="py-2 pr-3">${spot}</td>
                    <td class="py-2 pr-3 text-text-secondary">${sq}</td>
                </tr>`;
            }).join('');
            body.innerHTML = head + rows + '</tbody></table>';
            body.querySelectorAll('.s2-sym-pick[data-perp-pair]').forEach((btn) => {
                btn.addEventListener('click', () => openBinanceFuturesByPair(btn.getAttribute('data-perp-pair')));
            });
        }

        function s6ActionLabel(code) {
            const m = {
                a_skipped: 'A级跳过(仅S)',
                b_skipped: 'B级跳过(仅S)',
                non_s_skipped: '非S跳过',
                opened: '已开仓',
                env_rejected: '环境未通过',
                swap_opened: '换仓开仓',
                swap_skipped: '换仓未执行',
                full_no_s_swap: '满仓(非S)',
            };
            return m[code] || String(code || '--');
        }

        function fillS6AutonomousAlpha(data, sigBody, posBody, tsEl) {
            if (!sigBody || !posBody) return;
            const rawSig = (data && data.signals) || [];
            const list = rawSig.map((r) => {
                const c = Array.isArray(r.candidates) ? r.candidates.filter((x) => x && x.strength === 'S') : [];
                return { ...r, candidates: c, candidate_count: c.length };
            });
            const bal = data && data.balance_usd != null ? Number(data.balance_usd) : null;
            const initB = data && data.initial_balance != null ? Number(data.initial_balance) : null;
            const open = (data && data.open_positions) || [];
            if (tsEl) {
                const parts = [];
                if (data && data.count != null) parts.push(`归档 ${data.count} 条`);
                if (bal != null && !Number.isNaN(bal)) parts.push(`权益 ${bal.toFixed(2)} U`);
                tsEl.textContent = parts.join(' · ') || '--';
            }
            if (!list.length) {
                sigBody.innerHTML = '<div class="text-text-muted text-sm py-2">近 2 日尚无扫描归档。</div>';
            } else {
                const head = `
                    <table class="w-full text-left text-xs border-collapse min-w-[560px]">
                        <thead>
                            <tr class="text-text-muted border-b border-border">
                                <th class="py-2 pr-2 font-medium">时间</th>
                                <th class="py-2 pr-2 font-medium">标的</th>
                                <th class="py-2 pr-2 font-medium">级</th>
                                <th class="py-2 pr-2 font-medium">方向</th>
                                <th class="py-2 pr-2 font-medium">结果</th>
                                <th class="py-2 pr-2 font-medium">摘要</th>
                            </tr>
                        </thead><tbody>`;
                const rows = list.map((r) => {
                    const coin = r.best_coin || (r.best_symbol || '').replace('USDT', '') || '--';
                    const sym = r.best_symbol || '';
                    const perpPair = perpSymToPairLabel(sym);
                    const coinCell = perpPair
                        ? `<button type="button" class="s6-sym-pick font-semibold text-accent hover:underline decoration-accent/40" data-perp-pair="${perpPair.replace(/"/g, '&quot;')}">${escHtml(coin)}</button>`
                        : escHtml(coin);
                    const dir = r.best_direction === 'short' ? '空' : r.best_direction === 'long' ? '多' : '--';
                    const reason = (r.best_reason || '').slice(0, 72) + ((r.best_reason || '').length > 72 ? '…' : '');
                    const tid = r.trade_id ? escHtml(String(r.trade_id)) : '';
                    const act = s6ActionLabel(r.action);
                    const actHtml = tid ? `${escHtml(act)} <span class="text-text-muted font-mono">#${tid}</span>` : escHtml(act);
                    return `<tr class="border-b border-border/60 hover:bg-surface-light/30">
                        <td class="py-2 pr-2 text-text-secondary whitespace-nowrap">${escHtml(fmtS2RecordedAt(r.recorded_at))}</td>
                        <td class="py-2 pr-2">${coinCell}</td>
                        <td class="py-2 pr-2 font-mono">${escHtml(r.best_strength || '--')}</td>
                        <td class="py-2 pr-2">${escHtml(dir)}</td>
                        <td class="py-2 pr-2 whitespace-nowrap">${actHtml}</td>
                        <td class="py-2 pr-2 text-text-secondary">${escHtml(reason)}</td>
                    </tr>`;
                }).join('');
                sigBody.innerHTML = head + rows + '</tbody></table>';
                sigBody.querySelectorAll('.s6-sym-pick[data-perp-pair]').forEach((btn) => {
                    btn.addEventListener('click', () => openBinanceFuturesByPair(btn.getAttribute('data-perp-pair')));
                });
            }
            let posHead = '';
            if (initB != null && bal != null && !Number.isNaN(bal)) {
                posHead = `<div class="text-text-secondary text-xs mb-3">初始 ${initB.toFixed(0)} U → 当前权益 <span class="text-neon-green font-mono font-semibold">${bal.toFixed(2)} U</span> · 未平 <span class="text-text-primary">${open.length}</span> 笔</div>`;
            }
            if (!open.length) {
                posBody.innerHTML = posHead + '<div class="text-text-muted text-sm py-2">当前无未平仓单。</div>';
                return;
            }
            const thead = `
                <table class="w-full text-left text-xs border-collapse min-w-[480px]">
                    <thead>
                        <tr class="text-text-muted border-b border-border">
                            <th class="py-2 pr-2 font-medium">#</th>
                            <th class="py-2 pr-2 font-medium">币</th>
                            <th class="py-2 pr-2 font-medium">方向</th>
                            <th class="py-2 pr-2 font-medium">杠杆</th>
                            <th class="py-2 pr-2 font-medium">仓位U</th>
                            <th class="py-2 pr-2 font-medium">入场</th>
                            <th class="py-2 pr-2 font-medium">止损</th>
                            <th class="py-2 pr-2 font-medium">止盈</th>
                        </tr>
                    </thead><tbody>`;
            const rowsP = open.map((p) => {
                const sym = p.symbol || '';
                const perpPair = perpSymToPairLabel(sym);
                const coin = sym.replace('USDT', '') || '--';
                const coinCell = perpPair
                    ? `<button type="button" class="s6-pos-pick font-semibold text-accent hover:underline decoration-accent/40" data-perp-pair="${perpPair.replace(/"/g, '&quot;')}">${escHtml(coin)}</button>`
                    : escHtml(coin);
                const dir = p.direction === 'short' ? '空' : p.direction === 'long' ? '多' : '--';
                return `<tr class="border-b border-border/60">
                    <td class="py-2 pr-2 font-mono">${escHtml(p.id || '')}</td>
                    <td class="py-2 pr-2">${coinCell}</td>
                    <td class="py-2 pr-2">${escHtml(dir)}</td>
                    <td class="py-2 pr-2 font-mono">${escHtml(String(p.leverage || ''))}</td>
                    <td class="py-2 pr-2 text-text-secondary">${p.position_usd != null ? escHtml(Number(p.position_usd).toFixed(2)) : '--'}</td>
                    <td class="py-2 pr-2 font-mono text-text-secondary">${p.entry_price != null ? escHtml(String(p.entry_price)) : '--'}</td>
                    <td class="py-2 pr-2 font-mono text-neon-red/90">${p.stop_loss != null ? escHtml(String(p.stop_loss)) : '--'}</td>
                    <td class="py-2 pr-2 font-mono text-neon-green/90">${p.take_profit != null ? escHtml(String(p.take_profit)) : '--'}</td>
                </tr>`;
            }).join('');
            posBody.innerHTML = posHead + thead + rowsP + '</tbody></table>';
            posBody.querySelectorAll('.s6-pos-pick[data-perp-pair]').forEach((btn) => {
                btn.addEventListener('click', () => openBinanceFuturesByPair(btn.getAttribute('data-perp-pair')));
            });
        }

        async function loadS6AutonomousAlpha() {
            const sigBody = document.getElementById('s6-signals-body');
            const posBody = document.getElementById('s6-positions-body');
            const tsEl = document.getElementById('s6-alpha-ts');
            const btn = document.getElementById('s6-alpha-refresh');
            if (!sigBody || !posBody) return;
            if (btn) btn.disabled = true;
            try {
                sigBody.innerHTML = '<div class="text-text-muted text-sm animate-pulse py-2">加载中…</div>';
                posBody.innerHTML = '<div class="text-text-muted text-sm animate-pulse py-2">加载中…</div>';
                const data = await API.s6AutonomousAlpha();
                if (data && data.ok) {
                    fillS6AutonomousAlpha(data, sigBody, posBody, tsEl);
                } else {
                    if (tsEl) tsEl.textContent = '';
                    sigBody.innerHTML = '<div class="text-warn text-sm">接口返回异常</div>';
                    posBody.innerHTML = '';
                }
            } catch (e) {
                console.error('s6 alpha:', e);
                if (tsEl) tsEl.textContent = '';
                const msg = e && e.message ? String(e.message) : '加载失败';
                sigBody.innerHTML = `<div class="text-neon-red text-sm">${escHtml(msg)}</div>`;
                posBody.innerHTML = '';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function loadS2FundingSignals() {
            const body = document.getElementById('s2-signals-body');
            const tsEl = document.getElementById('s2-signals-ts');
            const btn = document.getElementById('s2-signals-refresh');
            if (!body || !tsEl) return;
            if (btn) btn.disabled = true;
            try {
                body.innerHTML = '<div class="text-text-muted text-sm animate-pulse py-2">加载中…</div>';
                const data = await API.s2FundingSignals();
                if (data && data.ok) {
                    fillS2FundingSignals(data, body, tsEl);
                } else {
                    tsEl.textContent = '';
                    body.innerHTML = '<div class="text-warn text-sm">接口返回异常</div>';
                }
            } catch (e) {
                console.error('s2 signals:', e);
                tsEl.textContent = '';
                const msg = e && e.message ? String(e.message) : '加载失败';
                body.innerHTML = `<div class="text-neon-red text-sm">${escHtml(msg)}</div>`;
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        /** 与 hydrateWorthHighlightBoards 同源（重点关注已并入「值得关注 · 历史记录」Tab） */
        async function hydrateFocusWatchBoard(snapshotPayload) {
            return hydrateWorthHighlightBoards(snapshotPayload);
        }

        function fmtZctPx(v, decimals) {
            if (v == null || v === '' || Number.isNaN(Number(v))) return '—';
            return Number(v).toLocaleString(undefined, { maximumFractionDigits: decimals });
        }


        function momDisplayStatus(row) {
            const side = String(row.side || '').toUpperCase();
            if (!row.outcome && (side === 'LONG' || side === 'SHORT')) return '持仓中';
            if (row.outcome) return String(row.outcome);
            return '—';
        }

        function momFilterRows(items, status, symbolQ) {
            const sym = (symbolQ || '').trim().toUpperCase();
            return (items || []).filter((row) => {
                const side = String(row.side || '').toUpperCase();
                const open = !row.outcome && (side === 'LONG' || side === 'SHORT');
                const settled = !!row.outcome;
                if (status === 'open' && !open) return false;
                if (status === 'settled' && !settled) return false;
                if (sym && !String(row.symbol || '').toUpperCase().includes(sym)) return false;
                return true;
            });
        }

        function renderMomSummary(sum) {
            const el = document.getElementById('mom-summary');
            if (!el) return;
            if (!sum || !sum.ok) { el.innerHTML = ''; return; }
            const pnl = Number(sum.total_pnl_usdt) || 0;
            const u = Number(sum.unrealized_pnl_usdt) || 0;
            const pnlCls = pnl >= 0 ? 'text-neon-green' : 'text-neon-red';
            const uCls = u >= 0 ? 'text-neon-green' : 'text-neon-red';
            const wr = sum.win_rate != null ? (Number(sum.win_rate) * 100).toFixed(1) + '%' : '—';
            const tgt = `${escHtml(sum.last_long_target || '—')} / ${escHtml(sum.last_short_target || '—')}`;
            const lev = sum.leverage != null ? Number(sum.leverage) : null;
            const notional = sum.notional_usdt != null ? Number(sum.notional_usdt) : null;
            const levTxt = lev != null && Number.isFinite(lev) ? String(lev) : '—';
            const notionalTxt = notional != null && Number.isFinite(notional) ? fmtZctPx(notional, 2) : '—';
            el.innerHTML = `
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">持仓腿</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.open_positions ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">系数 / 名义U</div>
                    <div class="text-sm font-semibold font-mono text-text-primary">${escHtml(levTxt)} · ${escHtml(notionalTxt)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">结算笔数</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.settled_count ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">已实现 U</div>
                    <div class="text-lg font-semibold font-mono ${pnlCls}">${fmtZctPx(pnl, 4)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">浮盈 U</div>
                    <div class="text-lg font-semibold font-mono ${uCls}">${fmtZctPx(u, 4)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2 col-span-2">
                    <div class="text-text-muted text-[10px] tracking-wide">最近目标 多/空</div>
                    <div class="text-[11px] font-mono text-text-secondary">${tgt}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] tracking-wide">胜率</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(wr)}</div>
                </div>`;
        }

        const LANE_BOARD_MAX_ROWS = 20;

        function laneBoardScrollHint(total) {
            if (!total || total <= LANE_BOARD_MAX_ROWS) return '';
            return '<p class="text-text-muted text-[10px] mt-2">共 ' + escHtml(String(total)) + ' 条，区域内可滚动查看（约 '
                + LANE_BOARD_MAX_ROWS + ' 行视口）</p>';
        }

        function renderMomTable(items, totalHint) {
            const root = document.getElementById('mom-root');
            if (!root) return;
            const total = (items && items.length) || 0;
            const head = `
                <table class="w-full text-left text-xs border-collapse min-w-[1100px]">
                    <thead>
                        <tr class="border-b border-border/80 text-text-muted uppercase tracking-wide text-[10px]">
                            <th class="py-2 pr-2">#</th>
                            <th class="py-2 pr-2">UTC</th>
                            <th class="py-2 pr-2">标的</th>
                            <th class="py-2 pr-2">腿</th>
                            <th class="py-2 pr-2">事件</th>
                            <th class="py-2 pr-2 text-right">入场</th>
                            <th class="py-2 pr-2 text-right">现价</th>
                            <th class="py-2 pr-2 text-right">名义U</th>
                            <th class="py-2 pr-2">状态</th>
                            <th class="py-2 pr-2 text-right">盈亏U</th>
                            <th class="py-2 pr-2">规则</th>
                        </tr>
                    </thead>
                    <tbody>`;
            if (!items || !items.length) {
                root.innerHTML = head + '</tbody></table><p class="text-text-muted text-xs mt-2">'
                    + escHtml(totalHint || '暂无记录；维护面板可手动「动量扫描」') + '</p>';
                return;
            }
            const rows = items.map((row) => {
                const st = momDisplayStatus(row);
                const open = st === '持仓中';
                const pnl = open ? row.unrealized_pnl_usdt : row.pnl_usdt;
                const pnlCls = pxClass(Number(pnl));
                return `<tr class="border-b border-border/60 hover:bg-surface-light/30">
                    <td class="py-2 pr-2 font-mono">${escHtml(String(row.id))}</td>
                    <td class="py-2 pr-2 font-mono text-[11px]">${escHtml(String(row.recorded_at_utc || '').replace('T',' ').replace('Z',''))}</td>
                    <td class="py-2 pr-2 font-mono">${escHtml(row.symbol)}</td>
                    <td class="py-2 pr-2 ${zctSideClass(row.side)}">${escHtml(row.side)}</td>
                    <td class="py-2 pr-2">${escHtml(row.signal_type || '—')}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.entry_price, 6)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.mark_price, 6)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.virtual_notional_usdt, 4)}</td>
                    <td class="py-2 pr-2">${escHtml(st)}</td>
                    <td class="py-2 pr-2 font-mono text-right ${pnlCls}">${fmtZctPx(pnl, 4)}</td>
                    <td class="py-2 pr-2 text-text-muted">${escHtml(row.exit_rule || '—')}</td>
                </tr>`;
            }).join('');
            root.innerHTML = head + rows + '</tbody></table>' + laneBoardScrollHint(total);
        }

        async function clearTopTraderData() {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-top-trader-clear');
            if (!getMaintenanceToken()) {
                const hint = '请先在维护面板保存维护令牌（与 NEXT_K_MAINTENANCE_TOKEN 一致）';
                if (maintMsg) maintMsg.innerHTML = '<span class="text-warn">' + escHtml(hint) + '</span>';
                else alert(hint);
                return;
            }
            if (!confirm(
                '确定清空大户多空快照？\n'
                    + '将删除 top_trader_snapshots 表与 top_trader_snapshot.json，不可撤销。',
            )) {
                return;
            }
            if (btn) btn.disabled = true;
            if (maintMsg) maintMsg.textContent = '大户多空清库请求中…';
            try {
                const out = await API.topTraderClear();
                const line = '大户多空已清库 · rows='
                    + escHtml(String(out.deleted_top_trader_rows ?? 0))
                    + ' · disk='
                    + escHtml(out.disk_snapshot_removed ? '已删' : '无');
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-green">' + line + '</span>';
            } catch (e) {
                console.error(e);
                const err = escHtml(e && e.message ? String(e.message) : '清库失败');
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">' + err + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function clearMomLaneData() {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-mom-clear-db');
            if (!getMaintenanceToken()) {
                const hint = '请先在维护面板保存维护令牌（与 NEXT_K_MAINTENANCE_TOKEN 一致）';
                if (maintMsg) maintMsg.innerHTML = '<span class="text-warn">' + escHtml(hint) + '</span>';
                else alert(hint);
                return;
            }
            if (!confirm(
                '确定清空动量策略全部纸面数据？\n'
                    + '将删除 mom_signals、mom_settlements、mom_runs，不可撤销。',
            )) {
                return;
            }
            if (btn) btn.disabled = true;
            if (maintMsg) maintMsg.textContent = '动量清库请求中…';
            try {
                const out = await API.momClearDb();
                const line = '动量已清库 · signals='
                    + escHtml(String(out.deleted_mom_signals ?? 0))
                    + ' · settlements='
                    + escHtml(String(out.deleted_mom_settlements ?? 0))
                    + ' · runs='
                    + escHtml(String(out.deleted_mom_runs ?? 0));
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-green">' + line + '</span>';
                await hydrateMomBoard();
            } catch (e) {
                console.error(e);
                const err = escHtml(e && e.message ? String(e.message) : '清库失败');
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">' + err + '</span>';
                else alert(e && e.message ? String(e.message) : '清库失败');
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function clearJzLaneData() {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-jz-clear-db');
            if (!getMaintenanceToken()) {
                const hint = '请先在维护面板保存维护令牌';
                if (maintMsg) maintMsg.innerHTML = '<span class="text-warn">' + escHtml(hint) + '</span>';
                else alert(hint);
                return;
            }
            if (!confirm(
                '确定清空接针策略全部纸面数据？\n'
                    + '将删除 jz_signals、jz_settlements、jz_runs，不可撤销。',
            )) {
                return;
            }
            if (btn) btn.disabled = true;
            if (maintMsg) maintMsg.textContent = '接针清库请求中…';
            try {
                const out = await API.jzClearDb();
                const line = '接针已清库 · signals='
                    + escHtml(String(out.deleted_jz_signals ?? 0))
                    + ' · settlements='
                    + escHtml(String(out.deleted_jz_settlements ?? 0))
                    + ' · runs='
                    + escHtml(String(out.deleted_jz_runs ?? 0));
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-green">' + line + '</span>';
                await hydrateJzBoard();
            } catch (e) {
                console.error(e);
                const err = escHtml(e && e.message ? String(e.message) : '清库失败');
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">' + err + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        function laneDisplayStatus(row) {
            if (!row || !row.outcome) return '持仓中';
            if (row.outcome === 'win') return '盈利';
            if (row.outcome === 'loss') return '亏损';
            return '持平';
        }

        function laneFilterRows(items, status, symQ) {
            const statusVal = status || 'all';
            const sym = (symQ || '').trim().toUpperCase();
            return (items || []).filter((row) => {
                const side = String(row.side || '').toUpperCase();
                const open = !row.outcome && (side === 'LONG' || side === 'SHORT');
                const settled = !!row.outcome;
                if (statusVal === 'open' && !open) return false;
                if (statusVal === 'settled' && !settled) return false;
                if (sym && !String(row.symbol || '').toUpperCase().includes(sym)) return false;
                return true;
            });
        }

        function renderJzSummary(sum) {
            const el = document.getElementById('jz-summary');
            if (!el) return;
            if (!sum || !sum.ok) { el.innerHTML = ''; return; }
            const pnl = Number(sum.total_pnl_usdt) || 0;
            const u = Number(sum.unrealized_pnl_usdt) || 0;
            const pnlCls = pnl >= 0 ? 'text-neon-green' : 'text-neon-red';
            const uCls = u >= 0 ? 'text-neon-green' : 'text-neon-red';
            const wr = sum.win_rate != null ? (Number(sum.win_rate) * 100).toFixed(1) + '%' : '—';
            const scanSec = sum.scan_interval_seconds != null ? sum.scan_interval_seconds + 's' : '—';
            const trailSec = sum.trail_scan_interval_seconds != null ? sum.trail_scan_interval_seconds + 's' : '—';
            const lastRun = sum.last_run_utc ? escHtml(String(sum.last_run_utc).replace('T', ' ').replace('Z', '')) : '—';
            el.innerHTML = `
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">持仓数</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.open_positions ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">池上限</div>
                    <div class="text-sm font-semibold font-mono text-text-primary">${escHtml(String(sum.universe_max ?? '—'))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">结算笔数</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.settled_count ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">已实现 U</div>
                    <div class="text-lg font-semibold font-mono ${pnlCls}">${fmtZctPx(pnl, 4)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">浮盈 U</div>
                    <div class="text-lg font-semibold font-mono ${uCls}">${fmtZctPx(u, 4)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2 col-span-2">
                    <div class="text-text-muted text-[10px] tracking-wide">扫描/止盈间隔</div>
                    <div class="text-[11px] font-mono text-text-secondary">${escHtml(scanSec)} / ${escHtml(trailSec)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2 col-span-2">
                    <div class="text-text-muted text-[10px] tracking-wide">最近扫描 UTC</div>
                    <div class="text-[11px] font-mono text-text-secondary">${lastRun}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] tracking-wide">胜率</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(wr)}</div>
                </div>`;
        }

        function renderJzTable(items, totalHint) {
            const root = document.getElementById('jz-root');
            if (!root) return;
            const total = (items && items.length) || 0;
            const head = `
                <table class="w-full text-left text-xs border-collapse min-w-[1150px]">
                    <thead>
                        <tr class="border-b border-border/80 text-text-muted uppercase tracking-wide text-[10px]">
                            <th class="py-2 pr-2">#</th>
                            <th class="py-2 pr-2">UTC</th>
                            <th class="py-2 pr-2">标的</th>
                            <th class="py-2 pr-2">腿</th>
                            <th class="py-2 pr-2 text-right">入场</th>
                            <th class="py-2 pr-2 text-right">现价</th>
                            <th class="py-2 pr-2">档位</th>
                            <th class="py-2 pr-2">状态</th>
                            <th class="py-2 pr-2 text-right">盈亏U</th>
                            <th class="py-2 pr-2">规则</th>
                        </tr>
                    </thead>
                    <tbody>`;
            if (!items || !items.length) {
                root.innerHTML = head + '</tbody></table><p class="text-text-muted text-xs mt-2">'
                    + escHtml(totalHint || '暂无记录；维护面板可「接针扫描」') + '</p>';
                return;
            }
            const rows = items.map((row) => {
                const st = laneDisplayStatus(row);
                const open = st === '持仓中';
                const pnl = open ? row.unrealized_pnl_usdt : row.pnl_usdt;
                const pnlCls = pxClass(Number(pnl));
                return `<tr class="border-b border-border/60 hover:bg-surface-light/30">
                    <td class="py-2 pr-2 font-mono">${escHtml(String(row.id))}</td>
                    <td class="py-2 pr-2 font-mono text-[11px]">${escHtml(String(row.recorded_at_utc || '').replace('T',' ').replace('Z',''))}</td>
                    <td class="py-2 pr-2 font-mono">${escHtml(row.symbol)}</td>
                    <td class="py-2 pr-2 ${zctSideClass(row.side)}">${escHtml(row.side)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.entry_price, 6)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.mark_price, 6)}</td>
                    <td class="py-2 pr-2 text-text-muted">${escHtml(row.trail_tier || '—')}</td>
                    <td class="py-2 pr-2">${escHtml(st)}</td>
                    <td class="py-2 pr-2 font-mono text-right ${pnlCls}">${fmtZctPx(pnl, 4)}</td>
                    <td class="py-2 pr-2 text-text-muted">${escHtml(row.exit_rule || '—')}</td>
                </tr>`;
            }).join('');
            root.innerHTML = head + rows + '</tbody></table>' + laneBoardScrollHint(total);
        }

        async function showJzUniverse() {
            const hint = document.getElementById('jz-universe-hint');
            if (!hint) return;
            hint.classList.remove('hidden');
            hint.textContent = '加载标的池…';
            try {
                const data = await API.jzUniverse();
                const syms = (data.symbols || []).join(', ');
                const meta = data.meta || {};
                const warn = meta.warning ? ' · ' + meta.warning : '';
                const src = meta.source || meta.mode || 'jz_universe';
                const entries = meta.entries || [];
                let detail = '';
                if (entries.length) {
                    detail = entries.slice(0, 8).map((e) =>
                        escHtml(String(e.symbol)) + '(' + escHtml(String(Math.round(Number(e.score) || 0))) + ')'
                    ).join(' ');
                    if (entries.length > 8) detail += '…';
                }
                hint.innerHTML = '<span class="text-neon-blue">' + escHtml(src) + ' ×' + escHtml(String((data.symbols || []).length))
                    + '</span> ' + escHtml(syms || '(空，请先跑 oi 刷新严选)') + (detail ? ' · ' + detail : '') + escHtml(warn);
            } catch (e) {
                hint.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || '加载失败') + '</span>';
            }
        }

        async function hydrateJzBoard() {
            const root = document.getElementById('jz-root');
            const tsEl = document.getElementById('jz-ts');
            if (!root) return;
            root.innerHTML = '<div class="text-text-muted text-sm animate-pulse">加载接针纸面…</div>';
            const [sumRes, sigRes] = await Promise.allSettled([API.jzSummary(), API.jzSignals()]);
            if (sumRes.status === 'fulfilled') {
                renderJzSummary(sumRes.value);
            } else {
                console.error('jiezhen summary:', sumRes.reason);
                renderJzSummary(null);
            }
            if (sigRes.status === 'fulfilled') {
                const all = sigRes.value.signals || [];
                const stEl = document.getElementById('jz-filter-status');
                const symEl = document.getElementById('jz-filter-symbol');
                const filtered = laneFilterRows(all, stEl ? stEl.value : 'all', symEl ? symEl.value : '');
                renderJzTable(filtered, all.length ? '共 ' + all.length + ' 条' : '');
                if (tsEl) tsEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            } else {
                console.error('jiezhen signals:', sigRes.reason);
                const e = sigRes.reason;
                root.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(e && e.message ? String(e.message) : '加载失败') + '</div>';
                if (tsEl) tsEl.textContent = '--';
            }
        }

        async function hydrateMomBoard() {
            const root = document.getElementById('mom-root');
            const tsEl = document.getElementById('mom-ts');
            if (!root) return;
            root.innerHTML = '<div class="text-text-muted text-sm animate-pulse">加载动量纸面…</div>';
            const [sumRes, sigRes] = await Promise.allSettled([API.momSummary(), API.momSignals()]);
            if (sumRes.status === 'fulfilled') {
                renderMomSummary(sumRes.value);
            } else {
                console.error('momentum summary:', sumRes.reason);
                renderMomSummary(null);
            }
            if (sigRes.status === 'fulfilled') {
                const all = sigRes.value.signals || [];
                const stEl = document.getElementById('mom-filter-status');
                const symEl = document.getElementById('mom-filter-symbol');
                const filtered = momFilterRows(all, stEl ? stEl.value : 'all', symEl ? symEl.value : '');
                renderMomTable(filtered, all.length);
                if (tsEl) tsEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            } else {
                console.error('momentum signals:', sigRes.reason);
                const e = sigRes.reason;
                root.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(e && e.message ? String(e.message) : '加载失败') + '</div>';
                if (tsEl) tsEl.textContent = '--';
            }
        }

        function orbAlertPanelClass(severity) {
            if (severity === 'block') return 'border-neon-red/45 bg-neon-red/10';
            if (severity === 'warn') return 'border-warn/45 bg-warn/10';
            return 'border-neon-blue/35 bg-neon-blue/10';
        }

        function orbAlertTitleClass(severity) {
            if (severity === 'block') return 'text-neon-red';
            if (severity === 'warn') return 'text-warn/90';
            return 'text-neon-blue';
        }

        function renderOrbTodayAlerts(today) {
            const el = document.getElementById('orb-today-alerts');
            const meta = document.getElementById('orb-session-meta');
            if (!el) return;
            if (!today || !today.ok) {
                el.innerHTML = '<div class="text-text-muted text-xs">无法加载当日提示</div>';
                if (meta) meta.textContent = '—';
                return;
            }
            const wd = today.weekday ? ' · ' + today.weekday : '';
            const close = today.session_close_time ? ' · 收盘 ' + today.session_close_time + ' ET' : '';
            if (meta) meta.textContent = '会话日 ' + (today.session_date || '—') + wd + close;
            const alerts = today.alerts || [];
            if (!alerts.length) {
                el.innerHTML = '<div class="rounded-lg border border-neon-green/35 bg-neon-green/[0.08] px-3 py-2.5 text-xs leading-relaxed">'
                    + '<b class="text-neon-green font-medium">今日可交易</b>'
                    + '<span class="text-text-secondary"> · 非休市日，无 FOMC / CPI 宏观事件</span></div>';
                return;
            }
            el.innerHTML = alerts.map((a) => {
                const panel = orbAlertPanelClass(a.severity);
                const titleCls = orbAlertTitleClass(a.severity);
                return '<div class="rounded-lg border px-3 py-2.5 text-xs leading-relaxed ' + panel + '">'
                    + '<b class="block font-semibold mb-0.5 ' + titleCls + '">' + escHtml(a.title || a.kind || '提示') + '</b>'
                    + '<span class="text-text-secondary">' + escHtml(a.message || '') + '</span></div>';
            }).join('');
        }

        function renderOrbSummary(sum) {
            const el = document.getElementById('orb-summary');
            const botsEl = document.getElementById('orb-bots');
            if (!el) return;
            if (!sum || !sum.ok) {
                el.innerHTML = '';
                if (botsEl) botsEl.innerHTML = '';
                return;
            }
            const pnl = Number(sum.sum_pnl_usdt) || 0;
            const pnlCls = pnl >= 0 ? 'text-neon-green' : 'text-neon-red';
            const wr = sum.touch_win_rate != null ? (Number(sum.touch_win_rate) * 100).toFixed(1) + '%' : '—';
            const skipTag = sum.today && sum.today.skip_new_entries
                ? '<span class="text-neon-red text-[10px] ml-1">不新开仓</span>' : '';
            const botEq = sum.symbol_bot_equity_usdt != null ? fmtZctPx(sum.symbol_bot_equity_usdt, 0) : '10k';
            el.innerHTML = `
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">机器人${skipTag}</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.symbol_bot_count ?? sum.per_symbol?.length ?? 0))}</div>
                    <div class="text-[10px] text-text-muted">每 bot ${escHtml(botEq)} U · 1% 风险定仓</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">持仓</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.open_positions ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">已结算</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.settled_trades ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">累计 U</div>
                    <div class="text-lg font-semibold font-mono ${pnlCls}">${fmtZctPx(pnl, 4)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] tracking-wide">胜率</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(wr)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2 col-span-2 sm:col-span-1">
                    <div class="text-text-muted text-[10px] tracking-wide">宏观过滤</div>
                    <div class="text-sm font-semibold ${sum.today && sum.today.macro_filter_enabled ? 'text-warn/90' : 'text-text-muted'}">${sum.today && sum.today.macro_filter_enabled ? '已开启' : '未开启'}</div>
                </div>`;
            if (botsEl) {
                const rows = Array.isArray(sum.per_symbol) ? sum.per_symbol : [];
                if (!rows.length) {
                    botsEl.innerHTML = '';
                } else {
                    botsEl.innerHTML = rows.map((b) => {
                        const sym = escHtml(b.symbol || '—');
                        const wallet = Number(b.wallet_balance_usdt) || 0;
                        const rp = Number(b.realized_pnl_usdt) || 0;
                        const rpCls = rp >= 0 ? 'text-neon-green' : 'text-neon-red';
                        const open = b.open_side ? escHtml(String(b.open_side)) : '—';
                        const wrS = b.touch_win_rate != null ? (Number(b.touch_win_rate) * 100).toFixed(0) + '%' : '—';
                        const off = b.enabled === false ? ' opacity-50' : '';
                        return '<div class="rounded-lg border border-border/70 bg-surface-light/25 px-2.5 py-1.5 text-[10px] leading-snug min-w-[7.5rem]' + off + '">'
                            + '<div class="font-semibold text-text-primary">' + sym + '</div>'
                            + '<div class="text-text-muted">钱包 <span class="font-mono text-text-secondary">' + fmtZctPx(wallet, 0) + '</span> U</div>'
                            + '<div class="' + rpCls + ' font-mono">盈亏 ' + fmtZctPx(rp, 2) + ' · 胜率 ' + escHtml(wrS) + '</div>'
                            + '<div class="text-text-muted">持仓 ' + open + '</div></div>';
                    }).join('');
                }
            }
        }

        function orbDisplayStatus(row) {
            if (row && row.status) return String(row.status);
            const side = String(row.side || '').toUpperCase();
            if (!row.outcome && (side === 'LONG' || side === 'SHORT') && row.sl_price != null) return '持仓中';
            if (row.outcome) return String(row.outcome);
            return '观望';
        }

        function renderOrbTable(items, totalHint) {
            const root = document.getElementById('orb-root');
            if (!root) return;
            const total = (items && items.length) || 0;
            const head = `
                <table class="w-full text-left text-xs border-collapse min-w-[1100px]">
                    <thead>
                        <tr class="border-b border-border/80 text-text-muted uppercase tracking-wide text-[10px]">
                            <th class="py-2 pr-2">#</th>
                            <th class="py-2 pr-2">UTC</th>
                            <th class="py-2 pr-2">标的</th>
                            <th class="py-2 pr-2">状态</th>
                            <th class="py-2 pr-2">方向</th>
                            <th class="py-2 pr-2 text-right">入场</th>
                            <th class="py-2 pr-2 text-right">止损</th>
                            <th class="py-2 pr-2 text-right">止盈</th>
                            <th class="py-2 pr-2 text-right">OR高</th>
                            <th class="py-2 pr-2 text-right">OR低</th>
                            <th class="py-2 pr-2 text-right">量比</th>
                            <th class="py-2 pr-2 text-right">盈亏U</th>
                        </tr>
                    </thead>
                    <tbody>`;
            if (!items || !items.length) {
                root.innerHTML = head + '</tbody></table><p class="text-text-muted text-xs mt-2">'
                    + escHtml(totalHint || '暂无记录；维护面板可「ORB 扫描」') + '</p>';
                return;
            }
            const rows = items.map((row) => {
                const st = orbDisplayStatus(row);
                const pnl = row.pnl_usdt != null ? Number(row.pnl_usdt) : null;
                const pnlCls = pnl != null ? pxClass(pnl) : 'text-text-muted';
                const volRatio = (row.volume && row.vol_ma) ? (Number(row.volume) / Number(row.vol_ma)).toFixed(2) : '—';
                const tp = row.tp_price != null ? fmtZctPx(row.tp_price, 4) : 'EoD';
                return `<tr class="border-b border-border/60 hover:bg-surface-light/30">
                    <td class="py-2 pr-2 font-mono">${escHtml(String(row.id ?? '—'))}</td>
                    <td class="py-2 pr-2 font-mono text-[11px]">${escHtml(String(row.recorded_at_utc || '').replace('T',' ').replace('Z',''))}</td>
                    <td class="py-2 pr-2 font-mono">${escHtml(row.symbol)}</td>
                    <td class="py-2 pr-2">${escHtml(st)}</td>
                    <td class="py-2 pr-2 ${zctSideClass(row.side)}">${escHtml(row.side || '—')}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.entry_price, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.sl_price, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${tp}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.or_high, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.or_low, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${escHtml(volRatio)}</td>
                    <td class="py-2 pr-2 font-mono text-right ${pnlCls}">${pnl != null ? fmtZctPx(pnl, 4) : '—'}</td>
                </tr>`;
            }).join('');
            root.innerHTML = head + rows + '</tbody></table>' + laneBoardScrollHint(total);
        }

        let _orbSignalsCache = [];

        function applyOrbTableFilters() {
            const root = document.getElementById('orb-root');
            if (!root) return;
            const stEl = document.getElementById('orb-filter-status');
            const symEl = document.getElementById('orb-filter-symbol');
            const filtered = laneFilterRows(
                _orbSignalsCache,
                stEl ? stEl.value : 'all',
                symEl ? symEl.value : '',
            );
            renderOrbTable(filtered, _orbSignalsCache.length ? '共 ' + _orbSignalsCache.length + ' 条' : '');
        }

        async function clearOrbLaneData() {
            const msg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-orb-clear-db');
            if (btn) btn.disabled = true;
            try {
                if (!confirm('确定清理 ORB 纸面库？\n将删除 orb_signals、orb_settlements、orb_runs、orb_symbol_bots，不可撤销。')) return;
                const out = await API.orbClearDb();
                if (msg) {
                    msg.innerHTML = '<span class="text-neon-green">ORB 已清库</span> signals='
                        + escHtml(String(out.deleted_signals ?? 0))
                        + ' settlements=' + escHtml(String(out.deleted_settlements ?? 0))
                        + ' runs=' + escHtml(String(out.deleted_runs ?? 0));
                }
                await hydrateOrbBoard();
            } catch (e) {
                console.error(e);
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || '失败') + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        function initOrbPanelOnce() {
            if (initOrbPanelOnce._done) return;
            initOrbPanelOnce._done = true;
            document.getElementById('orb-refresh')?.addEventListener('click', () => void hydrateOrbBoard());
            document.getElementById('orb-filter-status')?.addEventListener('change', () => applyOrbTableFilters());
            document.getElementById('orb-filter-symbol')?.addEventListener('input', () => {
                clearTimeout(initOrbPanelOnce._symTimer);
                initOrbPanelOnce._symTimer = setTimeout(() => applyOrbTableFilters(), 280);
            });
            document.getElementById('maint-orb-clear-db')?.addEventListener('click', () => void clearOrbLaneData());
        }

        async function hydrateOrbBoard() {
            const root = document.getElementById('orb-root');
            const tsEl = document.getElementById('orb-ts');
            if (!root) return;
            root.innerHTML = '<div class="text-text-muted text-sm animate-pulse">加载 ORB 纸面…</div>';
            const [sumRes, sigRes] = await Promise.allSettled([API.orbSummary(), API.orbSignals()]);
            if (sumRes.status === 'fulfilled') {
                renderOrbTodayAlerts(sumRes.value.today);
                renderOrbSummary(sumRes.value);
            } else {
                console.error('orb summary:', sumRes.reason);
                renderOrbTodayAlerts(null);
                renderOrbSummary(null);
                try {
                    renderOrbTodayAlerts(await API.orbSessionToday());
                } catch (e2) {
                    console.error('orb session today:', e2);
                }
            }
            if (sigRes.status === 'fulfilled') {
                _orbSignalsCache = sigRes.value.signals || [];
                applyOrbTableFilters();
                if (tsEl) tsEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            } else {
                console.error('orb signals:', sigRes.reason);
                _orbSignalsCache = [];
                const e = sigRes.reason;
                root.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(e && e.message ? String(e.message) : '加载失败') + '</div>';
                if (tsEl) tsEl.textContent = '--';
            }
        }

        let _mqLastSummary = null;

        function mqProfilePnlMap(sum) {
            const map = new Map();
            (sum && Array.isArray(sum.per_profile) ? sum.per_profile : []).forEach((row) => {
                const pid = Number(row.profile_id);
                if (Number.isFinite(pid)) map.set(pid, row);
            });
            return map;
        }

        function mqOpenPnlMap(sum) {
            const map = new Map();
            (sum && Array.isArray(sum.open_by_profile) ? sum.open_by_profile : []).forEach((row) => {
                const pid = Number(row.profile_id);
                if (Number.isFinite(pid)) map.set(pid, row);
            });
            return map;
        }

        function mqFmtSignedPnl(v, digits) {
            const n = Number(v);
            if (!Number.isFinite(n)) return '—';
            return (n > 0 ? '+' : '') + fmtZctPx(n, digits != null ? digits : 2);
        }

        function mqPnlClass(v) {
            const n = Number(v);
            if (!Number.isFinite(n) || n === 0) return 'text-text-muted';
            return n > 0 ? 'text-neon-green' : 'text-neon-red';
        }

        function renderMqRobotPnl(profiles, sum) {
            const el = document.getElementById('mq-robot-pnl');
            if (!el) return;
            const realizedMap = mqProfilePnlMap(sum);
            const openMap = mqOpenPnlMap(sum);
            const list = profiles && profiles.length ? profiles.slice() : [];
            const orphanIds = new Set(realizedMap.keys());
            list.forEach((p) => orphanIds.delete(Number(p.id)));
            if (!list.length && !orphanIds.size) {
                el.innerHTML = '<span class="text-text-muted text-xs">暂无 Profile。加入实仓并产生交易后，此处显示各机器人盈亏。</span>';
                return;
            }
            const cards = [];
            const renderCard = (pid, sym, name, enabled, tplKey) => {
                const r = realizedMap.get(pid);
                const o = openMap.get(pid);
                const realized = r ? Number(r.total_pnl_usdt) : 0;
                const floating = o ? Number(o.unrealized_pnl_usdt) : 0;
                const total = realized + floating;
                const settledN = r ? Number(r.settled_count || 0) : 0;
                const openN = o ? Number(o.open_count || 0) : 0;
                const tpl = MQ_TEMPLATE_LABELS[tplKey] || tplKey || '—';
                const enCls = enabled
                    ? 'border-neon-purple/35 bg-neon-purple/[0.06]'
                    : 'border-border/70 bg-surface/40 opacity-90';
                const status = openN > 0 ? '持仓中' : (enabled ? '启用' : '停用');
                cards.push(
                    '<div class="min-w-[10.5rem] max-w-[14rem] flex-1 rounded-lg border px-2.5 py-2 ' + enCls + '">'
                    + '<div class="flex items-center justify-between gap-1 mb-1">'
                    + '<span class="font-mono text-[11px] font-semibold text-text-primary">#' + escHtml(String(pid)) + ' ' + escHtml(sym) + '</span>'
                    + '<span class="text-[9px] text-text-muted">' + escHtml(status) + '</span></div>'
                    + '<div class="text-[9px] text-text-muted truncate mb-1" title="' + escHtml(name || '') + '">' + escHtml(name || tpl) + '</div>'
                    + '<div class="font-mono text-base font-semibold ' + mqPnlClass(total) + '">' + escHtml(mqFmtSignedPnl(total, 2)) + ' <span class="text-[9px] font-normal text-text-muted">合计U</span></div>'
                    + '<div class="text-[9px] font-mono mt-1 leading-relaxed">'
                    + '<span class="' + mqPnlClass(realized) + '">已实现 ' + escHtml(mqFmtSignedPnl(realized, 2)) + '</span>'
                    + ' · <span class="' + mqPnlClass(floating) + '">浮动 ' + escHtml(mqFmtSignedPnl(floating, 2)) + '</span>'
                    + '<br><span class="text-text-muted">平' + settledN + ' · 持' + openN + '</span></div></div>',
                );
            };
            list.sort((a, b) => {
                const ae = a.enabled ? 0 : 1;
                const be = b.enabled ? 0 : 1;
                if (ae !== be) return ae - be;
                return Number(a.id) - Number(b.id);
            });
            list.forEach((p) => {
                renderCard(
                    Number(p.id),
                    String(p.symbol || '').toUpperCase(),
                    String(p.name || ''),
                    !!p.enabled,
                    String(p.template || 'balanced').toLowerCase(),
                );
            });
            orphanIds.forEach((pid) => {
                const r = realizedMap.get(pid);
                renderCard(
                    pid,
                    r ? String(r.symbol || '').toUpperCase() : '?',
                    '已删Profile',
                    false,
                    '',
                );
            });
            el.innerHTML = cards.join('');
        }

        function renderMqSummary(sum) {
            const el = document.getElementById('mq-summary');
            if (!el) return;
            if (!sum || !sum.ok) {
                _mqLastSummary = null;
                el.innerHTML = '';
                const rp = document.getElementById('mq-robot-pnl');
                if (rp) rp.innerHTML = '';
                return;
            }
            _mqLastSummary = sum;
            const modeLbl = sum.mode === 'paper'
                ? (sum.real_mode ? '纸面 · 实盘通知开/平' : '纸面')
                : String(sum.mode || '纸面');
            const dsEl = document.getElementById('mq-data-source-label');
            if (dsEl) {
                const lbl = sum.data_source_label || sum.data_source || '—';
                const lim = sum.kline_limit != null ? ' · ' + sum.kline_limit + ' bars' : '';
                const modeSuffix = modeLbl ? ' · ' + modeLbl : '';
                dsEl.textContent = lbl + lim + modeSuffix;
                dsEl.className = 'text-[10px] text-text-muted font-mono';
            }
            if (sum.max_active_profiles != null) {
                MQ_MAX_ENABLED = Number(sum.max_active_profiles) || 5;
            }
            if (sum.pool_governance) {
                _mqGovernanceMeta = sum.pool_governance;
                _mqGovernanceBySymbol = new Map();
                (sum.pool_governance.profiles || []).forEach((p) => {
                    _mqGovernanceBySymbol.set(String(p.symbol || '').toUpperCase(), p);
                });
                (sum.pool_governance.symbol_streaks || []).forEach((s) => {
                    const sym = String(s.symbol || '').toUpperCase();
                    if (!_mqGovernanceBySymbol.has(sym)) {
                        _mqGovernanceBySymbol.set(sym, s);
                    }
                });
                const govMax = document.getElementById('mq-gov-max-enabled');
                if (govMax && sum.pool_governance.max_auto_enabled != null) {
                    govMax.textContent = String(sum.pool_governance.max_auto_enabled);
                }
            }
            const schedEl = document.getElementById('mq-daily-schedule');
            if (schedEl && sum.daily_optimize_utc) {
                schedEl.textContent = String(sum.daily_optimize_utc);
            }
            const dailyBadge = document.getElementById('mq-daily-enabled-badge');
            if (dailyBadge) {
                const on = sum.daily_optimize_enabled !== false;
                dailyBadge.textContent = on ? '每日定时已开启' : '每日定时已关闭';
                dailyBadge.className = on ? 'text-neon-green' : 'text-warn';
            }
            const pnl = Number(sum.total_pnl_usdt) || 0;
            const pnlCls = pnl >= 0 ? 'text-neon-green' : 'text-neon-red';
            const modeCls = 'text-neon-purple';
            const wInit = Number(sum.wallet_initial_usdt);
            const wBal = Number(sum.wallet_balance_usdt);
            const equity = Number(sum.equity_usdt);
            const upnl = Number(sum.unrealized_pnl_usdt);
            const walletInitKnown = Number.isFinite(wInit);
            const walletBalKnown = Number.isFinite(wBal);
            const equityKnown = Number.isFinite(equity);
            const walletInit = walletInitKnown ? wInit : null;
            const walletBal = walletBalKnown ? wBal : null;
            const profileCap = Number(sum.profile_capital_usdt);
            const profileCapTxt = Number.isFinite(profileCap) ? fmtZctPx(profileCap, 0) : '1000';
            const capLbl = document.getElementById('mq-profile-cap-label');
            if (capLbl) capLbl.textContent = profileCapTxt;
            const balCls = equityKnown && walletInitKnown
                ? (equity >= walletInit ? 'text-neon-green' : 'text-neon-red')
                : (walletBalKnown && walletInitKnown
                    ? (walletBal >= walletInit ? 'text-neon-green' : 'text-neon-red')
                    : 'text-text-primary');
            const walletValue = equityKnown
                ? fmtZctPx(equity, 2)
                : (walletBalKnown ? fmtZctPx(walletBal, 2) : '—');
            const pCount = Number(sum.profile_count);
            const walletDetail = walletBalKnown
                ? `初始 ${walletInitKnown ? fmtZctPx(walletInit, 0) : '—'}`
                    + (Number.isFinite(pCount) && pCount > 0
                        ? `（${pCount}×${profileCapTxt}U）` : '')
                    + ` · 已实现 <span class="${pnlCls}">${mqFmtSignedPnl(pnl, 2)}</span>`
                    + (Number.isFinite(upnl) ? ` · 浮盈 <span class="${upnl >= 0 ? 'text-neon-green' : 'text-neon-red'}">${mqFmtSignedPnl(upnl, 2)}</span>` : '')
                    + ` · 每机器人 ${profileCapTxt} U`
                : '—';
            const protoLev = sum.leverage != null
                ? Number(sum.leverage)
                : null;
            el.innerHTML = `
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">Moss 杠杆</div>
                <div class="text-lg font-semibold">${protoLev != null && Number.isFinite(protoLev) ? escHtml(String(protoLev) + 'x') : '—'}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-neon-purple/25 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">纸面总权益</div>
                    <div class="text-lg font-semibold font-mono ${balCls}">${walletValue}</div>
                    <div class="text-[9px] text-text-muted font-mono">${walletDetail}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">启用机器人</div>
                    <div class="text-lg font-semibold">${escHtml(String(sum.enabled_profiles ?? 0))}<span class="text-sm text-text-muted font-normal">/${escHtml(String(MQ_MAX_ENABLED))}</span></div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">纸面持仓</div>
                    <div class="text-lg font-semibold">${escHtml(String(sum.open_positions ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">数据源</div>
                    <div class="text-sm font-semibold ${modeCls}">${escHtml(modeLbl || '—')}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">已结算（全账户）</div>
                    <div class="text-lg font-semibold">${escHtml(String(sum.settled_count ?? 0))}</div>
                </div>`;
            if (_mqProfilesCache.length) {
                renderMqRobotPnl(_mqProfilesCache, sum);
                renderMqProfilesList(_mqProfilesCache, _mqLastPaperScan, sum);
            }
        }

        let MQ_MAX_ENABLED = 5;
        let _mqGovernanceBySymbol = new Map();
        let _mqGovernanceMeta = {};
        const MQ_TEMPLATE_LABELS = {
            balanced: '均衡 balanced',
            momentum: '动量 momentum',
            trend: '趋势 trend',
            mean_revert: '均值回归 mean_revert',
        };
        const MQ_TEMPLATE_HINTS = {
            balanced: '均衡 balanced：趋势30%·动量25%·均值回归15%·成交量15%·波动15%，通用默认。',
            momentum: '动量 momentum：动量权重50%，顺势波段，震荡市可能假信号偏多。',
            trend: '趋势 trend：趋势权重50%，适合单边行情，震荡市易磨损。',
            mean_revert: '均值回归 mean_revert：均值回归45%，适合箱体震荡，强趋势市慎用。',
        };
        /** Regime → 推荐策略（与 Moss 决策逻辑一致，供前端展示） */
        const MQ_REGIME_STRATEGY = {
            BULL: {
                title: 'BULL 多头趋势',
                primary: ['trend', 'momentum'],
                secondary: ['balanced'],
                avoid: ['mean_revert'],
                tip: '单边上涨：顺势 trend / momentum',
            },
            BEAR: {
                title: 'BEAR 空头趋势',
                primary: ['trend', 'momentum'],
                secondary: ['balanced'],
                avoid: ['mean_revert'],
                tip: '单边下跌：顺势 trend / momentum',
            },
            SIDEWAYS: {
                title: 'SIDEWAYS 震荡',
                primary: ['mean_revert'],
                secondary: ['balanced'],
                avoid: ['trend', 'momentum'],
                tip: '箱体震荡：mean_revert / balanced',
            },
        };
        const MQ_TEMPLATE_REGIME_HINT = {
            balanced: '行情：三种均可；震荡或不确定时首选。',
            momentum: '行情：适合 BULL / BEAR 顺势波段。',
            trend: '行情：适合 BULL / BEAR 强趋势。',
            mean_revert: '行情：适合 SIDEWAYS 箱体；强趋势慎用。',
        };
        let _mqUniverseSymbols = null;
        let _mqLastPaperScan = null;

        function mqNormRegime(r) {
            const u = String(r || '').toUpperCase();
            return MQ_REGIME_STRATEGY[u] ? u : '';
        }

        function mqRegimeMapFromScan(scan) {
            const map = new Map();
            const details = (scan && scan.details) || [];
            details.forEach((d) => {
                if (!d || d.profile_id == null) return;
                const rg = mqNormRegime(d.regime);
                if (rg) map.set(Number(d.profile_id), rg);
            });
            return map;
        }

        function mqTemplateFit(template, regime) {
            const tpl = (template || 'balanced').toLowerCase();
            const rg = mqNormRegime(regime);
            if (!rg) return 'unknown';
            const spec = MQ_REGIME_STRATEGY[rg];
            if ((spec.primary || []).includes(tpl)) return 'match';
            if ((spec.avoid || []).includes(tpl)) return 'warn';
            return 'ok';
        }

        function mqFormatRecommend(regime) {
            const rg = mqNormRegime(regime);
            if (!rg) return '—';
            const spec = MQ_REGIME_STRATEGY[rg];
            const prim = (spec.primary || []).map((t) => MQ_TEMPLATE_LABELS[t] || t).join('、');
            const sec = (spec.secondary || []).map((t) => MQ_TEMPLATE_LABELS[t] || t).join('、');
            let s = '推荐 ' + prim;
            if (sec) s += ' · 次选 ' + sec;
            return s;
        }

        function mqRegimeBadgeHtml(regime) {
            const rg = mqNormRegime(regime);
            if (!rg) return '<span class="text-text-muted">—</span>';
            const cls = rg === 'BULL'
                ? 'text-neon-green border-neon-green/35 bg-neon-green/10'
                : rg === 'BEAR'
                    ? 'text-neon-red border-neon-red/35 bg-neon-red/10'
                    : 'text-text-secondary border-border/80 bg-surface-light/60';
            return '<span class="inline-block text-[10px] font-mono px-1.5 py-0.5 rounded border ' + cls + '">' + escHtml(rg) + '</span>';
        }

        function mqFitBadgeHtml(fit) {
            if (fit === 'match') {
                return '<span class="text-[10px] text-neon-green">✓ 匹配</span>';
            }
            if (fit === 'warn') {
                return '<span class="text-[10px] text-warn">⚠ 非最优</span>';
            }
            if (fit === 'ok') {
                return '<span class="text-[10px] text-text-muted">○ 可用</span>';
            }
            return '';
        }

        function mqEnabledCount(profiles) {
            return (profiles || []).filter((p) => p.enabled).length;
        }

        function mqTakenSymbols(profiles, excludeId) {
            const out = new Set();
            (profiles || []).forEach((p) => {
                if (!p.enabled) return;
                if (excludeId != null && Number(p.id) === Number(excludeId)) return;
                if (p.symbol) out.add(String(p.symbol).toUpperCase());
            });
            return out;
        }

        function updateMqTemplateHint() {
            const sel = document.getElementById('mq-create-template');
            const hint = document.getElementById('mq-template-hint');
            if (!sel || !hint) return;
            const key = sel.value || 'balanced';
            const base = MQ_TEMPLATE_HINTS[key] || MQ_TEMPLATE_HINTS.balanced;
            const regimeLine = MQ_TEMPLATE_REGIME_HINT[key] || '';
            hint.textContent = base + (regimeLine ? ' ' + regimeLine : '');
        }

        function updateMqCreateFormState(profiles) {
            const enabledN = mqEnabledCount(profiles);
            const countEl = document.getElementById('mq-profiles-count');
            if (countEl) countEl.textContent = '启用 ' + enabledN + '/' + MQ_MAX_ENABLED;
            const chk = document.getElementById('mq-create-enabled');
            const btn = document.getElementById('mq-create-btn');
            const atCap = enabledN >= MQ_MAX_ENABLED;
            if (chk) {
                chk.disabled = atCap;
                if (atCap) chk.checked = false;
            }
            if (btn) btn.disabled = false;
        }

        async function ensureMqUniverseDatalist() {
            if (_mqUniverseSymbols && _mqUniverseSymbols.length) return _mqUniverseSymbols;
            try {
                const data = await API.mqUniverse();
                _mqUniverseSymbols = (data.symbols || []).map((s) => String(s.symbol || '').toUpperCase()).filter(Boolean);
            } catch (e) {
                console.warn('mq universe:', e);
                _mqUniverseSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
            }
            const dl = document.getElementById('mq-symbol-datalist');
            if (dl) {
                dl.innerHTML = _mqUniverseSymbols.slice(0, 120).map((s) => '<option value="' + escHtml(s) + '"></option>').join('');
            }
            return _mqUniverseSymbols;
        }

        function mqProfileSourceBadge(src) {
            const s = String(src || 'manual');
            if (s === 'governance_auto') {
                return '<span class="text-[9px] font-mono text-neon-green border border-neon-green/30 rounded px-1 ml-1" title="池子治理自动">自动</span>';
            }
            if (s === 'from_daily') {
                return '<span class="text-[9px] font-mono text-neon-yellow border border-neon-yellow/30 rounded px-1 ml-1">寻优</span>';
            }
            if (s === 'daily_auto') {
                return '<span class="text-[9px] font-mono text-text-muted border border-border/60 rounded px-1 ml-1" title="历史自动 Profile">legacy</span>';
            }
            return '<span class="text-[9px] font-mono text-text-muted border border-border/60 rounded px-1 ml-1">手动</span>';
        }

        function mqGovernanceHealthLabel(symRaw, enabledInPaper, dailySummary) {
            const sym = String(symRaw || '').toUpperCase();
            const g = _mqGovernanceBySymbol.get(sym) || {};
            const prof = (_mqProfilesCache || []).find(
                (p) => String(p.symbol || '').toUpperCase() === sym,
            );
            const manualLock = !!(g.governance_manual_lock || (prof && prof.governance_manual_lock));
            const tier = String(g.last_pool_tier || '').toUpperCase();
            const deg = Number(g.degrade_streak) || 0;
            const up = Number(g.upgrade_streak) || 0;
            const needUp = Number(_mqGovernanceMeta.upgrade_streak) || 2;
            const degB = Number(_mqGovernanceMeta.degrade_streak_b) || 2;
            const degC = Number(_mqGovernanceMeta.degrade_streak_c) || 1;
            const ds = dailySummary || {};
            const syncOk = ds.sync_allowed === true;
            const syncBlock = ds.sync_block_reason || ds.pool_reason || '';
            if (enabledInPaper) {
                if (tier === 'C' && deg >= degC) {
                    return { label: '风险', cls: 'text-neon-red border-neon-red/35 bg-neon-red/10', title: 'C 池 · 已/将自动停用' };
                }
                if (tier === 'B' && deg >= degB) {
                    return { label: '风险', cls: 'text-neon-red border-neon-red/35 bg-neon-red/10', title: '连续 B 池 · 已/将自动停用' };
                }
                if (tier === 'B') {
                    return { label: '观察', cls: 'text-neon-blue border-neon-blue/35 bg-neon-blue/10', title: '验证未过 · 连续 B 将自动停' };
                }
                if (tier === 'A' && ds.sync_allowed === false) {
                    return {
                        label: '观察',
                        cls: 'text-neon-blue border-neon-blue/35 bg-neon-blue/10',
                        title: syncBlock || 'A 池 · 本批不可同步',
                    };
                }
                if (tier === 'A') {
                    return { label: '正常', cls: 'text-neon-green border-neon-green/35 bg-neon-green/10', title: 'A 池 · 参数可同步' };
                }
            } else if (g.auto_enable_eligible && !manualLock) {
                return {
                    label: '可补位',
                    cls: 'text-neon-purple border-neon-purple/35 bg-neon-purple/10',
                    title: '可同步 Top5 · 连续达标 · 下次每日寻优将自动启用',
                };
            } else if (manualLock) {
                return { label: '手动锁', cls: 'text-warn/90 border-warn/35 bg-warn/10', title: '手动停用 · 不再自动启用' };
            }
            if (tier === 'A' || tier === 'B' || tier === 'C') {
                let title = '升级 ' + up + '/' + needUp;
                if (tier === 'A' && up > 0 && !syncOk && syncBlock) {
                    title += ' · 本批不可同步：' + syncBlock;
                } else if (tier === 'A' && up >= needUp && !syncOk) {
                    title += ' · 需可同步且位列可同步 Top5';
                }
                return { label: tier, cls: 'text-text-muted border-border/70', title };
            }
            return { label: '—', cls: 'text-text-muted border-border/70', title: '' };
        }

        function mqGovernanceHealthBadge(symRaw, enabledInPaper, dailySummary) {
            const h = mqGovernanceHealthLabel(symRaw, enabledInPaper, dailySummary);
            return '<span class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ' + h.cls + '" title="' + escHtml(h.title || h.label) + '">' + escHtml(h.label) + '</span>';
        }

        function renderMqProfilesList(profiles, scan, sum) {
            const list = document.getElementById('mq-profiles-list');
            if (!list) return;
            updateMqCreateFormState(profiles);
            const regimeMap = mqRegimeMapFromScan(scan || _mqLastPaperScan);
            const realizedMap = mqProfilePnlMap(sum || _mqLastSummary);
            const openMap = mqOpenPnlMap(sum || _mqLastSummary);
            if (!profiles || !profiles.length) {
                list.innerHTML = '<p class="text-text-muted text-xs">暂无实仓 Profile。可在「每日最优」或「市值扩展」看板点「加入实仓」。</p>';
                return;
            }
            const rows = profiles.map((p) => {
                const on = !!p.enabled;
                const sym = escHtml(p.symbol || '');
                const tplKey = (p.template || 'balanced').toLowerCase();
                const tpl = escHtml(MQ_TEMPLATE_LABELS[tplKey] || tplKey);
                const srcBadge = mqProfileSourceBadge(p.profile_source);
                const govBadge = mqGovernanceHealthBadge(p.symbol, on);
                const gov = _mqGovernanceBySymbol.get(String(p.symbol || '').toUpperCase());
                const streakTxt = gov
                    ? ('↑' + (gov.upgrade_streak || 0) + ' ↓' + (gov.degrade_streak || 0))
                    : '—';
                const pid = Number(p.id);
                const r = realizedMap.get(pid);
                const o = openMap.get(pid);
                const realized = r ? Number(r.total_pnl_usdt) : 0;
                const floating = o ? Number(o.unrealized_pnl_usdt) : 0;
                const total = realized + floating;
                const settledN = r ? Number(r.settled_count || 0) : 0;
                const openN = o ? Number(o.open_count || 0) : 0;
                return `<tr class="border-b border-border/50 hover:bg-surface-light/25">
                    <td class="py-1.5 pr-2 font-mono text-[10px]">#${escHtml(String(p.id))}</td>
                    <td class="py-1.5 pr-2">${escHtml(p.name || '')}${srcBadge}</td>
                    <td class="py-1.5 pr-2 font-mono">${sym}</td>
                    <td class="py-1.5 pr-2 text-[10px]">${tpl}</td>
                    <td class="py-1.5 pr-2 text-right font-mono ${mqPnlClass(realized)}">${escHtml(mqFmtSignedPnl(realized, 2))}</td>
                    <td class="py-1.5 pr-2 text-right font-mono ${mqPnlClass(floating)}">${escHtml(mqFmtSignedPnl(floating, 2))}</td>
                    <td class="py-1.5 pr-2 text-right font-mono font-semibold ${mqPnlClass(total)}">${escHtml(mqFmtSignedPnl(total, 2))}</td>
                    <td class="py-1.5 pr-2 text-right font-mono text-[10px] text-text-muted">${escHtml(String(settledN))}/${escHtml(String(openN))}</td>
                    <td class="py-1.5 pr-2">${govBadge}<span class="text-[9px] font-mono text-text-muted ml-1">${escHtml(streakTxt)}</span></td>
                    <td class="py-1.5 pr-2">
                        <button type="button" data-mq-toggle="${escHtml(String(p.id))}" data-mq-enabled="${on ? '0' : '1'}"
                            class="text-[10px] px-2 py-0.5 rounded border ${on ? 'border-neon-purple/40 text-neon-purple bg-neon-purple/10' : 'border-border text-text-muted hover:border-neon-purple/30'}">
                            ${on ? '已启用' : '启用'}
                        </button>
                    </td>
                    <td class="py-1.5 pr-2">
                        <button type="button" data-mq-delete="${escHtml(String(p.id))}"
                            class="text-[10px] px-2 py-0.5 rounded border border-warn/40 text-warn/90 hover:bg-warn/10">
                            删除
                        </button>
                    </td>
                </tr>`;
            }).join('');
            list.innerHTML = `<table class="w-full text-left text-xs border-collapse min-w-[880px]">
                <thead><tr class="text-text-muted text-[10px] uppercase">
                    <th class="py-1 pr-2">ID</th><th class="py-1 pr-2">名称</th><th class="py-1 pr-2">标的</th>
                    <th class="py-1 pr-2">策略</th>
                    <th class="py-1 pr-2 text-right">已实现U</th>
                    <th class="py-1 pr-2 text-right">浮动U</th>
                    <th class="py-1 pr-2 text-right">合计U</th>
                    <th class="py-1 pr-2 text-right" title="已平仓/持仓中">平/持</th>
                    <th class="py-1 pr-2">寻优</th>
                    <th class="py-1 pr-2">状态</th><th class="py-1 pr-2">操作</th>
                </tr></thead><tbody>${rows}</tbody></table>`;
        }

        const MQ_SCAN_REASON_LABELS = {
            composite_below_threshold: '综合分未达开仓阈值',
            no_discrete_signal: '无明确方向信号',
            signal_long: '多头信号',
            signal_short: '空头信号',
        };

        const MQ_SCAN_ACTION_ORDER = { open: 0, close: 1, hold: 2, wait: 3, error: 4 };

        function mqParseScanLabel(label) {
            const raw = String(label || '');
            const m = raw.match(/^p(\d+):([^:]+):(.+)$/i);
            if (!m) return { pid: '', symbol: raw, template: '' };
            return { pid: m[1], symbol: m[2].toUpperCase(), template: m[3].toLowerCase() };
        }

        function mqScanReasonLabel(reason) {
            const r = String(reason || '');
            return MQ_SCAN_REASON_LABELS[r] || r || '—';
        }

        function mqFormatPx(v) {
            const n = Number(v);
            if (!Number.isFinite(n)) return '—';
            if (n >= 1000) return fmtZctPx(n, 2);
            if (n >= 1) return fmtZctPx(n, 4);
            if (n >= 0.01) return fmtZctPx(n, 6);
            return fmtZctPx(n, 8);
        }

        function mqUpnlCell(upnl) {
            const n = Number(upnl);
            if (!Number.isFinite(n)) return '<span class="text-text-muted font-mono">—</span>';
            const cls = n > 0 ? 'text-neon-green' : n < 0 ? 'text-neon-red' : 'text-text-muted';
            const sign = n > 0 ? '+' : '';
            return '<span class="font-mono text-[11px] ' + cls + '">' + sign + escHtml(fmtZctPx(n, 2)) + '</span>';
        }

        function mqMarginPnlPct(d) {
            const entry = Number(d.entry_price);
            const mark = Number(d.mark_price);
            const lev = Number(d.leverage) || 10;
            if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(mark)) return null;
            const side = String(d.side || '').toUpperCase();
            if (side === 'LONG' || side === 'BUY') return (mark - entry) / entry * lev * 100;
            if (side === 'SHORT' || side === 'SELL') return (entry - mark) / entry * lev * 100;
            return null;
        }

        function mqPositionExtra(d, act) {
            const side = String(d.side || '');
            const entry = mqFormatPx(d.entry_price);
            const mark = mqFormatPx(d.mark_price);
            const notional = d.notional != null ? escHtml(String(d.notional)) + ' U' : '';
            const upnl = Number(d.upnl);
            const upnlTxt = Number.isFinite(upnl)
                ? (upnl > 0 ? '+' : '') + fmtZctPx(upnl, 2) + ' U'
                : '—';
            const upnlCls = upnl > 0 ? 'text-neon-green' : upnl < 0 ? 'text-neon-red' : 'text-text-muted';
            const pnlPct = d.pnl_pct != null ? Number(d.pnl_pct) : mqMarginPnlPct(d);
            let html = '<div class="text-[10px] text-text-muted mt-0.5 leading-relaxed">'
                + escHtml(side) + ' · 开仓 <span class="font-mono text-text-primary">' + escHtml(entry) + '</span>';
            if (d.mark_price != null) {
                html += ' · 现价 <span class="font-mono">' + escHtml(mark) + '</span>';
            }
            html += ' · 浮盈 <span class="font-mono ' + upnlCls + '">' + escHtml(upnlTxt) + '</span>';
            if (notional) html += ' · 名义 ' + notional;
            if (act === 'hold' || act === 'open') {
                if (pnlPct != null && Number.isFinite(pnlPct)) {
                    html += ' · ' + escHtml((pnlPct > 0 ? '+' : '') + pnlPct.toFixed(2)) + '%';
                }
            }
            html += '</div>';
            return html;
        }

        function mqScanActionBadge(action) {
            const act = String(action || '').toLowerCase();
            const map = {
                wait: ['观望', 'text-text-muted border-border/80 bg-surface-light/60'],
                hold: ['持仓', 'text-neon-blue border-neon-blue/35 bg-neon-blue/10'],
                open: ['开仓', 'text-neon-green border-neon-green/35 bg-neon-green/10'],
                close: ['平仓', 'text-neon-yellow border-neon-yellow/35 bg-neon-yellow/10'],
                error: ['错误', 'text-neon-red border-neon-red/35 bg-neon-red/10'],
            };
            const pair = map[act] || [act.toUpperCase() || '—', 'text-text-muted border-border/80'];
            return '<span class="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded border ' + pair[1] + '">' + escHtml(pair[0]) + '</span>';
        }

        function mqCompositeBarHtml(composite, threshold) {
            const c = Number(composite);
            const t = Number(threshold);
            if (!Number.isFinite(c) || !Number.isFinite(t) || t <= 0) {
                return '<span class="font-mono text-text-muted">—</span>';
            }
            const pct = Math.min(100, Math.round((Math.abs(c) / t) * 100));
            const need = t - Math.abs(c);
            const barCls = pct >= 85 ? 'bg-neon-yellow' : pct >= 60 ? 'bg-neon-purple/70' : 'bg-border';
            const near = need <= 0.05 ? ' · 接近阈值' : '';
            const sign = c >= 0 ? '+' : '';
            return '<div class="min-w-[5.5rem]" title="距开仓还差 ' + escHtml(need.toFixed(3)) + '">'
                + '<div class="font-mono text-[10px]">' + sign + c.toFixed(3) + ' <span class="text-text-muted">/ ±' + t.toFixed(2) + '</span></div>'
                + '<div class="h-1 mt-0.5 rounded-full bg-surface-light overflow-hidden"><div class="h-full ' + barCls + '" style="width:' + pct + '%"></div></div>'
                + (near ? '<div class="text-[9px] text-neon-yellow mt-0.5">' + escHtml(near.trim()) + '</div>' : '')
                + '</div>';
        }

        function mqNormalizePaperScan(scan) {
            if (!scan || typeof scan !== 'object') return null;
            const out = Object.assign({}, scan);
            const details = Array.isArray(out.details) ? out.details.slice() : [];
            const byPid = new Map();
            details.forEach((d) => {
                if (d && d.profile_id != null) byPid.set(Number(d.profile_id), Object.assign({}, d));
            });
            (out.open_positions || []).forEach((pos) => {
                const pid = Number(pos.profile_id);
                if (!Number.isFinite(pid)) return;
                const sym = String(pos.symbol || '').toUpperCase();
                const cur = byPid.get(pid);
                if (cur) {
                    if (pos.entry_price != null) {
                        cur.entry_price = pos.entry_price;
                        cur.mark_price = pos.mark_price;
                        cur.upnl = pos.upnl;
                        cur.side = pos.side || cur.side;
                        if (pos.notional != null) cur.notional = pos.notional;
                        if (pos.pnl_pct != null) cur.pnl_pct = pos.pnl_pct;
                        if (pos.leverage != null) cur.leverage = pos.leverage;
                    }
                    if (!cur.action || cur.action === 'wait' || cur.action === 'error') cur.action = 'hold';
                    byPid.set(pid, cur);
                } else {
                    byPid.set(pid, {
                        profile_id: pid,
                        symbol: sym,
                        label: 'p' + pid + ':' + sym + ':',
                        action: 'hold',
                        side: pos.side,
                        entry_price: pos.entry_price,
                        mark_price: pos.mark_price,
                        upnl: pos.upnl,
                        notional: pos.notional,
                    });
                }
            });
            out.details = Array.from(byPid.values());
            return out;
        }

        function renderMqPaperScan(scan) {
            const root = document.getElementById('mq-scan-status');
            const summaryEl = document.getElementById('mq-scan-summary');
            const meta = document.getElementById('mq-scan-meta');
            if (!root) return;
            scan = mqNormalizePaperScan(scan);
            const hasDetails = scan && Array.isArray(scan.details) && scan.details.length > 0;
            if (!scan || (!scan.has_run && !hasDetails)) {
                if (meta) meta.textContent = '尚无扫描记录';
                if (summaryEl) summaryEl.innerHTML = '';
                root.innerHTML = '<p class="text-[10px] text-text-muted py-1">尚无 15m 实仓扫描记录。请启用 Profile 并等待定时任务，或在维护面板触发 Moss 实仓扫描。</p>';
                if (_mqProfilesCache.length) renderMqProfilesList(_mqProfilesCache, null, _mqLastSummary);
                return;
            }
            const ts = (scan.ran_at_utc || '').slice(0, 19).replace('T', ' ');
            const scanModeLbl = scan.mode === 'paper' ? '纸面' : String(scan.mode || '纸面');
            if (meta) {
                const posNote = (!scan.has_run && hasDetails) ? '（仅有持仓，待扫描）· ' : '';
                const holdN = scan.open_hold_count != null
                    ? Number(scan.open_hold_count)
                    : (scan.open_positions || []).length;
                meta.textContent = (scanModeLbl ? scanModeLbl + ' · ' : '')
                    + posNote
                    + (ts ? ts + ' UTC · ' : '')
                    + '扫描 ' + (scan.profiles_scanned ?? 0) + ' 个'
                    + ' · 持仓 ' + holdN
                    + ' · 本轮开 ' + (scan.opens ?? 0)
                    + ' · 本轮平 ' + (scan.closes ?? 0);
            }
            const details = (scan.details || []).filter((d) => d && typeof d === 'object');
            if (!details.length) {
                if (summaryEl) summaryEl.innerHTML = '';
                root.innerHTML = '<p class="text-[10px] text-text-muted py-1">（本次扫描无明细）</p>';
                if (_mqProfilesCache.length) renderMqProfilesList(_mqProfilesCache, scan, _mqLastSummary);
                return;
            }

            const counts = { wait: 0, hold: 0, open: 0, close: 0, error: 0 };
            details.forEach((d) => {
                const a = String(d.action || '').toLowerCase();
                if (counts[a] != null) counts[a] += 1;
            });
            if (summaryEl) {
                const chips = [
                    ['观望', counts.wait, 'text-text-muted border-border/70'],
                    ['持仓', counts.hold, 'text-neon-blue border-neon-blue/30'],
                    ['开仓', counts.open, 'text-neon-green border-neon-green/30'],
                    ['平仓', counts.close, 'text-neon-yellow border-neon-yellow/30'],
                ];
                if (counts.error) chips.push(['错误', counts.error, 'text-neon-red border-neon-red/30']);
                summaryEl.innerHTML = chips
                    .filter((c) => c[1] > 0 || c[0] === '观望')
                    .map((c) => '<span class="px-2 py-0.5 rounded border ' + c[2] + ' bg-surface/50">' + escHtml(c[0]) + ' <b>' + c[1] + '</b></span>')
                    .join('');
            }

            const holdSyms = details
                .filter((d) => String(d.action || '').toLowerCase() === 'hold')
                .map((d) => String(d.symbol || mqParseScanLabel(d.label || '').symbol || '').toUpperCase())
                .filter(Boolean);

            const tableRows = details.filter((d) => {
                const act = String(d.action || '').toLowerCase();
                return act !== 'hold';
            });

            const sorted = tableRows.slice().sort((a, b) => {
                const oa = MQ_SCAN_ACTION_ORDER[String(a.action || '').toLowerCase()] ?? 9;
                const ob = MQ_SCAN_ACTION_ORDER[String(b.action || '').toLowerCase()] ?? 9;
                if (oa !== ob) return oa - ob;
                const la = mqParseScanLabel(a.label || '');
                const lb = mqParseScanLabel(b.label || '');
                return la.symbol.localeCompare(lb.symbol);
            });

            let bodyHtml = '';
            if (holdSyms.length) {
                bodyHtml += '<p class="text-[10px] text-text-muted py-1 mb-2">'
                    + '持仓 <b class="text-neon-blue font-mono">' + holdSyms.length + '</b> 笔'
                    + '（' + escHtml(holdSyms.join('、')) + '）→ 见下方<b class="text-text-secondary">实仓信号</b>。'
                    + '</p>';
            }

            if (!sorted.length) {
                bodyHtml += '<p class="text-[10px] text-text-muted py-1">'
                    + (counts.wait
                        ? '本轮无开/平仓事件。'
                        : '本轮全部已持仓，无观望标的。')
                    + '</p>';
            } else {
                const rows = sorted.map((d) => {
                    const parsed = mqParseScanLabel(d.label || d.symbol || '');
                    const sym = String(d.symbol || parsed.symbol || '').toUpperCase();
                    const tpl = String(d.template || parsed.template || '').toLowerCase();
                    const tplLabel = MQ_TEMPLATE_LABELS[tpl] || tpl || '—';
                    const act = String(d.action || '').toLowerCase();
                    let note = '';
                    if (act === 'open') {
                        note = escHtml(String(d.side || '')) + ' · 开仓 '
                            + escHtml(mqFormatPx(d.entry_price));
                    } else if (act === 'close') {
                        const pnl = Number(d.pnl);
                        const pnlTxt = Number.isFinite(pnl)
                            ? (pnl > 0 ? '+' : '') + fmtZctPx(pnl, 2) + ' U'
                            : String(d.pnl ?? '—');
                        note = escHtml(String(d.side || '')) + ' · '
                            + escHtml(String(d.rule || '平仓')) + ' · ' + escHtml(pnlTxt);
                    } else if (act === 'wait') {
                        note = escHtml(mqScanReasonLabel(d.reason));
                    } else if (act === 'error') {
                        note = '<span class="text-neon-red">' + escHtml(String(d.error || d.message || '')) + '</span>';
                    }
                    const compositeCell = (act === 'wait' || act === 'open')
                        ? mqCompositeBarHtml(d.composite, d.entry_threshold)
                        : '<span class="text-text-muted">—</span>';
                    return `<tr class="border-b border-border/40 hover:bg-surface-light/25 align-top">
                        <td class="py-1.5 pr-2 font-mono text-[11px] whitespace-nowrap">${escHtml(sym)}</td>
                        <td class="py-1.5 pr-2 text-[10px] whitespace-nowrap">${escHtml(tplLabel)}</td>
                        <td class="py-1.5 pr-2">${mqScanActionBadge(act)}</td>
                        <td class="py-1.5 pr-2">${compositeCell}</td>
                        <td class="py-1.5 pr-2">${mqRegimeBadgeHtml(d.regime)}</td>
                        <td class="py-1.5 pr-2 text-[10px] text-text-muted min-w-[6rem]">${note}</td>
                    </tr>`;
                }).join('');
                bodyHtml += `<table class="w-full text-left border-collapse min-w-[520px]">
                    <thead><tr class="text-text-muted text-[10px] uppercase border-b border-border/70">
                        <th class="py-1 pr-2 font-medium">标的</th>
                        <th class="py-1 pr-2 font-medium">策略</th>
                        <th class="py-1 pr-2 font-medium">状态</th>
                        <th class="py-1 pr-2 font-medium">综合分 / 阈值</th>
                        <th class="py-1 pr-2 font-medium">行情</th>
                        <th class="py-1 pr-2 font-medium">说明</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
            }

            root.innerHTML = bodyHtml;

            if (_mqProfilesCache.length) renderMqProfilesList(_mqProfilesCache, scan, _mqLastSummary);
        }

        let _mqDailyPollTimer = null;
        let _mqDailyFilter = 'all';
        let _mqDailyLastPayload = null;

        function mqHumanizeBlockReason(raw) {
            const r = String(raw || '').trim();
            if (!r) return '未通过风控';
            const map = {
                '训练验证收益比过高': '训练赚得多、验证一般，怕过拟合',
                '训练验证收益比过低': '验证相对训练过好，参数不稳',
                '滚动验证未达标': '滚动验证过关折数不够',
                '验证未通过': '验证窗回测不过关',
                '1500窗无满足门槛的组合': '最近15天没有合格参数（长窗仍可能更新）',
                '1500短窗未验收': '最近15天短窗未通过验收',
                'L1不可同步': '长窗风控未过，未跑短窗',
                'L1池级非A': '不在 A 池，仅观察',
            };
            for (const [k, v] of Object.entries(map)) {
                if (r.includes(k) || r === k) return v;
            }
            if (r.includes('尾段')) return r;
            return r.length > 42 ? r.slice(0, 42) + '…' : r;
        }

        /** 每行一句话结论（看板主信息） */
        function mqRowVerdict(summary) {
            const s = summary || {};
            const pool = mqPoolTierState(s);
            if (pool.tier === 'C') {
                return {
                    filter: 'nosync',
                    line: '本批不更新 · 回测未达标已剔除',
                    cls: 'text-warn/90',
                    border: 'border-warn/30 bg-warn/5',
                };
            }
            if (s.sync_allowed === true) {
                const src = String(s.param_source || 'grid');
                const paramWord = src === 'recent_1500'
                    ? '最近15天最优'
                    : (src === 'local_refine' ? '长窗精修' : '长窗网格');
                return {
                    filter: 'sync',
                    line: '本批可写入 · 用' + paramWord + '（已启用纸面会换参）',
                    cls: 'text-neon-green',
                    border: 'border-neon-green/35 bg-neon-green/10',
                };
            }
            const why = mqHumanizeBlockReason(
                s.sync_block_reason || s.wf_reason || s.validation_reason || pool.reason,
            );
            return {
                filter: 'nosync',
                line: '本批不更新参数 · ' + why,
                cls: 'text-warn/90',
                border: 'border-warn/35 bg-warn/10',
            };
        }

        function mqWfLabelHuman(summary) {
            const wf = mqWfState(summary);
            const folds = (summary || {}).wf_folds;
            if (folds != null && Number(folds) > 1) {
                return '滚动验证 ' + wf.label + ' 折';
            }
            return wf.label;
        }

        function mqL3LineHuman(summary) {
            const l3 = mqL3ShortWindowState(summary);
            if (l3.phase === 'skip') {
                return '近15天：未测算（' + mqHumanizeBlockReason(l3.hint) + '）';
            }
            if (l3.phase === 'fail' || l3.phase === 'none') {
                return '近15天：' + l3.label + '（长窗参数仍可能更新）';
            }
            return '近15天：' + l3.label + ' ' + l3.pct;
        }

        function mqStopDailyPoll() {
            if (_mqDailyPollTimer) {
                clearInterval(_mqDailyPollTimer);
                _mqDailyPollTimer = null;
            }
        }

        function mqStartDailyPoll() {
            mqStopDailyPoll();
            _mqDailyPollTimer = setInterval(() => void loadMqDailyPanel(true), 30000);
        }

        let _mqOptimizePolicy = { min_train_trades: 8, max_train_drawdown: 0.35 };

        /** 与后端 daily_auto_enable.py 一致；summary 无 auto_enabled 时用于展示 */
        function mqEvaluateDailyGate(summary) {
            const s = summary || {};
            if (s.error) return { ok: false, reason: '寻优失败' };
            const pol = _mqOptimizePolicy || {};
            const minTrades = Number(pol.min_train_trades) || 8;
            const maxMdd = Number(pol.max_train_drawdown) || 0.35;
            const ret = Number(s.total_return) || 0;
            const trades = Number(s.total_trades) || 0;
            const mdd = Math.abs(Number(s.max_drawdown) || 0);
            const blow = Number(s.blowup_count) || 0;
            const wr = Number(s.win_rate) || 0;
            const fails = [];
            if (ret <= 0) fails.push('收益≤0%');
            if (trades < minTrades) fails.push('回合<' + minTrades);
            if (mdd > maxMdd) fails.push('回撤>' + (maxMdd * 100).toFixed(0) + '%');
            if (blow > 0) fails.push('回测爆仓');
            if (fails.length) return { ok: false, reason: fails.join('；') };
            let detail = '收益' + (ret * 100).toFixed(1) + '%·' + trades + '笔';
            if (trades > 0) detail += '·胜率' + (wr * 100).toFixed(0) + '%';
            return { ok: true, reason: detail };
        }

        function mqPoolTierState(summary) {
            const s = summary || {};
            let tier = String(s.pool_tier || '').toUpperCase();
            if (!tier) {
                if (s.sync_allowed) tier = 'A';
                else if (s.auto_enabled && s.validation_passed === false) tier = 'B';
                else if (s.auto_enabled) tier = 'B';
                else tier = 'C';
            }
            const label = s.pool_label || (tier === 'A' ? '可交易' : tier === 'B' ? '观察' : '剔除');
            const reason = s.pool_reason || s.validation_reason || '';
            const cls = tier === 'A'
                ? 'text-neon-green border-neon-green/35 bg-neon-green/10'
                : tier === 'B'
                    ? 'text-neon-blue border-neon-blue/35 bg-neon-blue/10'
                    : 'text-warn/90 border-warn/35 bg-warn/10';
            return { tier: tier || 'C', label, reason, cls };
        }

        function mqValidationState(summary) {
            const s = summary || {};
            if (s.validation_passed === true) {
                return { ok: true, label: '通过', cls: 'text-neon-green' };
            }
            if (s.validation_passed === false) {
                return { ok: false, label: '未过', cls: 'text-warn/90', reason: s.validation_reason || '' };
            }
            return { ok: null, label: '—', cls: 'text-text-muted' };
        }

        function mqWfState(summary) {
            const s = summary || {};
            const folds = s.wf_folds != null ? Number(s.wf_folds) : null;
            const passed = s.wf_passed_folds != null ? Number(s.wf_passed_folds) : null;
            if (!folds || folds <= 1) {
                return { label: '单窗', cls: 'text-text-muted', title: '未启用多折滚动验证' };
            }
            const label = String(passed != null ? passed : '?') + '/' + folds;
            const ok = s.wf_validation_passed === true;
            return {
                label,
                cls: ok ? 'text-neon-green' : 'text-warn/90',
                title: s.wf_reason || (ok ? '滚动验证通过' : '滚动验证未达标'),
            };
        }

        function mqApplyDailyFilterUi() {
            document.querySelectorAll('.mq-daily-filter-btn').forEach((btn) => {
                const on = btn.getAttribute('data-mq-daily-filter') === _mqDailyFilter;
                btn.classList.toggle('border-neon-yellow/40', on);
                btn.classList.toggle('bg-neon-yellow/15', on);
                btn.classList.toggle('text-neon-yellow', on);
                btn.classList.toggle('border-border/70', !on);
                btn.classList.toggle('text-text-muted', !on);
            });
        }

        function mqRerenderDailyFromCache() {
            const p = _mqDailyLastPayload;
            const root = document.getElementById('mq-daily-table');
            if (!p || !root) return;
            root.innerHTML = mqRenderDailyCards(p.items, p.profileSyms, p.enabledSyms)
                + '<p class="text-[9px] text-text-muted mt-3 text-center">每张卡片最上面一行是结论；下面两行是长窗 / 近15天细节。</p>';
            mqApplyDailyFilterUi();
            const hint = document.querySelector('[data-mq-filter-hint]');
            if (hint && p.syncCount != null) {
                hint.textContent = '会更新 ' + p.syncCount + ' · 不更新 ' + p.noSyncCount;
            }
        }

        function mqRenderDailyCards(items, profileSyms, enabledSyms) {
            const cards = items.map((it) => {
                const symRaw = String(it.symbol || '').toUpperCase();
                const sym = escHtml(symRaw);
                const tpl = escHtml(MQ_TEMPLATE_LABELS[(it.template || '').toLowerCase()] || it.template || '—');
                const s = it.summary || {};
                const err = s.error || it.error;
                if (err) {
                    return `<div class="rounded-lg border border-warn/30 bg-warn/5 p-3" data-mq-daily-card="1" data-mq-filter="nosync">
                        <div class="font-mono font-semibold">${sym}</div>
                        <div class="text-warn/90 mt-1">${escHtml(String(err))}</div></div>`;
                }
                const verdict = mqRowVerdict(s);
                if (_mqDailyFilter !== 'all' && verdict.filter !== _mqDailyFilter) {
                    return '';
                }
                const ret = Number(s.total_return);
                const retPct = Number.isFinite(ret) ? (ret * 100).toFixed(1) + '%' : '—';
                const valRet = s.val_return != null ? (Number(s.val_return) * 100).toFixed(1) + '%' : '—';
                const pool = mqPoolTierState(s);
                const enabledHere = enabledSyms.has(symRaw);
                const canAdd = pool.tier !== 'C';
                const addBtn = profileSyms.has(symRaw)
                    ? (enabledHere
                        ? '<span class="text-[10px] text-neon-green">纸面已启用</span>'
                        : '<span class="text-[10px] text-text-muted">已加入未启用</span>')
                    : (canAdd
                        ? '<button type="button" data-mq-from-daily="' + escHtml(symRaw) + '" data-mq-from-daily-en="1"'
                            + ' class="text-[10px] px-2 py-1 rounded border border-neon-purple/35 text-neon-purple bg-neon-purple/10">加入纸面</button>'
                        : '<span class="text-[10px] text-text-muted">不可加</span>');
                return `<div class="rounded-lg border ${verdict.border} p-3 hover:brightness-110 transition" data-mq-daily-card="1" data-mq-filter="${escHtml(verdict.filter)}">
                    <div class="flex flex-wrap items-start justify-between gap-2">
                        <div>
                            <span class="font-mono font-semibold text-sm text-text-primary">${sym}</span>
                            <span class="text-[10px] text-text-muted ml-2">${tpl}</span>
                            <span class="text-[10px] ml-2 px-1.5 py-0.5 rounded border ${pool.cls}">${escHtml(pool.label)}</span>
                        </div>
                        <div class="text-sm font-semibold ${verdict.cls} max-w-[20rem] text-right leading-snug">${escHtml(verdict.line)}</div>
                    </div>
                    <div class="mt-2 grid gap-1 sm:grid-cols-2 text-[11px] text-text-muted">
                        <div>长窗约70天：训练 ${escHtml(retPct)} · 验证 ${escHtml(valRet)} · ${escHtml(mqWfLabelHuman(s))}</div>
                        <div>${escHtml(mqL3LineHuman(s))}</div>
                    </div>
                    <div class="mt-2 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/30">
                        <span class="text-[10px]">${mqGovernanceHealthBadge(symRaw, enabledHere, s)}</span>
                        ${addBtn}
                    </div>
                </div>`;
            }).filter(Boolean).join('');
            if (!cards) {
                return '<p class="text-text-muted text-xs py-4 text-center">当前筛选下没有标的。点「全部」查看。</p>';
            }
            return '<div class="grid gap-2 sm:grid-cols-1 lg:grid-cols-2">' + cards + '</div>';
        }

        /** 网格后 70% 归因 + WF 局部精修对比（post_grid_pipeline） */
        function mqRefineState(summary) {
            const s = summary || {};
            const pipe = s.post_grid_pipeline || {};
            const refine = pipe.local_refine || {};
            const hasPipeline = !!(pipe.local_refine || pipe.tuning_diagnosis);
            const adopted = s.refine_improved === true || String(s.param_source || '') === 'local_refine';
            const src = String(s.param_source || pipe.param_source || (adopted ? 'local_refine' : 'grid'));
            const pct = (x) => (Number.isFinite(Number(x)) ? (Number(x) * 100).toFixed(2) + '%' : '—');
            const gridRet = s.grid_val_return != null ? Number(s.grid_val_return) : Number(refine.grid_val_return);
            const finalRet = s.val_return != null ? Number(s.val_return) : Number(refine.refined_val_return);
            const gridSh = s.grid_val_sharpe != null ? Number(s.grid_val_sharpe) : Number(refine.grid_val_sharpe);
            const finalSh = s.val_sharpe != null ? Number(s.val_sharpe) : Number(refine.refined_val_sharpe);
            const rounds = refine.rounds_run != null ? Number(refine.rounds_run) : 0;
            const label = !hasPipeline ? '—' : (adopted ? '已采纳' : '未采纳');
            const compare = hasPipeline ? (pct(gridRet) + '→' + pct(finalRet)) : '—';
            const sharpeCmp = hasPipeline ? (Number(gridSh).toFixed(2) + '→' + Number(finalSh).toFixed(2)) : '—';
            const tips = [];
            if (refine.narrative) tips.push(refine.narrative);
            const diag = pipe.tuning_diagnosis || {};
            const ta = diag.train_analysis || {};
            if (ta.win_rate != null) {
                tips.push(
                    '训练窗胜率 ' + (Number(ta.win_rate) * 100).toFixed(0) + '%'
                    + ' PF=' + (ta.profit_factor != null ? ta.profit_factor : '—')
                    + ' 反手占比 ' + (ta.signal_exit_ratio != null ? (Number(ta.signal_exit_ratio) * 100).toFixed(0) + '%' : '—'),
                );
            }
            if (diag.suggestion && diag.suggestion.narrative) tips.push(diag.suggestion.narrative);
            if (refine.rounds && refine.rounds.length) {
                refine.rounds.forEach((r) => {
                    tips.push(
                        '第' + r.round + '轮 '
                        + (r.improved ? '↑' : '—')
                        + ' WF验证收益 ' + pct(r.val_return)
                        + ' 候选' + (r.candidates_tested || 0),
                    );
                });
            }
            const cls = adopted
                ? 'text-neon-green border-neon-green/35 bg-neon-green/10'
                : hasPipeline
                    ? 'text-neon-blue border-neon-blue/35 bg-neon-blue/10'
                    : 'text-text-muted border-border/70 bg-surface/30';
            return {
                hasPipeline,
                adopted,
                src,
                label,
                compare,
                sharpeCmp,
                rounds,
                cls,
                title: tips.join('\n') || '尚无精修流水线数据（需 API 部署 post_grid_pipeline）',
            };
        }

        function mqSyncState(summary) {
            const s = summary || {};
            if (s.sync_allowed === true) {
                return { label: '可同步', cls: 'text-neon-green border-neon-green/35 bg-neon-green/10', reason: '' };
            }
            if (s.sync_allowed === false) {
                const reason = s.sync_block_reason || s.pool_reason || s.validation_reason || s.wf_reason || '';
                return { label: '不同步', cls: 'text-warn/90 border-warn/35 bg-warn/10', reason };
            }
            return { label: '—', cls: 'text-text-muted border-border/70', reason: '' };
        }

        /** L3 短窗：人话状态（对应「1500收益」列） */
        function mqL3ShortWindowState(summary) {
            const s = summary || {};
            const rp = s.recent_pick || {};
            const hasPick = rp && (rp.skipped != null || rp.bars != null || rp.reason != null || rp.recent_return_pct != null);
            if (!hasPick) {
                return {
                    phase: 'none',
                    label: '无数据',
                    hint: '本批未跑 L3 或旧批次',
                    pct: '—',
                    pctCls: 'text-text-muted',
                    badgeCls: 'text-text-muted border-border/70 bg-surface/40',
                };
            }
            if (rp.skipped) {
                let hint = String(rp.reason || '非 A 池等，未跑短窗');
                if (hint === 'L1不可同步' || hint.includes('不可同步')) {
                    hint = String(
                        s.sync_block_reason || s.l1_sync_block_reason || hint,
                    );
                }
                return {
                    phase: 'skip',
                    label: '未执行',
                    hint,
                    pct: '跳过',
                    pctCls: 'text-text-muted',
                    badgeCls: 'text-text-muted border-border/60 bg-surface/30',
                };
            }
            const raw = rp.recent_return_pct != null ? rp.recent_return_pct : s.recent_return_pct;
            if (raw == null || raw === '') {
                return {
                    phase: 'fail',
                    label: '无合格组合',
                    hint: String(rp.reason || '1500 窗内参数均未同时过关'),
                    pct: '—',
                    pctCls: 'text-warn/90',
                    badgeCls: 'text-warn/90 border-warn/35 bg-warn/10',
                };
            }
            const n = Number(raw);
            const adopted = s.recent_applied === true || String(s.param_source || '') === 'recent_1500';
            return {
                phase: adopted ? 'adopted' : 'ok',
                label: adopted ? '已采纳' : '有过关组合',
                hint: rp.narrative ? String(rp.narrative).slice(0, 120) : String(rp.reason || ''),
                pct: (Number.isFinite(n) ? n.toFixed(2) : '—') + '%',
                pctCls: n > 0 ? 'text-neon-green' : n < 0 ? 'text-neon-red' : 'text-text-muted',
                badgeCls: adopted
                    ? 'text-neon-yellow border-neon-yellow/35 bg-neon-yellow/10'
                    : 'text-neon-blue border-neon-blue/35 bg-neon-blue/10',
            };
        }

        /** 本批能否写入已启用 Profile */
        function mqDeployState(summary) {
            const s = summary || {};
            const sync = mqSyncState(s);
            const src = String(s.param_source || 'grid');
            const srcLabel = src === 'recent_1500' ? 'L3短窗' : (src === 'local_refine' ? 'L2精修' : 'L1网格');
            if (s.sync_allowed === true) {
                return {
                    label: '会同步',
                    sub: '写入：' + srcLabel,
                    cls: 'text-neon-green border-neon-green/35 bg-neon-green/10',
                    title: '每日寻优 apply 后会更新已启用 Profile 的模板与战术参数',
                };
            }
            if (s.sync_allowed === false) {
                const why = s.sync_block_reason || sync.reason || s.wf_reason || s.pool_reason || '未通过同步门禁';
                return {
                    label: '不同步',
                    sub: String(why).slice(0, 48),
                    cls: 'text-warn/90 border-warn/35 bg-warn/10',
                    title: why,
                };
            }
            return {
                label: '—',
                sub: '',
                cls: 'text-text-muted border-border/70',
                title: '',
            };
        }

        function mqDailyGateState(summary) {
            const s = summary || {};
            if (s.auto_enabled === true) {
                return { ok: true, reason: String(s.auto_enable_reason || '') };
            }
            if (s.auto_enabled === false) {
                return { ok: false, reason: String(s.auto_enable_reason || '') };
            }
            return mqEvaluateDailyGate(s);
        }

        function renderMqDailyPanel(data, sum) {
            const root = document.getElementById('mq-daily-table');
            const meta = document.getElementById('mq-daily-meta');
            const chipsEl = document.getElementById('mq-daily-summary-chips');
            const maintBtn = document.getElementById('maint-mq-daily-optimize');
            const running = sum != null
                ? !!sum.daily_optimize_running
                : !!(data && data.batch && data.batch.status === 'running');
            if (maintBtn) {
                maintBtn.disabled = running;
                maintBtn.textContent = running ? 'Moss 寻优中…' : 'Moss 全量寻优';
            }
            if (!data || !data.has_batch || !data.batch) {
                if (meta) meta.textContent = running ? '运行中…' : '尚无批次';
                if (chipsEl) chipsEl.innerHTML = '';
                if (root) root.innerHTML = '<p class="text-text-muted text-xs">' + (running ? '全市场寻优进行中，约 30–45 分钟…' : '尚无每日寻优记录。') + '</p>';
                if (running) mqStartDailyPoll();
                else mqStopDailyPoll();
                return;
            }
            const b = data.batch;
            const st = String(b.status || '');
            const ts = (b.finished_at_utc || b.ran_at_utc || '').slice(0, 19).replace('T', ' ');
            if (meta) {
                meta.textContent = '#' + b.id + ' · ' + st + ' · ' + (b.symbols_ok ?? 0) + '/' + (b.symbols_total ?? 0)
                    + (ts ? ' · ' + ts + ' UTC' : '');
            }
            const items = (b.items || []).slice();
            if (!items.length) {
                if (chipsEl) chipsEl.innerHTML = '';
                if (root) root.innerHTML = '<p class="text-text-muted text-xs">批次无明细。</p>';
                return;
            }
            let passN = 0;
            let poolA = 0;
            let poolB = 0;
            let poolC = 0;
            let recentApplied = 0;
            items.forEach((it) => {
                const s = it.summary || {};
                if (s.error || it.error) return;
                const pool = mqPoolTierState(s);
                if (pool.tier === 'A') poolA += 1;
                else if (pool.tier === 'B') poolB += 1;
                else poolC += 1;
                if (mqDailyGateState(s).ok) passN += 1;
                if (s.recent_applied === true || s.param_source === 'recent_1500') recentApplied += 1;
            });
            let syncCount = 0;
            let noSyncCount = 0;
            items.forEach((it) => {
                const s = it.summary || {};
                if (s.error || it.error) {
                    noSyncCount += 1;
                    return;
                }
                if (mqRowVerdict(s).filter === 'sync') syncCount += 1;
                else noSyncCount += 1;
            });
            const poolsFromSum = sum && sum.daily_optimize_pools && sum.daily_optimize_pools.pool_counts;
            if (chipsEl) {
                const aN = poolsFromSum ? poolsFromSum.A : poolA;
                const bN = poolsFromSum ? poolsFromSum.B : poolB;
                const cN = poolsFromSum ? poolsFromSum.C : poolC;
                chipsEl.innerHTML = [
                    ['全市场', items.length, 'text-text-muted border-border/70', '本批寻优标的数'],
                    ['会更新', syncCount, 'text-neon-green border-neon-green/35', '本批允许写入已启用机器人'],
                    ['不更新', noSyncCount, 'text-warn/90 border-warn/35', '继续用旧参数'],
                    ['回测达标', passN, 'text-neon-purple border-neon-purple/35', '长窗收益/笔数/回撤过关'],
                    ['A 池', aN, 'text-neon-green border-neon-green/35', '可交易档'],
                    ['近15天采纳', recentApplied, 'text-neon-yellow border-neon-yellow/35', '写入时用短窗最优'],
                    ['B 观察', bN, 'text-neon-blue border-neon-blue/35', ''],
                    ['C 剔除', cN, 'text-warn/90 border-warn/35', ''],
                ].map((c) => '<span class="px-2 py-0.5 rounded border ' + c[2] + ' bg-surface/50" title="' + escHtml(c[3] || '') + '">'
                    + escHtml(c[0]) + ' <b>' + c[1] + '</b></span>').join('');
            }
            items.sort((a, b) => {
                const va = mqRowVerdict(a.summary || {}).filter === 'sync' ? 0 : 1;
                const vb = mqRowVerdict(b.summary || {}).filter === 'sync' ? 0 : 1;
                if (va !== vb) return va - vb;
                const ta = mqPoolTierState(a.summary || {}).tier;
                const tb = mqPoolTierState(b.summary || {}).tier;
                const pa = ta === 'A' ? 0 : ta === 'B' ? 1 : 2;
                const pb = tb === 'A' ? 0 : tb === 'B' ? 1 : 2;
                if (pa !== pb) return pa - pb;
                return Number(b.score || 0) - Number(a.score || 0);
            });
            const profileSyms = new Set((_mqProfilesCache || []).map((p) => String(p.symbol || '').toUpperCase()));
            const enabledSyms = new Set(
                (_mqProfilesCache || []).filter((p) => p.enabled).map((p) => String(p.symbol || '').toUpperCase()),
            );
            _mqDailyLastPayload = { items, profileSyms, enabledSyms, syncCount, noSyncCount };
            if (root) {
                root.innerHTML = mqRenderDailyCards(items, profileSyms, enabledSyms)
                    + '<p class="text-[9px] text-text-muted mt-3 text-center">每张卡片最上面一行是结论；下面两行是长窗 / 近15天细节。</p>';
            }
            mqApplyDailyFilterUi();
            const filterBar = document.getElementById('mq-daily-filter');
            if (filterBar) {
                const hint = filterBar.querySelector('[data-mq-filter-hint]');
                if (hint) {
                    hint.textContent = '会更新 ' + syncCount + ' · 不更新 ' + noSyncCount;
                }
            }
            if (st === 'running' || running) mqStartDailyPoll();
            else mqStopDailyPoll();
        }

        function mqFromDailyErrorLabel(code) {
            const c = String(code || '').trim();
            const map = {
                symbol_not_allowed: '标的不在实仓宇宙（需为内置币或已加入每日寻优表）',
                daily_item_not_found: '尚无该标的每日寻优结果，请先完成一轮每日寻优',
                daily_pool_rejected: '该标的为 C 池剔除，不可加入实仓',
                max_active_profiles_reached: '已启用 Profile 数量达上限',
                symbol_already_active: '该标的已有启用的实仓 Profile',
                profile_already_exists: '实仓 Profile 已存在且不允许覆盖',
            };
            return map[c] || c || '加入失败';
        }

        async function submitMqFromDaily(symbol, enabled) {
            const msg = document.getElementById('mq-profiles-msg');
            const dailyMeta = document.getElementById('mq-daily-meta');
            const sym = String(symbol || '').trim().toUpperCase();
            if (!sym) return;
            const btn = document.querySelector('[data-mq-from-daily="' + sym + '"]');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '加入中…';
            }
            try {
                await API.mqProfileFromDaily({
                    symbol: sym,
                    enabled: enabled !== false,
                    update_existing: true,
                });
                const okLine = '已从寻优加入 ' + sym;
                if (dailyMeta) dailyMeta.innerHTML = '<span class="text-neon-green">' + escHtml(okLine) + '</span>';
                if (msg) msg.innerHTML = '<span class="text-neon-green">' + escHtml(okLine) + '</span>';
                await hydrateMqBoard();
                await loadMqDailyPanel(true);
            } catch (e) {
                const errLine = mqFromDailyErrorLabel(e.message || String(e));
                if (dailyMeta) dailyMeta.innerHTML = '<span class="text-neon-red">' + escHtml(sym) + '：' + escHtml(errLine) + '</span>';
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(errLine) + '</span>';
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = '加入实仓';
                }
            }
        }

        async function loadMqDailyPanel(quiet) {
            const root = document.getElementById('mq-daily-table');
            if (!root) return;
            if (!quiet) root.innerHTML = '<span class="animate-pulse">加载寻优结果…</span>';
            try {
                const [data, sum] = await Promise.all([
                    API.mqDailyOptimizeLatest(),
                    API.mqSummary().catch(() => null),
                ]);
                if (sum && sum.optimize_policy) {
                    _mqOptimizePolicy = sum.optimize_policy;
                }
                renderMqDailyPanel(data, sum);
            } catch (e) {
                console.warn('mq daily:', e);
                if (root) root.innerHTML = '<span class="text-neon-red text-xs">' + escHtml(e.message || '加载失败') + '</span>';
            }
        }

        async function runMqDailyOptimize() {
            const msg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-mq-daily-optimize');
            if (btn && btn.disabled) return;
            if (!confirm('将对全部 Moss 标的依次网格寻优（约 30–45 分钟），完成后自动创建/更新 daily-* Profile。确定？')) return;
            if (msg) msg.textContent = 'Moss 全量寻优提交中…';
            if (btn) btn.disabled = true;
            try {
                const out = await API.mqDailyOptimizeRun({});
                if (out.already_running) {
                    if (msg) msg.innerHTML = '<span class="text-warn">已有寻优任务在运行</span>';
                } else if (out.started) {
                    if (msg) msg.innerHTML = '<span class="text-neon-green">已启动后台寻优，Moss 面板将自动刷新结果（约 30–45 分钟）</span>';
                } else {
                    if (msg) msg.textContent = out.message || '—';
                }
                mqStartDailyPoll();
                await loadMqDailyPanel(true);
            } catch (e) {
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || '启动失败') + '</span>';
                if (btn) btn.disabled = false;
            }
        }

        async function deleteMqProfile(profileId) {
            const msg = document.getElementById('mq-profiles-msg');
            if (!confirm('确定删除 Profile #' + profileId + '？\n关联实仓信号与回测记录将一并删除；若有未平仓持仓则无法删除。')) return;
            if (msg) msg.textContent = '删除中…';
            try {
                const out = await API.mqDeleteProfile(profileId);
                const line = '已删除 #' + profileId
                    + ' · signals=' + (out.signals ?? 0)
                    + ' · backtests=' + (out.backtest_runs ?? 0);
                if (msg) msg.innerHTML = '<span class="text-neon-green">' + escHtml(line) + '</span>';
                await hydrateMqBoard();
            } catch (e) {
                const err = (e && e.message) || String(e);
                const hint = err.indexOf('profile_has_open_position') >= 0
                    ? '该 Profile 仍有持仓，请先等待平仓或清库后再删'
                    : err;
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(hint) + '</span>';
            }
        }

        let _mqProfilesCache = [];
        let _mqLastFinalParams = null;
        let _mqLastFinalParamsRunId = null;
        let _mqLastOptimize = null;

        function mqCacheFinalParams(data) {
            if (data && data.final_params && typeof data.final_params === 'object') {
                _mqLastFinalParams = data.final_params;
                _mqLastFinalParamsRunId = data.run_id != null ? data.run_id : _mqLastFinalParamsRunId;
                const btn = document.getElementById('mq-bt-apply-params');
                if (btn) btn.disabled = false;
            }
        }

        function mqTacticalPreview(params) {
            if (!params) return '';
            const keys = [
                'entry_threshold', 'exit_threshold', 'sl_atr_mult', 'tp_rr_ratio',
                'regime_sensitivity', 'trailing_enabled',
            ];
            return keys
                .filter((k) => params[k] != null)
                .map((k) => k + '=' + params[k])
                .join(', ');
        }

        function mqNormalizeResearchSymbol(raw) {
            let s = String(raw || '').trim().toUpperCase().replace(/[\s/\-]/g, '');
            if (!s) return '';
            if (!s.endsWith('USDT')) s += 'USDT';
            return s;
        }

        function mqResearchSymbol() {
            const el = document.getElementById('mq-research-symbol');
            return mqNormalizeResearchSymbol(el && el.value);
        }

        function syncMqResearchProfileSelect(profiles) {
            _mqProfilesCache = profiles || [];
            const sel = document.getElementById('mq-research-profile');
            if (!sel) return;
            const prev = sel.value;
            const opts = ['<option value="">— 仅按标的 —</option>'];
            _mqProfilesCache.forEach((p) => {
                const label = '#' + p.id + ' ' + escHtml(p.symbol) + ' · ' + escHtml(p.template || '');
                opts.push('<option value="' + escHtml(String(p.id)) + '">' + label + '</option>');
            });
            sel.innerHTML = opts.join('');
            if (prev && _mqProfilesCache.some((p) => String(p.id) === prev)) sel.value = prev;
        }

        function mqResearchProfileId() {
            const sel = document.getElementById('mq-research-profile');
            const v = sel && sel.value ? parseInt(sel.value, 10) : NaN;
            return Number.isFinite(v) && v > 0 ? v : null;
        }

        function mqResearchTemplate() {
            const sel = document.getElementById('mq-research-template');
            return sel && sel.value ? String(sel.value) : 'balanced';
        }

        /** 回测/寻优请求体：优先 Profile；否则任意 Moss 宇宙标的 + 模板 */
        function mqResearchBodyBase() {
            const pid = mqResearchProfileId();
            const sym = mqResearchSymbol();
            if (pid) return { profile_id: pid };
            if (sym) return { symbol: sym, template: mqResearchTemplate() };
            return null;
        }

        function mqResearchTargetLabel() {
            const pid = mqResearchProfileId();
            if (pid) {
                const p = (_mqProfilesCache || []).find((x) => Number(x.id) === Number(pid));
                return p ? ('Profile #' + pid + ' ' + (p.symbol || '')) : ('Profile #' + pid);
            }
            const sym = mqResearchSymbol();
            return sym ? sym : '';
        }

        function mqFormatResearchApiError(e) {
            const m = (e && e.message) || String(e);
            if (/symbol_not_allowed/i.test(m)) {
                return '标的格式无效（需为 XXXUSDT）。默认接受任意永续代码；'
                    + '若服务端开启严格模式则需为币安 TRADING 合约。';
            }
            return m;
        }

        function setMqResearchOut(text, isErr) {
            const el = document.getElementById('mq-research-out');
            if (!el) return;
            el.textContent = text;
            el.className = 'text-[10px] font-mono rounded-lg p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words min-h-[2.5rem] border '
                + (isErr
                    ? 'text-neon-red bg-warn/[0.06] border-warn/30'
                    : 'text-text-secondary bg-surface-light/50 border-border/60');
        }

        function formatMqResearchResult(kind, data) {
            const lines = [kind + ' 完成', 'run_id: ' + (data.run_id != null ? data.run_id : '—')];
            const sum = data.summary || (data.backtest_result && data.backtest_result.total_return != null
                ? {
                    total_return: data.backtest_result.total_return,
                    sharpe: data.backtest_result.sharpe_ratio,
                    max_drawdown: data.backtest_result.max_drawdown,
                    total_trades: data.backtest_result.total_trades,
                    win_rate: data.backtest_result.win_rate,
                }
                : null);
            if (sum) {
                lines.push('— summary —');
                if (sum.total_return != null) lines.push('total_return: ' + sum.total_return);
                if (sum.sharpe != null) lines.push('sharpe: ' + sum.sharpe);
                if (sum.max_drawdown != null) lines.push('max_drawdown: ' + sum.max_drawdown);
                if (sum.total_trades != null) lines.push('total_trades: ' + sum.total_trades);
                if (sum.win_rate != null) lines.push('win_rate: ' + sum.win_rate);
                if (sum.segments != null) lines.push('segments: ' + sum.segments);
            }
            if (kind === 'reflect' && data.schedule) {
                lines.push('schedule 段数: ' + data.schedule.length);
            }
            if (data.final_params && data.final_params.entry_threshold != null) {
                lines.push('final entry_threshold: ' + data.final_params.entry_threshold);
            }
            if (data.evolution_log && data.evolution_log.length) {
                lines.push('evolution_log 段数: ' + data.evolution_log.length);
            }
            lines.push('（完整 JSON 见浏览器 Network）');
            return lines.join('\n');
        }

        function formatMqOptimizeResult(data) {
            const lines = [];
            lines.push('自动寻优完成 · ' + (data.symbol || ''));
            const ds = data.data_source_label || data.data_source || '';
            lines.push('数据源 ' + ds + ' · bars=' + (data.bars ?? '—') + ' · 测试 ' + (data.combinations_tested ?? 0) + ' 组');
            if (data.kline_start && data.kline_end) {
                lines.push('K线区间 ' + String(data.kline_start).slice(0, 19) + ' ~ ' + String(data.kline_end).slice(0, 19));
            }
            if (data.warning) lines.push('⚠ ' + data.warning);
            const best = data.best;
            if (!best || !best.summary) {
                lines.push('无有效回测结果');
                return lines.join('\n');
            }
            const s = best.summary;
            lines.push('');
            lines.push('【最优】模板=' + (best.template || '') + ' · score=' + (best.score != null ? best.score : '—'));
            lines.push('  total_return=' + s.total_return + ' · sharpe=' + s.sharpe + ' · max_dd=' + s.max_drawdown);
            lines.push('  trades=' + s.total_trades + ' · win_rate=' + s.win_rate);
            lines.push('  战术: ' + mqTacticalPreview(best.tactical_params || {}));
            lines.push('');
            lines.push('【排行榜 Top ' + Math.min((data.ranking || []).length, 15) + '】');
            (data.ranking || []).forEach((row, i) => {
                if (!row.summary) return;
                const rs = row.summary;
                lines.push(
                    (i + 1) + '. ' + (row.template || '') + ' · ret=' + rs.total_return
                    + ' · sharpe=' + rs.sharpe + ' · trades=' + rs.total_trades
                    + ' · entry=' + (row.tactical_params && row.tactical_params.entry_threshold)
                    + ' sl=' + (row.tactical_params && row.tactical_params.sl_atr_mult)
                    + ' tp=' + (row.tactical_params && row.tactical_params.tp_rr_ratio)
                );
            });
            lines.push('');
            lines.push('提示：寻优只写入战术参数；若最优模板与当前 Profile 不同，请新建 Profile 并选对应模板。');
            return lines.join('\n');
        }

        async function runMqOptimize() {
            const base = mqResearchBodyBase();
            if (!base) {
                setMqResearchOut('请填写标的（如 HYPEUSDT）或选择 Profile', true);
                return;
            }
            const capEl = document.getElementById('mq-research-capital');
            const capital = capEl && capEl.value ? parseFloat(capEl.value) : undefined;
            const body = { ...base, refresh_klines: true, top_n: 15 };
            if (capital != null && Number.isFinite(capital)) body.capital = capital;

            const btns = ['mq-bt-optimize', 'mq-bt-backtest', 'mq-bt-baseline', 'mq-bt-reflect', 'mq-bt-evolve-run'];
            btns.forEach((id) => {
                const b = document.getElementById(id);
                if (b) b.disabled = true;
            });
            setMqResearchOut('自动寻优运行中… 约 72 组回测（固化网格），预计 1–3 分钟，请勿关闭页面。', false);

            try {
                const data = await API.mqOptimize(body);
                _mqLastOptimize = data;
                const applyBtn = document.getElementById('mq-bt-apply-optimize');
                if (applyBtn) applyBtn.disabled = !(data.best && data.best.tactical_params);
                setMqResearchOut(formatMqOptimizeResult(data), false);
            } catch (e) {
                setMqResearchOut(mqFormatResearchApiError(e), true);
            } finally {
                btns.forEach((id) => {
                    const b = document.getElementById(id);
                    if (b) b.disabled = false;
                });
            }
        }

        async function applyMqOptimizeToProfile() {
            const pid = mqResearchProfileId();
            if (!pid) {
                setMqResearchOut('请先选择 Profile', true);
                return;
            }
            if (!_mqLastOptimize || !_mqLastOptimize.best || !_mqLastOptimize.best.tactical_params) {
                setMqResearchOut('请先完成自动寻优', true);
                return;
            }
            const best = _mqLastOptimize.best;
            const prof = (_mqProfilesCache || []).find((p) => Number(p.id) === Number(pid));
            const curTpl = prof && prof.template ? String(prof.template).toLowerCase() : '';
            const bestTpl = String(best.template || '').toLowerCase();
            let msg = '将最优战术参数写入 Profile #' + pid + '？\n';
            msg += 'entry=' + best.tactical_params.entry_threshold + ' sl=' + best.tactical_params.sl_atr_mult + ' tp=' + best.tactical_params.tp_rr_ratio;
            if (curTpl && bestTpl && curTpl !== bestTpl) {
                msg += '\n\n注意：最优模板是「' + bestTpl + '」，当前 Profile 是「' + curTpl + '」。仅写入战术，不换模板；若要换模板请新建 Profile。';
            }
            if (!confirm(msg)) return;

            const btn = document.getElementById('mq-bt-apply-optimize');
            if (btn) btn.disabled = true;
            setMqResearchOut('写入战术参数中…', false);
            try {
                await API.mqPatchProfile(pid, { tactical_params: best.tactical_params });
                let line = '已应用寻优战术 → Profile #' + pid
                    + '\n建议模板: ' + bestTpl
                    + '\n' + mqTacticalPreview(best.tactical_params);
                if (curTpl !== bestTpl) {
                    line += '\n（当前模板仍为 ' + curTpl + '，与最优不一致时可新建 Profile）';
                }
                setMqResearchOut(line, false);
                await hydrateMqBoard();
            } catch (e) {
                setMqResearchOut((e && e.message) || String(e), true);
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function runMqResearch(action) {
            let body = null;
            if (action !== 'reflect' && action !== 'evolve_run') {
                body = mqResearchBodyBase();
                if (!body) {
                    setMqResearchOut('请填写标的（如 HYPEUSDT）或选择 Profile', true);
                    return;
                }
            }
            const capEl = document.getElementById('mq-research-capital');
            const segEl = document.getElementById('mq-research-segment-bars');
            const runEl = document.getElementById('mq-baseline-run-id');
            const capital = capEl && capEl.value ? parseFloat(capEl.value) : undefined;
            const segment_bars = segEl && segEl.value ? parseInt(segEl.value, 10) : undefined;
            if (!body) body = {};
            if (capital != null && Number.isFinite(capital)) body.capital = capital;
            if (segment_bars != null && Number.isFinite(segment_bars)) body.segment_bars = segment_bars;

            const btns = ['mq-bt-backtest', 'mq-bt-baseline', 'mq-bt-reflect', 'mq-bt-evolve-run'];
            btns.forEach((id) => {
                const b = document.getElementById(id);
                if (b) b.disabled = true;
            });
            const targetHint = mqResearchTargetLabel();
            setMqResearchOut(
                action + ' 运行中…' + (targetHint ? ' · ' + targetHint : '')
                    + ' 拉取 K 线 + 回测可能需要 1–3 分钟，请稍候。',
                false,
            );

            try {
                let data;
                if (action === 'backtest') {
                    body.refresh_klines = true;
                    data = await API.mqBacktest(body);
                    setMqResearchOut(formatMqResearchResult('全量回测', data), false);
                } else if (action === 'baseline') {
                    body.refresh_klines = true;
                    data = await API.mqEvolveBaseline(body);
                    if (data.run_id != null && runEl) runEl.value = String(data.run_id);
                    mqCacheFinalParams(data);
                    setMqResearchOut(formatMqResearchResult('baseline', data), false);
                } else if (action === 'reflect') {
                    const rid = runEl && runEl.value ? parseInt(runEl.value, 10) : NaN;
                    if (!Number.isFinite(rid) || rid < 1) {
                        setMqResearchOut('请填写 baseline run_id（先跑 ② baseline）', true);
                        return;
                    }
                    data = await API.mqEvolveReflect(rid);
                    setMqResearchOut(formatMqResearchResult('reflect', data), false);
                } else if (action === 'evolve_run') {
                    const rid = runEl && runEl.value ? parseInt(runEl.value, 10) : NaN;
                    if (!Number.isFinite(rid) || rid < 1) {
                        setMqResearchOut('请填写 baseline run_id', true);
                        return;
                    }
                    data = await API.mqEvolveRun(rid);
                    mqCacheFinalParams(data);
                    setMqResearchOut(formatMqResearchResult('evolve run', data), false);
                }
            } catch (e) {
                setMqResearchOut(mqFormatResearchApiError(e), true);
            } finally {
                btns.forEach((id) => {
                    const b = document.getElementById(id);
                    if (b) b.disabled = false;
                });
            }
        }

        async function applyMqFinalParamsToProfile() {
            const pid = mqResearchProfileId();
            if (!pid) {
                setMqResearchOut('请先选择要写入的 Profile', true);
                return;
            }
            const btn = document.getElementById('mq-bt-apply-params');
            const body = {};
            if (_mqLastFinalParams) body.params = _mqLastFinalParams;
            else {
                const runEl = document.getElementById('mq-baseline-run-id');
                const rid = runEl && runEl.value ? parseInt(runEl.value, 10) : NaN;
                if (Number.isFinite(rid) && rid > 0) body.run_id = rid;
                else if (_mqLastFinalParamsRunId) body.run_id = _mqLastFinalParamsRunId;
            }
            if (!body.params && !body.run_id) {
                setMqResearchOut('请先完成 ② baseline 或 ④ evolve run（含 final_params）', true);
                return;
            }
            if (!confirm('将 final_params 战术字段写入 Profile #' + pid + '？\n性格权重不变，实仓下一扫描起生效。')) return;
            if (btn) btn.disabled = true;
            setMqResearchOut('写入 Profile 中…', false);
            try {
                const out = await API.mqApplyFinalParams(pid, body);
                const tact = out.tactical_params || {};
                const line = '已应用 → Profile #' + pid
                    + '\nentry_threshold=' + (out.entry_threshold != null ? out.entry_threshold : tact.entry_threshold)
                    + '\n' + mqTacticalPreview(tact);
                setMqResearchOut(line, false);
                await loadMqProfilesPanel();
            } catch (e) {
                setMqResearchOut((e && e.message) || String(e), true);
            } finally {
                if (btn) btn.disabled = !_mqLastFinalParams;
            }
        }

        async function loadMqProfilesPanel() {
            await ensureMqUniverseDatalist();
            const data = await API.mqProfiles();
            const profiles = data.profiles || [];
            _mqProfilesCache = profiles;
            renderMqProfilesList(profiles, _mqLastPaperScan, _mqLastSummary);
            renderMqRobotPnl(profiles, _mqLastSummary);
            syncMqResearchProfileSelect(profiles);
            return profiles;
        }

        async function submitMqCreateProfile() {
            const msg = document.getElementById('mq-profiles-msg');
            const btn = document.getElementById('mq-create-btn');
            const nameEl = document.getElementById('mq-create-name');
            const symEl = document.getElementById('mq-create-symbol');
            const tplEl = document.getElementById('mq-create-template');
            const eqEl = document.getElementById('mq-create-equity');
            const enEl = document.getElementById('mq-create-enabled');
            const name = (nameEl && nameEl.value || '').trim();
            const symbol = (symEl && symEl.value || '').trim().toUpperCase();
            const template = (tplEl && tplEl.value) || 'balanced';
            const enabled = !!(enEl && enEl.checked);
            if (!name) {
                if (msg) msg.innerHTML = '<span class="text-warn">请填写名称</span>';
                return;
            }
            if (!symbol) {
                if (msg) msg.innerHTML = '<span class="text-warn">请填写标的，如 BTCUSDT</span>';
                return;
            }
            let profiles = [];
            try {
                const prev = await API.mqProfiles();
                profiles = prev.profiles || [];
            } catch (e) { /* ignore */ }
            if (enabled) {
                if (mqEnabledCount(profiles) >= MQ_MAX_ENABLED) {
                    if (msg) msg.innerHTML = '<span class="text-warn">已启用 ' + MQ_MAX_ENABLED + ' 个，请先关闭其它 Profile</span>';
                    return;
                }
                if (mqTakenSymbols(profiles).has(symbol)) {
                    if (msg) msg.innerHTML = '<span class="text-warn">该标的已被其它启用 Profile 占用</span>';
                    return;
                }
            }
            const body = { name, symbol, template, enabled };
            const eqRaw = eqEl && eqEl.value ? String(eqEl.value).trim() : '';
            if (eqRaw) body.virtual_equity_usdt = parseFloat(eqRaw);
            if (btn) btn.disabled = true;
            if (msg) msg.textContent = '创建中…';
            try {
                const out = await API.mqCreateProfile(body);
                if (msg) msg.innerHTML = '<span class="text-neon-green">已创建 #' + escHtml(String(out.profile && out.profile.id)) + ' · ' + escHtml(symbol) + ' · ' + escHtml(template) + '</span>';
                if (nameEl) nameEl.value = '';
                if (symEl) symEl.value = '';
                await hydrateMqBoard();
            } catch (e) {
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function toggleMqProfileEnabled(profileId, enable) {
            const msg = document.getElementById('mq-profiles-msg');
            if (msg) msg.textContent = '更新中…';
            try {
                const prev = await API.mqProfiles();
                const profiles = prev.profiles || [];
                if (enable) {
                    if (mqEnabledCount(profiles) >= MQ_MAX_ENABLED) {
                        if (msg) msg.innerHTML = '<span class="text-warn">最多启用 ' + MQ_MAX_ENABLED + ' 个</span>';
                        return;
                    }
                    const prof = profiles.find((p) => Number(p.id) === Number(profileId));
                    const sym = prof && String(prof.symbol || '').toUpperCase();
                    if (sym && mqTakenSymbols(profiles, profileId).has(sym)) {
                        if (msg) msg.innerHTML = '<span class="text-warn">标的 ' + escHtml(sym) + ' 已被占用</span>';
                        return;
                    }
                }
                await API.mqPatchProfile(profileId, { enabled: !!enable });
                if (msg) msg.innerHTML = '<span class="text-neon-green">Profile #' + escHtml(String(profileId)) + (enable ? ' 已启用' : ' 已停用') + '</span>';
                await hydrateMqBoard();
            } catch (e) {
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            }
        }

        function renderMqTable(items) {
            const root = document.getElementById('mq-signals-root');
            if (!root) return;
            if (!items || !items.length) {
                root.innerHTML = '<p class="text-text-muted text-sm">暂无实仓信号。请在上方创建并启用 Profile，等待 15m 扫描或维护面板「Moss 实仓」。</p>';
                return;
            }
            const rows = items.map((row) => {
                const open = !row.outcome;
                const pnl = open ? row.unrealized_pnl_usdt : row.pnl_usdt;
                const pnlCls = pxClass(Number(pnl));
                const notional = row.virtual_notional_usdt != null
                    ? fmtZctPx(row.virtual_notional_usdt, 0)
                    : '—';
                let pnlPct = row.pnl_pct != null ? Number(row.pnl_pct) : null;
                if (open && (pnlPct == null || !Number.isFinite(pnlPct))) {
                    pnlPct = mqMarginPnlPct(row);
                }
                const pnlPctTxt = pnlPct != null && Number.isFinite(pnlPct)
                    ? (pnlPct > 0 ? '+' : '') + pnlPct.toFixed(2) + '%'
                    : '—';
                const pnlPctCls = pnlPct > 0 ? 'text-neon-green' : pnlPct < 0 ? 'text-neon-red' : 'text-text-muted';
                return `<tr class="border-b border-border/60">
                    <td class="py-1.5 pr-2 font-mono text-[10px]">${escHtml(String(row.id))}</td>
                    <td class="py-1.5 pr-2 font-mono text-[10px]">${escHtml((row.recorded_at_utc || '').slice(0, 19))}</td>
                    <td class="py-1.5 pr-2 font-mono text-[10px] text-text-muted">p${escHtml(String(row.profile_id != null ? row.profile_id : '—'))}</td>
                    <td class="py-1.5 pr-2 font-mono">${escHtml(row.symbol)}</td>
                    <td class="py-1.5 pr-2">${escHtml(row.side)}</td>
                    <td class="py-1.5 pr-2 text-right font-mono">${mqFormatPx(row.entry_price)}</td>
                    <td class="py-1.5 pr-2 text-right font-mono">${open ? mqFormatPx(row.mark_price) : '—'}</td>
                    <td class="py-1.5 pr-2 text-right font-mono text-text-muted">${notional}</td>
                    <td class="py-1.5 pr-2">${open ? '持仓' : escHtml(row.outcome || '')}</td>
                    <td class="py-1.5 pr-2 text-right font-mono ${pnlCls}">${pnl != null ? ((Number(pnl) > 0 ? '+' : '') + fmtZctPx(pnl, 2)) : '—'}</td>
                    <td class="py-1.5 pr-2 text-right font-mono ${pnlPctCls}">${escHtml(pnlPctTxt)}</td>
                    <td class="py-1.5 pr-2 text-[10px]">${escHtml(row.exit_rule || row.regime || '')}</td>
                </tr>`;
            }).join('');
            root.innerHTML = `<table class="w-full text-left text-xs border-collapse min-w-[1060px]">
                <thead><tr class="border-b border-border/80 text-text-muted text-[10px] uppercase">
                    <th class="py-2 pr-2">#</th><th class="py-2 pr-2">UTC</th><th class="py-2 pr-2">机器人</th><th class="py-2 pr-2">标的</th>
                    <th class="py-2 pr-2">方向</th><th class="py-2 pr-2 text-right">入场</th><th class="py-2 pr-2 text-right">标记</th>
                    <th class="py-2 pr-2 text-right">名义U</th><th class="py-2 pr-2">状态</th>
                    <th class="py-2 pr-2 text-right">浮盈U</th><th class="py-2 pr-2 text-right">收益率</th>
                    <th class="py-2 pr-2">备注</th>
                </tr></thead><tbody>${rows}</tbody></table>
                <p class="text-[9px] text-text-muted mt-2">持仓行的标记价与浮盈在加载时按最新 K 线刷新；收益率按杠杆计保证金收益。</p>` + laneBoardScrollHint(items.length);
        }

        let _m2ProfilesCache = [];
        let _m2LastPaperScan = null;

        const M2_SCAN_REASON_LABELS = {
            composite_below_threshold: '综合分未达开仓阈值',
            long_margin_or_confirm_failed: '多头：余量或连续 K 确认未过',
            short_margin_or_confirm_failed: '空头：余量或连续 K 确认未过',
            confirm_bars_insufficient: 'K 线不足，无法确认',
            composite_unavailable: '综合分不可用',
            margin_below_threshold: '纪律：综合分低于门槛',
            recent_ev_negative: '纪律：近期期望值为负',
            max_consec_loss: '纪律：连续亏损过多',
            portfolio_max_open_positions: '组合已满，暂停新开仓',
            variant_en_disabled: '非运维 variant 已禁用',
            variant_hl_disabled: '非运维 variant 已禁用',
        };

        const M2_SCAN_ACTION_ORDER = { open: 0, close: 1, wait: 2, error: 3, skip: 4 };

        function m2ParseScanLabel(label) {
            const raw = String(label || '');
            const m = raw.match(/^m2:(\d+):([^:]+):/i);
            if (!m) return { pid: '', symbol: raw, template: '' };
            return { pid: m[1], symbol: m[2].toUpperCase(), template: '' };
        }

        function m2ScanReasonLabel(reason) {
            const r = String(reason || '');
            return M2_SCAN_REASON_LABELS[r] || r || '—';
        }

        function m2NormalizePaperScan(scan) {
            if (!scan || typeof scan !== 'object') return null;
            const out = Object.assign({}, scan);
            const details = Array.isArray(out.details) ? out.details.slice() : [];
            const byPid = new Map();
            details.forEach((d) => {
                if (d && d.profile_id != null) byPid.set(Number(d.profile_id), Object.assign({}, d));
            });
            (out.open_positions || []).forEach((pos) => {
                const pid = Number(pos.profile_id);
                if (!Number.isFinite(pid)) return;
                const sym = String(pos.symbol || '').toUpperCase();
                const cur = byPid.get(pid);
                if (cur) {
                    if (pos.entry_price != null) {
                        cur.entry_price = pos.entry_price;
                        cur.mark_price = pos.mark_price;
                        cur.upnl = pos.unrealized_pnl_usdt != null ? pos.unrealized_pnl_usdt : pos.upnl;
                        cur.side = pos.side || cur.side;
                        if (pos.virtual_notional_usdt != null) cur.notional = pos.virtual_notional_usdt;
                        if (pos.composite != null) cur.composite = pos.composite;
                        if (pos.regime) cur.regime = pos.regime;
                        if (pos.stop_loss != null) cur.stop_loss = pos.stop_loss;
                        if (pos.take_profit != null) cur.take_profit = pos.take_profit;
                    }
                    if (!cur.action || cur.action === 'wait' || cur.action === 'error') cur.action = 'hold';
                    byPid.set(pid, cur);
                } else {
                    byPid.set(pid, {
                        profile_id: pid,
                        symbol: sym,
                        label: 'm2:' + pid + ':' + sym + ':',
                        action: 'hold',
                        side: pos.side,
                        entry_price: pos.entry_price,
                        mark_price: pos.mark_price,
                        upnl: pos.unrealized_pnl_usdt,
                        notional: pos.virtual_notional_usdt,
                        composite: pos.composite,
                        regime: pos.regime,
                        stop_loss: pos.stop_loss,
                        take_profit: pos.take_profit,
                    });
                }
            });
            out.details = Array.from(byPid.values());
            return out;
        }

        function renderM2Summary(sum) {
            const el = document.getElementById('m2-summary');
            if (!el) return;
            if (!sum || !sum.ok) {
                el.innerHTML = '';
                return;
            }
            const rt = sum.runtime || {};
            const vLbl = document.getElementById('m2-default-variant-label');
            const tLbl = document.getElementById('m2-default-template-label');
            if (vLbl) vLbl.textContent = rt.ops_variant || rt.default_variant || sum.default_variant || 'en';
            if (tLbl) tLbl.textContent = rt.default_template || sum.default_template || 'balanced';
            const pnl = Number(sum.total_pnl_usdt) || 0;
            const pnlCls = pnl >= 0 ? 'text-neon-green' : 'text-neon-red';
            const modeLbl = sum.mode === 'paper'
                ? (sum.real_mode ? '纸面 · 实盘通知开/平' : '纸面')
                : String(sum.mode || '纸面');
            const wInit = Number(sum.wallet_initial_usdt);
            const wBal = Number(sum.wallet_balance_usdt);
            const equity = Number(sum.equity_usdt);
            const upnl = Number(sum.unrealized_pnl_usdt);
            const walletInitKnown = Number.isFinite(wInit);
            const walletBalKnown = Number.isFinite(wBal);
            const equityKnown = Number.isFinite(equity);
            const walletValue = equityKnown ? fmtZctPx(equity, 2) : (walletBalKnown ? fmtZctPx(wBal, 2) : '—');
            const balCls = equityKnown && walletInitKnown
                ? (equity >= wInit ? 'text-neon-green' : 'text-neon-red')
                : 'text-text-primary';
            const profileCap = Number(sum.profile_capital_usdt);
            const profileCapTxt = Number.isFinite(profileCap) ? fmtZctPx(profileCap, 0) : '10000';
            const autoOn = !!rt.auto_provision;
            const maxEn = rt.max_auto_enabled_profiles != null ? String(rt.max_auto_enabled_profiles) : '12';
            const maxOpen = rt.portfolio_max_open_positions != null ? String(rt.portfolio_max_open_positions) : '6';
            const autoLine = autoOn
                ? '精品预设 · 启用≤' + escHtml(maxEn) + ' · 持仓≤' + escHtml(maxOpen)
                : '手动建 Profile';
            el.innerHTML = `
                <div class="bg-surface-light/30 rounded-lg border border-neon-blue/40 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">运行</div>
                    <div class="text-sm font-semibold text-neon-blue">${escHtml(modeLbl)}</div>
                    <div class="text-[10px] text-text-muted">discipline ${rt.discipline_enabled ? '开' : '关'} · evolve ${rt.evolve_enabled ? '开' : '关'}</div>
                    <div class="text-[10px] ${autoOn ? 'text-neon-green' : 'text-text-muted'}">${escHtml(autoLine)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-neon-blue/25 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">纸面权益</div>
                    <div class="text-lg font-semibold font-mono ${balCls}">${escHtml(walletValue)} U</div>
                    <div class="text-[9px] text-text-muted">初始 ${walletInitKnown ? fmtZctPx(wInit, 0) : '—'} · 单 Profile ${escHtml(profileCapTxt)}U</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">启用 / 持仓</div>
                    <div class="text-lg font-semibold">${escHtml(String(sum.enabled_profiles ?? 0))}<span class="text-sm text-text-muted font-normal">/${escHtml(String(sum.profile_count ?? 0))}</span></div>
                    <div class="text-[10px] font-mono text-text-muted">持仓 ${escHtml(String(sum.open_positions ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">浮盈</div>
                    <div class="text-lg font-semibold font-mono ${upnl >= 0 ? 'text-neon-green' : 'text-neon-red'}">${Number.isFinite(upnl) ? ((upnl > 0 ? '+' : '') + fmtZctPx(upnl, 2)) : '—'} U</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase">已实现 PnL</div>
                    <div class="text-lg font-semibold font-mono ${pnlCls}">${escHtml((pnl > 0 ? '+' : '') + pnl.toFixed(2))} U</div>
                    <div class="text-[9px] text-text-muted">EN 数据 ${escHtml(String(sum.en_datasets ?? 0))} 套</div>
                </div>`;
            const cnt = document.getElementById('m2-profiles-count');
            if (cnt) cnt.textContent = '启用 ' + (sum.enabled_profiles ?? 0) + '/' + (sum.profile_count ?? 0);
        }

        function m2EvolutionHint(st) {
            if (st === 'no_candidate') {
                return '四模板回测未过闸门（成交/EV/Sharpe/回撤），系统不会自动启用；维护面板先「拉 CSV」再「全自动建 Profile」';
            }
            if (st === 'approved') return '参数已发布，可启用或等待自动启用';
            if (st === 'culled') return '淘汰停用';
            if (st === 'pending') return '候选待人工 approve';
            return '';
        }

        function m2EvolutionBadge(p) {
            const st = String(p.evolution_status || 'baseline');
            const cls = st === 'approved' ? 'text-neon-green border-neon-green/35 bg-neon-green/10'
                : st === 'culled' ? 'text-warn border-warn/35 bg-warn/10'
                : st === 'no_candidate' ? 'text-neon-red border-neon-red/30 bg-neon-red/5'
                : 'text-text-muted border-border/60 bg-surface-light/50';
            const hint = m2EvolutionHint(st);
            const title = hint ? ' title="' + escHtml(hint).replace(/"/g, '&quot;') + '"' : '';
            const label = st === 'no_candidate' ? '无候选' : st;
            return '<span class="text-[9px] px-1.5 py-0.5 rounded border font-mono ' + cls + '"' + title + '>' + escHtml(label) + '</span>';
        }

        function renderM2Profiles(profiles) {
            const el = document.getElementById('m2-profiles-list');
            if (!el) return;
            if (!profiles || !profiles.length) {
                el.innerHTML = '<span class="text-text-muted">暂无 Profile。全自动会创建 25 核心；也可在下方手动新建。</span>';
                return;
            }
            const head = '<div class="hidden sm:grid sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] gap-2 py-1 text-[9px] uppercase text-text-muted border-b border-border/50">'
                + '<span>标的 / 名称</span><span>模板 · 进化</span><span>状态</span><span>操作</span></div>';
            const rows = profiles.map((p) => {
                const en = !!p.enabled;
                const enBadge = en
                    ? '<span class="text-[9px] text-neon-green">运行中</span>'
                    : '<span class="text-[9px] text-text-muted">已停用</span>';
                const btn = en
                    ? '<button type="button" class="m2-toggle-en text-[10px] px-2 py-0.5 rounded border border-warn/40 text-warn hover:bg-warn/10" data-id="' + p.id + '" data-en="0">停用</button>'
                    : '<button type="button" class="m2-toggle-en text-[10px] px-2 py-0.5 rounded border border-neon-green/40 text-neon-green hover:bg-neon-green/10" data-id="' + p.id + '" data-en="1">启用</button>';
                const ver = p.approved_params_version || p.params_version || '';
                return '<div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto_auto] gap-2 items-center py-2 border-b border-border/40 hover:bg-surface-light/30">'
                    + '<div><span class="font-mono font-semibold text-sm">' + escHtml(p.symbol) + '</span>'
                    + ' <span class="text-[10px] text-text-muted">#' + escHtml(String(p.id)) + '</span>'
                    + '<div class="text-[10px] text-text-muted truncate">' + escHtml(p.name || '') + '</div></div>'
                    + '<div class="text-[10px]"><span class="text-neon-blue font-mono">' + escHtml(p.template || 'balanced') + '</span>'
                    + (ver ? ' <span class="text-text-muted">· ' + escHtml(ver) + '</span>' : '')
                    + '<div class="mt-0.5">' + m2EvolutionBadge(p) + '</div></div>'
                    + '<div>' + enBadge + '</div>'
                    + '<div class="justify-self-end">' + btn + '</div></div>';
            }).join('');
            el.innerHTML = head + rows;
        }

        function renderM2PaperScan(scan) {
            const root = document.getElementById('m2-scan-status');
            const summaryEl = document.getElementById('m2-scan-summary');
            const meta = document.getElementById('m2-scan-meta');
            if (!root) return;
            scan = m2NormalizePaperScan(scan);
            const hasDetails = scan && Array.isArray(scan.details) && scan.details.length > 0;
            if (!scan || !scan.ok || (!scan.has_run && !hasDetails)) {
                if (meta) meta.textContent = '尚无扫描记录';
                if (summaryEl) summaryEl.innerHTML = '';
                root.innerHTML = '<p class="text-[10px] text-text-muted py-1">尚无 15m Moss2 扫描记录。请启用 Profile 并等待定时任务，或在维护面板触发「Moss2 纸面」。</p>';
                return;
            }
            const ts = (scan.ran_at_utc || '').slice(0, 19).replace('T', ' ');
            const modeLbl = scan.real_mode ? '实盘通知' : '纸面';
            if (meta) {
                const posNote = (!scan.has_run && hasDetails) ? '（仅有持仓，待扫描）· ' : '';
                const holdN = scan.open_hold_count != null
                    ? Number(scan.open_hold_count)
                    : (scan.open_positions || []).length;
                meta.textContent = (modeLbl ? modeLbl + ' · ' : '')
                    + posNote
                    + (ts ? ts + ' UTC · ' : '')
                    + '扫描 ' + (scan.profiles_scanned ?? 0) + ' 个'
                    + ' · 持仓 ' + holdN
                    + ' · 本轮开 ' + (scan.opens ?? 0)
                    + ' · 本轮平 ' + (scan.closes ?? 0);
            }
            const details = (scan.details || []).filter((d) => d && typeof d === 'object');
            if (!details.length) {
                if (summaryEl) summaryEl.innerHTML = '';
                root.innerHTML = '<p class="text-[10px] text-text-muted py-1">（本次扫描无明细）</p>';
                return;
            }

            const counts = { wait: 0, hold: 0, open: 0, close: 0, error: 0, skip: 0 };
            details.forEach((d) => {
                const a = String(d.action || '').toLowerCase();
                if (counts[a] != null) counts[a] += 1;
            });
            if (summaryEl) {
                const chips = [
                    ['观望', counts.wait, 'text-text-muted border-border/70'],
                    ['持仓', counts.hold, 'text-neon-blue border-neon-blue/30'],
                    ['开仓', counts.open, 'text-neon-green border-neon-green/30'],
                    ['平仓', counts.close, 'text-neon-yellow border-neon-yellow/30'],
                ];
                if (counts.error) chips.push(['错误', counts.error, 'text-neon-red border-neon-red/30']);
                if (counts.skip) chips.push(['跳过', counts.skip, 'text-text-muted border-border/50']);
                summaryEl.innerHTML = chips
                    .filter((c) => c[1] > 0 || c[0] === '观望')
                    .map((c) => '<span class="px-2 py-0.5 rounded border ' + c[2] + ' bg-surface/50">' + escHtml(c[0]) + ' <b>' + c[1] + '</b></span>')
                    .join('');
            }

            const holdSyms = details
                .filter((d) => String(d.action || '').toLowerCase() === 'hold')
                .map((d) => String(d.symbol || m2ParseScanLabel(d.label || '').symbol || '').toUpperCase())
                .filter(Boolean);

            const tableRows = details.filter((d) => {
                const act = String(d.action || '').toLowerCase();
                return act !== 'hold' && act !== 'skip';
            });

            const sorted = tableRows.slice().sort((a, b) => {
                const oa = M2_SCAN_ACTION_ORDER[String(a.action || '').toLowerCase()] ?? 9;
                const ob = M2_SCAN_ACTION_ORDER[String(b.action || '').toLowerCase()] ?? 9;
                if (oa !== ob) return oa - ob;
                const la = m2ParseScanLabel(a.label || '');
                const lb = m2ParseScanLabel(b.label || '');
                return la.symbol.localeCompare(lb.symbol);
            });

            let bodyHtml = '';
            if (holdSyms.length) {
                bodyHtml += '<p class="text-[10px] text-text-muted py-1 mb-2">'
                    + '持仓 <b class="text-neon-blue font-mono">' + holdSyms.length + '</b> 笔'
                    + '（' + escHtml(holdSyms.join('、')) + '）→ 见下方<b class="text-text-secondary">纸面信号</b>。'
                    + '</p>';
            }

            if (!sorted.length) {
                bodyHtml += '<p class="text-[10px] text-text-muted py-1">'
                    + (counts.wait
                        ? '本轮无开/平仓事件。'
                        : '本轮全部已持仓，无观望标的。')
                    + '</p>';
            } else {
                const rows = sorted.map((d) => {
                    const parsed = m2ParseScanLabel(d.label || d.symbol || '');
                    const sym = String(d.symbol || parsed.symbol || '').toUpperCase();
                    const tpl = String(d.template || parsed.template || '').toLowerCase();
                    const tplLabel = MQ_TEMPLATE_LABELS[tpl] || tpl || '—';
                    const act = String(d.action || '').toLowerCase();
                    let note = '';
                    if (act === 'open') {
                        note = escHtml(String(d.side || '')) + ' · 开仓 '
                            + escHtml(mqFormatPx(d.entry_price))
                            + (d.notional_usdt != null ? ' · ' + escHtml(String(d.notional_usdt)) + ' U' : '');
                    } else if (act === 'close') {
                        const pnl = Number(d.pnl_usdt != null ? d.pnl_usdt : d.pnl);
                        const pnlTxt = Number.isFinite(pnl)
                            ? (pnl > 0 ? '+' : '') + fmtZctPx(pnl, 2) + ' U'
                            : String(d.pnl_usdt ?? d.pnl ?? '—');
                        note = escHtml(String(d.side || '')) + ' · '
                            + escHtml(String(d.rule || '平仓')) + ' · ' + escHtml(pnlTxt);
                    } else if (act === 'wait') {
                        let extra = m2ScanReasonLabel(d.reason);
                        if (d.margin != null && Number.isFinite(Number(d.margin))) {
                            const gap = Number(d.margin);
                            extra += gap <= 0
                                ? ' · 已触线'
                                : ' · 还差 ' + escHtml(gap.toFixed(3));
                        }
                        if (d.confirm_bars > 1) extra += ' · ' + escHtml(String(d.confirm_bars)) + 'K确认';
                        note = escHtml(extra);
                    } else if (act === 'error') {
                        note = '<span class="text-neon-red">' + escHtml(String(d.error || d.protocol_error || d.message || '')) + '</span>';
                    }
                    const thBar = d.entry_threshold_eff != null ? d.entry_threshold_eff : d.entry_threshold;
                    const compositeCell = (act === 'wait' || act === 'open')
                        ? mqCompositeBarHtml(d.composite, thBar)
                        : '<span class="text-text-muted">—</span>';
                    return `<tr class="border-b border-border/40 hover:bg-surface-light/25 align-top">
                        <td class="py-1.5 pr-2 font-mono text-[11px] whitespace-nowrap">${escHtml(sym)}</td>
                        <td class="py-1.5 pr-2 text-[10px] whitespace-nowrap">${escHtml(tplLabel)}</td>
                        <td class="py-1.5 pr-2">${mqScanActionBadge(act)}</td>
                        <td class="py-1.5 pr-2">${compositeCell}</td>
                        <td class="py-1.5 pr-2">${mqRegimeBadgeHtml(d.regime)}</td>
                        <td class="py-1.5 pr-2 text-[10px] text-text-muted min-w-[6rem]">${note}</td>
                    </tr>`;
                }).join('');
                bodyHtml += `<table class="w-full text-left border-collapse min-w-[520px]">
                    <thead><tr class="text-text-muted text-[10px] uppercase border-b border-border/70">
                        <th class="py-1 pr-2 font-medium">标的</th>
                        <th class="py-1 pr-2 font-medium">模板</th>
                        <th class="py-1 pr-2 font-medium">状态</th>
                        <th class="py-1 pr-2 font-medium">综合分 / 阈值</th>
                        <th class="py-1 pr-2 font-medium">行情</th>
                        <th class="py-1 pr-2 font-medium">说明</th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
            }

            root.innerHTML = bodyHtml;
        }

        function renderM2SignalsTable(items) {
            const root = document.getElementById('m2-signals-root');
            if (!root) return;
            if (!items || !items.length) {
                root.innerHTML = '<p class="text-text-muted text-sm">暂无纸面信号。创建并启用 Profile 后等待 15m 扫描或维护面板「Moss2 纸面」。</p>';
                return;
            }
            const rows = items.map((row) => {
                const open = !row.outcome;
                const pnl = open ? row.unrealized_pnl_usdt : row.pnl_usdt;
                const pnlCls = pxClass(Number(pnl));
                const notional = row.virtual_notional_usdt != null
                    ? fmtZctPx(row.virtual_notional_usdt, 0)
                    : '—';
                let pnlPct = row.pnl_pct != null ? Number(row.pnl_pct) : null;
                if (open && (pnlPct == null || !Number.isFinite(pnlPct))) {
                    pnlPct = mqMarginPnlPct(row);
                }
                const pnlPctTxt = pnlPct != null && Number.isFinite(pnlPct)
                    ? (pnlPct > 0 ? '+' : '') + pnlPct.toFixed(2) + '%'
                    : '—';
                const pnlPctCls = pnlPct > 0 ? 'text-neon-green' : pnlPct < 0 ? 'text-neon-red' : 'text-text-muted';
                const slTxt = open && row.stop_loss != null ? mqFormatPx(row.stop_loss) : '—';
                const tpTxt = open && row.take_profit != null ? mqFormatPx(row.take_profit) : '—';
                return `<tr class="border-b border-border/60">
                    <td class="py-1.5 pr-2 font-mono text-[10px]">${escHtml(String(row.id))}</td>
                    <td class="py-1.5 pr-2 font-mono text-[10px]">${escHtml((row.recorded_at_utc || '').slice(0, 19))}</td>
                    <td class="py-1.5 pr-2 font-mono text-[10px] text-text-muted">p${escHtml(String(row.profile_id != null ? row.profile_id : '—'))}</td>
                    <td class="py-1.5 pr-2 font-mono">${escHtml(row.symbol)}</td>
                    <td class="py-1.5 pr-2">${escHtml(row.side)}</td>
                    <td class="py-1.5 pr-2 text-right font-mono">${mqFormatPx(row.entry_price)}</td>
                    <td class="py-1.5 pr-2 text-right font-mono">${open ? mqFormatPx(row.mark_price) : '—'}</td>
                    <td class="py-1.5 pr-2 text-right font-mono text-neon-red/90">${slTxt}</td>
                    <td class="py-1.5 pr-2 text-right font-mono text-neon-green/90">${tpTxt}</td>
                    <td class="py-1.5 pr-2 text-right font-mono text-text-muted">${notional}</td>
                    <td class="py-1.5 pr-2">${open ? '持仓' : escHtml(row.outcome || '')}</td>
                    <td class="py-1.5 pr-2 text-right font-mono ${pnlCls}">${pnl != null ? ((Number(pnl) > 0 ? '+' : '') + fmtZctPx(pnl, 2)) : '—'}</td>
                    <td class="py-1.5 pr-2 text-right font-mono ${pnlPctCls}">${escHtml(pnlPctTxt)}</td>
                    <td class="py-1.5 pr-2 text-[10px]">${escHtml(row.exit_rule || row.regime || '')}</td>
                </tr>`;
            }).join('');
            root.innerHTML = `<table class="w-full text-left text-xs border-collapse min-w-[1180px]">
                <thead><tr class="border-b border-border/80 text-text-muted text-[10px] uppercase">
                    <th class="py-2 pr-2">#</th><th class="py-2 pr-2">UTC</th><th class="py-2 pr-2">机器人</th><th class="py-2 pr-2">标的</th>
                    <th class="py-2 pr-2">方向</th><th class="py-2 pr-2 text-right">入场</th><th class="py-2 pr-2 text-right">标记</th>
                    <th class="py-2 pr-2 text-right">止损</th><th class="py-2 pr-2 text-right">止盈</th>
                    <th class="py-2 pr-2 text-right">名义U</th><th class="py-2 pr-2">状态</th>
                    <th class="py-2 pr-2 text-right">浮盈U</th><th class="py-2 pr-2 text-right">收益率</th>
                    <th class="py-2 pr-2">备注</th>
                </tr></thead><tbody>${rows}</tbody></table>
                <p class="text-[9px] text-text-muted mt-2">纸面持仓按最新 K 线刷新标记价与浮盈；止损/止盈为每轮 15m 扫描按 ATR 重算的参考触发价（非交易所挂单）。</p>` + laneBoardScrollHint(items.length);
        }

        async function ensureM2CatalogDatalist() {
            const dl = document.getElementById('m2-symbol-datalist');
            if (!dl || dl.dataset.loaded === '1') return;
            try {
                const syms = new Set();
                const [cat, trade] = await Promise.all([
                    API.m2Catalog().catch(() => ({ en: [] })),
                    API.m2TradeableSymbols().catch(() => ({ symbols: [] })),
                ]);
                (cat.en || []).forEach((x) => { if (x.symbol) syms.add(x.symbol); if (x.compact) syms.add(x.compact); });
                (trade.symbols || []).forEach((s) => syms.add(s));
                dl.innerHTML = [...syms].sort().map((s) => '<option value="' + escHtml(s) + '"></option>').join('');
                dl.dataset.loaded = '1';
            } catch (e) {
                console.warn('m2 catalog:', e);
            }
        }

        function formatM2SuggestSummary(s) {
            if (!s) return '无建议数据';
            const lines = [
                'symbol: ' + (s.symbol || '—'),
                'reason: ' + (s.reason || '—'),
                'regime → ' + (s.regime_hint_template || '—'),
                '推荐模板: ' + (s.recommended_template || '—'),
                '推荐名称: ' + (s.recommended_name || '—'),
                '创建后启用: ' + (s.recommended_enabled ? '是（回测过关）' : '否（建议先观察）'),
            ];
            const mix = s.regime_recent || {};
            const mixStr = Object.keys(mix).map((k) => k + '=' + ((mix[k] * 100) || 0).toFixed(1) + '%').join(' · ');
            if (mixStr) lines.push('近期 regime: ' + mixStr);
            if (s.bars_analyzed) lines.push('K 线根数: ' + s.bars_analyzed);
            if (s.data_csv) lines.push('csv: ' + s.data_csv);
            (s.notes || []).forEach((n) => lines.push('· ' + n));
            const scores = s.template_scores || [];
            if (scores.length) {
                lines.push('— 四模板回测 —');
                scores.forEach((row) => {
                    if (row.error) {
                        lines.push(row.template + ': err ' + row.error);
                        return;
                    }
                    lines.push(
                        row.template + ': score=' + (row.score ?? '—')
                            + ' sharpe=' + (row.sharpe ?? '—')
                            + ' ret=' + (((row.total_return || 0) * 100).toFixed(2)) + '%'
                            + ' trades=' + (row.total_trades ?? '—')
                            + (row.passes_discipline ? ' ✓' : '')
                    );
                });
            }
            (s.workflow || []).forEach((w) => lines.push('→ ' + w));
            return lines.join('\n');
        }

        function applyM2SuggestToForm(s) {
            const nameEl = document.getElementById('m2-create-name');
            const symEl = document.getElementById('m2-create-symbol');
            const tplEl = document.getElementById('m2-create-template');
            const enEl = document.getElementById('m2-create-enabled');
            if (symEl && s.symbol) symEl.value = s.symbol;
            if (nameEl && s.recommended_name) nameEl.value = s.recommended_name;
            if (tplEl && s.recommended_template) {
                const opt = [...tplEl.options].find((o) => o.value === s.recommended_template);
                if (opt) tplEl.value = s.recommended_template;
            }
            if (enEl) enEl.checked = !!s.recommended_enabled;
        }

        async function fillM2FromOnboardingSuggest() {
            const msg = document.getElementById('m2-profiles-msg');
            const out = document.getElementById('m2-research-out');
            const symbol = (document.getElementById('m2-create-symbol')?.value || '').trim().toUpperCase() || 'BTCUSDT';
            if (msg) msg.textContent = '读取 Moss2 建议…';
            if (out) out.textContent = '分析 regime / 回测中…';
            try {
                const s = await API.m2OnboardingSuggest(symbol);
                if (!s.ok) {
                    if (msg) msg.innerHTML = '<span class="text-warn">' + escHtml(s.reason || '建议不可用') + '</span>';
                    if (out) out.textContent = formatM2SuggestSummary(s);
                    return;
                }
                applyM2SuggestToForm(s);
                if (msg) msg.innerHTML = '<span class="text-neon-green">已填充 ' + escHtml(s.symbol || symbol) + ' · ' + escHtml(s.recommended_template || '') + '</span>';
                if (out) out.textContent = formatM2SuggestSummary(s);
            } catch (e) {
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
                if (out) out.textContent = e.message || String(e);
            }
        }

        async function refreshM2AutoLastRun() {
            const el = document.getElementById('m2-auto-last-run');
            if (!el) return;
            try {
                const row = await API.m2LastAutoRun();
                if (!row || !row.has_run) {
                    el.textContent = row && row.hint ? row.hint : '尚无记录（等调度器拉 CSV 链式跑完）';
                    return;
                }
                const t = (row.saved_at_utc || '').replace('T', ' ').slice(0, 19);
                const s = row.stats || {};
                el.textContent = (t ? t + ' UTC · ' : '')
                    + '触发 ' + (row.trigger || '—')
                    + ' · 新建 ' + (s.created ?? 0)
                    + ' · 启用 ' + (s.enabled_profiles ?? 0);
            } catch (e) {
                el.textContent = '读取失败';
            }
        }

        async function hydrateM2Board() {
            void refreshM2AutoLastRun();
            const sigRoot = document.getElementById('m2-signals-root');
            const tsEl = document.getElementById('m2-ts');
            if (!sigRoot) return;
            sigRoot.innerHTML = '<div class="text-text-muted text-sm animate-pulse">加载 Moss2…</div>';
            try {
                const [sum, profiles, sig, scan] = await Promise.all([
                    API.m2Summary(false),
                    API.m2Profiles(),
                    API.m2Signals(true),
                    API.m2PaperScanLatest(true).catch(() => null),
                ]);
                _m2ProfilesCache = Array.isArray(profiles) ? profiles : [];
                _m2LastPaperScan = scan;
                renderM2Summary(sum);
                renderM2Profiles(_m2ProfilesCache);
                renderM2PaperScan(scan);
                renderM2SignalsTable(sig.signals || []);
                const repInp = document.getElementById('m2-report-profile-id');
                if (repInp && !repInp.value && _m2ProfilesCache.length) {
                    const pick = _m2ProfilesCache.find((p) => p.enabled) || _m2ProfilesCache[0];
                    if (pick) repInp.value = String(pick.id);
                }
                if (tsEl) tsEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            } catch (e) {
                console.error('moss2:', e);
                sigRoot.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(e.message || '加载失败') + '</div>';
                if (tsEl) tsEl.textContent = '--';
            }
        }

        function initM2PanelOnce() {
            if (initM2PanelOnce._done) return;
            initM2PanelOnce._done = true;
            void ensureM2CatalogDatalist();
            document.getElementById('m2-suggest-fill')?.addEventListener('click', () => void fillM2FromOnboardingSuggest());
            document.getElementById('m2-create-btn')?.addEventListener('click', () => void submitM2CreateProfile());
            document.getElementById('m2-bt-run')?.addEventListener('click', () => void runM2Backtest());
            document.getElementById('m2-report-backtest')?.addEventListener('click', () => void openM2Tearsheet('backtest', false));
            document.getElementById('m2-report-paper')?.addEventListener('click', () => void openM2Tearsheet('paper', false));
            document.getElementById('m2-profiles-list')?.addEventListener('click', (ev) => {
                const btn = ev.target.closest('.m2-toggle-en');
                if (!btn) return;
                const id = btn.getAttribute('data-id');
                const en = btn.getAttribute('data-en') === '1';
                void toggleM2ProfileEnabled(id, en);
            });
        }

        async function submitM2CreateProfile() {
            const msg = document.getElementById('m2-profiles-msg');
            const name = (document.getElementById('m2-create-name')?.value || '').trim();
            const symbol = (document.getElementById('m2-create-symbol')?.value || '').trim().toUpperCase();
            const variant = document.getElementById('m2-create-variant')?.value || 'en';
            const template = document.getElementById('m2-create-template')?.value || 'balanced';
            const enabled = !!document.getElementById('m2-create-enabled')?.checked;
            if (!name || !symbol) {
                if (msg) msg.innerHTML = '<span class="text-warn">请填写名称与标的</span>';
                return;
            }
            if (msg) msg.textContent = '创建中…';
            try {
                await API.m2CreateProfile({ name, symbol, variant: 'en', template, enabled });
                if (msg) msg.innerHTML = '<span class="text-neon-green">已创建 ' + escHtml(symbol) + '</span>';
                await hydrateM2Board();
            } catch (e) {
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            }
        }

        async function toggleM2ProfileEnabled(profileId, enable) {
            const msg = document.getElementById('m2-profiles-msg');
            try {
                await API.m2PatchProfile(profileId, { enabled: !!enable });
                if (msg) msg.innerHTML = '<span class="text-neon-green">#' + escHtml(String(profileId)) + (enable ? ' 已启用' : ' 已停用') + '</span>';
                await hydrateM2Board();
            } catch (e) {
                if (msg) msg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            }
        }

        function m2ReportProfileId() {
            const raw = document.getElementById('m2-report-profile-id')?.value;
            const n = Number(raw);
            return Number.isFinite(n) && n > 0 ? n : null;
        }

        async function openM2Tearsheet(mode, runBacktest) {
            const hint = document.getElementById('m2-report-hint');
            const pid = m2ReportProfileId();
            if (!pid) {
                if (hint) hint.innerHTML = '<span class="text-warn">请填写 Profile #</span>';
                return;
            }
            if (hint) hint.textContent = '生成 QuantStats 报告…';
            try {
                const st = await API.m2ReportsStatus().catch(() => ({}));
                if (st.quantstats_installed === false) {
                    if (hint) hint.innerHTML = '<span class="text-warn">服务端未安装 quantstats</span>';
                    return;
                }
                const meta = await API.m2TearsheetMeta(pid, mode, runBacktest);
                const url = meta.url
                    ? (API_BASE.replace(/\/$/, '') + meta.url)
                    : API.m2TearsheetHtmlUrl(pid, mode, runBacktest);
                window.open(url, '_blank', 'noopener,noreferrer');
                const qs = meta.stats || {};
                if (hint) {
                    hint.innerHTML = '<span class="text-neon-green">已打开</span> · Sharpe '
                        + escHtml(String(qs.sharpe ?? '—'))
                        + ' · MDD ' + escHtml(String(qs.max_drawdown ?? '—'))
                        + ' · n=' + escHtml(String(meta.observations ?? ''));
                }
            } catch (e) {
                if (hint) hint.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            }
        }

        async function runM2Backtest() {
            const out = document.getElementById('m2-research-out');
            const symbol = (document.getElementById('m2-create-symbol')?.value || '').trim().toUpperCase();
            const template = document.getElementById('m2-create-template')?.value || 'balanced';
            const profileId = m2ReportProfileId();
            if (!symbol && !profileId) {
                if (out) out.textContent = '请填写标的或 Profile #';
                return;
            }
            if (out) out.textContent = '回测中…';
            try {
                const body = profileId
                    ? { profile_id: profileId, limit_bars: 4500 }
                    : { symbol, variant: 'en', template, limit_bars: 1500 };
                const res = await API.m2Backtest(body);
                if (profileId) {
                    const repInp = document.getElementById('m2-report-profile-id');
                    if (repInp) repInp.value = String(profileId);
                } else if (res.profile_id) {
                    const repInp = document.getElementById('m2-report-profile-id');
                    if (repInp) repInp.value = String(res.profile_id);
                }
                const s = res.summary || {};
                const d = res.discipline || s.discipline || {};
                const ev = (d.ev || {});
                if (out) {
                    out.textContent = [
                        'engine: ' + (res.engine || ''),
                        'return: ' + ((s.total_return || 0) * 100).toFixed(2) + '%',
                        'trades: ' + (s.total_trades || 0),
                        'sharpe: ' + (s.sharpe || 0),
                        'mdd: ' + ((s.max_drawdown || 0) * 100).toFixed(2) + '%',
                        'ev/trade: ' + (ev.ev_per_trade_pct != null ? ev.ev_per_trade_pct : '—'),
                        'half_kelly: ' + ((d.kelly || {}).half_kelly_fraction ?? '—'),
                        'dominant: ' + ((d.signal_contrib || {}).dominant_dimension || '—'),
                        'csv: ' + (res.data_csv || ''),
                        (res.profile_id || profileId) ? '→ 点「回测报告」生成 QuantStats HTML' : '',
                    ].filter(Boolean).join('\n');
                }
            } catch (e) {
                if (out) out.textContent = e.message || String(e);
            }
        }

        async function hydrateMqBoard() {
            const sigRoot = document.getElementById('mq-signals-root');
            const tsEl = document.getElementById('mq-ts');
            if (!sigRoot) return;
            sigRoot.innerHTML = '<div class="text-text-muted text-sm animate-pulse">加载 Moss 实仓…</div>';
            const listEl = document.getElementById('mq-profiles-list');
            if (listEl) listEl.innerHTML = '<span class="animate-pulse">加载 Profile…</span>';
            const scanPromise = API.mqPaperScanLatest().catch((err) => {
                console.warn('mq paper scan:', err);
                return null;
            });
            try {
                const sum = await API.mqSummary();
                renderMqSummary(sum);
                await loadMqProfilesPanel();
                await loadMqDailyPanel(true);
                const [sig, scan] = await Promise.all([
                    API.mqSignals(),
                    scanPromise,
                ]);
                _mqLastPaperScan = mqNormalizePaperScan(scan);
                renderMqTable(sig.signals || []);
                renderMqPaperScan(_mqLastPaperScan);
                try {
                    const sum2 = await API.mqSummary();
                    _mqLastSummary = sum2;
                    renderMqSummary(sum2);
                    if (_mqProfilesCache.length) {
                        renderMqRobotPnl(_mqProfilesCache, sum2);
                        renderMqProfilesList(_mqProfilesCache, _mqLastPaperScan, sum2);
                    }
                } catch (e2) {
                    console.warn('mq summary refresh:', e2);
                }
                if (tsEl) tsEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            } catch (e) {
                console.error('moss_quant:', e);
                renderMqSummary(null);
                sigRoot.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(e.message || '加载失败') + '</div>';
                if (listEl) listEl.innerHTML = '<span class="text-neon-red text-xs">' + escHtml(e.message || '加载失败') + '</span>';
                if (tsEl) tsEl.textContent = '--';
            }
        }

        function initMqProfilesPanelOnce() {
            if (initMqProfilesPanelOnce._done) return;
            initMqProfilesPanelOnce._done = true;
            document.getElementById('mq-create-template')?.addEventListener('change', updateMqTemplateHint);
            document.getElementById('mq-create-btn')?.addEventListener('click', () => void submitMqCreateProfile());
            document.getElementById('mq-bt-backtest')?.addEventListener('click', () => void runMqResearch('backtest'));
            document.getElementById('mq-bt-baseline')?.addEventListener('click', () => void runMqResearch('baseline'));
            document.getElementById('mq-bt-reflect')?.addEventListener('click', () => void runMqResearch('reflect'));
            document.getElementById('mq-bt-evolve-run')?.addEventListener('click', () => void runMqResearch('evolve_run'));
            document.getElementById('mq-bt-apply-params')?.addEventListener('click', () => void applyMqFinalParamsToProfile());
            document.getElementById('mq-bt-optimize')?.addEventListener('click', () => void runMqOptimize());
            document.getElementById('mq-bt-apply-optimize')?.addEventListener('click', () => void applyMqOptimizeToProfile());
            document.getElementById('mq-research-profile')?.addEventListener('change', () => {
                const pid = mqResearchProfileId();
                if (!pid) return;
                const p = (_mqProfilesCache || []).find((x) => Number(x.id) === Number(pid));
                if (!p) return;
                const symEl = document.getElementById('mq-research-symbol');
                const tplEl = document.getElementById('mq-research-template');
                if (symEl) symEl.value = p.symbol || '';
                if (tplEl && p.template) tplEl.value = String(p.template).toLowerCase();
            });
            document.getElementById('mq-research-symbol')?.addEventListener('blur', (ev) => {
                const n = mqNormalizeResearchSymbol(ev.target && ev.target.value);
                if (n && ev.target) ev.target.value = n;
            });
            document.getElementById('mq-research-panel')?.addEventListener('toggle', (ev) => {
                if (ev.target && ev.target.open) void ensureMqUniverseDatalist();
            });
            document.getElementById('mq-daily-filter')?.addEventListener('click', (ev) => {
                const btn = ev.target.closest('[data-mq-daily-filter]');
                if (!btn) return;
                const f = btn.getAttribute('data-mq-daily-filter');
                if (f && f !== _mqDailyFilter) {
                    _mqDailyFilter = f;
                    mqRerenderDailyFromCache();
                }
            });
            document.getElementById('mq-daily-table')?.addEventListener('click', (ev) => {
                const addBtn = ev.target.closest('[data-mq-from-daily]');
                if (addBtn) {
                    const sym = addBtn.getAttribute('data-mq-from-daily');
                    const en = addBtn.getAttribute('data-mq-from-daily-en') !== '0';
                    void submitMqFromDaily(sym, en);
                }
            });
            document.getElementById('mq-profiles-list')?.addEventListener('click', (ev) => {
                const delBtn = ev.target && ev.target.closest && ev.target.closest('[data-mq-delete]');
                if (delBtn) {
                    ev.preventDefault();
                    const id = delBtn.getAttribute('data-mq-delete');
                    if (id) void deleteMqProfile(id);
                    return;
                }
                const btn = ev.target && ev.target.closest && ev.target.closest('[data-mq-toggle]');
                if (!btn) return;
                ev.preventDefault();
                const id = btn.getAttribute('data-mq-toggle');
                const en = btn.getAttribute('data-mq-enabled') === '1';
                if (id) void toggleMqProfileEnabled(id, en);
            });
            updateMqTemplateHint();
            void ensureMqUniverseDatalist();
        }

        function requireMaintTokenForM2(maintMsg) {
            if (getMaintenanceToken()) return true;
            const hint = '请先在维护面板保存维护令牌（与 NEXT_K_MAINTENANCE_TOKEN 一致）';
            if (maintMsg) maintMsg.innerHTML = '<span class="text-warn">' + escHtml(hint) + '</span>';
            else alert(hint);
            return false;
        }

        async function pollM2ProvisionUntilDone(baselineUtc, maintMsg, label) {
            const deadline = Date.now() + 35 * 60 * 1000;
            let lastHint = '';
            while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 12000));
                try {
                    const row = await API.m2LastAutoRun();
                    if (row && row.has_run && row.saved_at_utc
                        && (!baselineUtc || row.saved_at_utc > baselineUtc)
                        && (row.trigger === 'manual' || row.trigger === 'chain_after_bootstrap')) {
                        const s = row.stats || {};
                        const summary = row.summary_text || '';
                        if (maintMsg) {
                            maintMsg.innerHTML = '<span class="text-neon-green">' + escHtml(label) + ' 完成</span>'
                                + '<p class="mt-1 text-[10px] text-text-muted">触发 ' + escHtml(row.trigger || '')
                                + ' · 新建 ' + escHtml(String(s.created ?? 0))
                                + ' · 启用 ' + escHtml(String(s.enabled_profiles ?? 0)) + '</p>'
                                + (summary
                                    ? '<pre class="mt-2 text-[10px] text-neon-green/90 whitespace-pre-wrap break-words border border-neon-green/25 rounded p-2 bg-neon-green/5">' + escHtml(summary) + '</pre>'
                                    : '')
                                + '<pre class="mt-1 text-[10px] text-text-secondary whitespace-pre-wrap break-words">' + escHtml(JSON.stringify(row, null, 2)) + '</pre>';
                        }
                        await hydrateM2Board();
                        return;
                    }
                    lastHint = row && row.has_run
                        ? '等待新一轮汇总（最近 ' + (row.saved_at_utc || '').slice(0, 19) + '）…'
                        : '尚无汇总记录，任务可能仍在跑…';
                } catch (e) {
                    lastHint = '轮询汇总失败，任务可能仍在后台…';
                }
                if (maintMsg) {
                    maintMsg.textContent = label + '（后台执行中，12s 轮询） ' + lastHint;
                }
            }
            if (maintMsg) {
                maintMsg.innerHTML = '<span class="text-warn">' + escHtml(label)
                    + ' 轮询超时</span><p class="mt-1 text-[10px] text-text-muted">任务可能仍在服务端执行，请稍后点 Moss2 刷新或看 Railway 日志 [moss2] auto_provision</p>';
            }
        }

        async function runM2MaintAction(btnId, label, runner, opts) {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById(btnId);
            const syncWait = opts && opts.syncWait;
            if (!requireMaintTokenForM2(maintMsg)) return;
            if (btn) btn.disabled = true;
            if (maintMsg) {
                maintMsg.textContent = syncWait
                    ? label + '（同步回测中，约 5–15 分钟）…'
                    : label + '…';
            }
            try {
                const out = await runner();
                const accepted = out && out.accepted;
                const failed = out && out.ok === false;
                const head = failed
                    ? '<span class="text-warn">' + escHtml(label) + ' 未执行</span>'
                    : accepted
                        ? '<span class="text-neon-green">' + escHtml(label) + ' 已提交后台</span>'
                        : '<span class="text-neon-green">' + escHtml(label) + ' 完成</span>';
                const note = failed
                    ? '<p class="mt-1 text-[10px] text-text-muted">' + escHtml(out.hint || out.error || out.reason || '') + '</p>'
                    : accepted
                        ? '<p class="mt-1 text-[10px] text-text-muted">' + escHtml(out.hint || '任务在服务端执行，数分钟内完成；期间 API 应保持可连接。完成后点 Moss2 刷新。') + '</p>'
                        : '';
                const summaryBlock = out && out.summary_text
                    ? '<pre class="mt-2 text-[10px] text-neon-green/90 whitespace-pre-wrap break-words border border-neon-green/25 rounded p-2 bg-neon-green/5">' + escHtml(out.summary_text) + '</pre>'
                    : '';
                if (maintMsg) {
                    maintMsg.innerHTML = head + note + summaryBlock
                        + '<pre class="mt-1 text-[10px] text-text-secondary whitespace-pre-wrap break-words">' + escHtml(JSON.stringify(out, null, 2)) + '</pre>';
                }
                if (!accepted && !failed) await hydrateM2Board();
                else void checkConnection();
                if (opts && opts.pollProvision && accepted) {
                    const baseline = opts.baselineUtc || '';
                    void pollM2ProvisionUntilDone(baseline, maintMsg, label);
                }
            } catch (e) {
                const msg = (e && e.name === 'AbortError')
                    ? '提交超时：服务端可能繁忙，任务或已入队。请 1–2 分钟后点 Moss2 刷新，或看 maint-msg 轮询结果'
                    : (e.message || String(e));
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">' + escHtml(label) + ' 失败：' + escHtml(msg) + '</span>';
                if (opts && opts.pollProvision) {
                    void pollM2ProvisionUntilDone(opts.baselineUtc || '', maintMsg, label);
                }
            } finally {
                if (!(opts && opts.pollProvision)) {
                    if (btn) btn.disabled = false;
                } else if (btn) {
                    setTimeout(() => { btn.disabled = false; }, 60000);
                }
            }
        }

        async function runM2PaperScanMaint() {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-m2-paper-scan');
            if (!requireMaintTokenForM2(maintMsg)) return;
            if (btn) btn.disabled = true;
            if (maintMsg) maintMsg.textContent = 'Moss2 纸面扫描执行中（同步，约 10–60 秒）…';
            try {
                const out = await API.m2PaperScan({ sync: true });
                if (!out || out.ok === false) {
                    const hint = out && (out.hint || out.error || out.reason || '');
                    if (maintMsg) {
                        maintMsg.innerHTML = '<span class="text-warn">Moss2 纸面扫描未执行</span>'
                            + (hint ? '<p class="mt-1 text-[10px] text-text-muted">' + escHtml(hint) + '</p>' : '')
                            + '<pre class="mt-1 text-[10px] text-text-secondary whitespace-pre-wrap break-words">' + escHtml(JSON.stringify(out, null, 2)) + '</pre>';
                    }
                    return;
                }
                await hydrateM2Board();
                const summary = '扫描 ' + (out.profiles_scanned ?? 0)
                    + ' · 开 ' + (out.opens ?? 0)
                    + ' · 平 ' + (out.closes ?? 0);
                if (maintMsg) {
                    maintMsg.innerHTML = '<span class="text-neon-green">Moss2 纸面扫描完成</span>'
                        + '<p class="mt-1 text-[10px] text-text-muted">' + escHtml(summary)
                        + ' · 已刷新 Moss2 看板 15m 摘要</p>'
                        + '<pre class="mt-1 text-[10px] text-text-secondary whitespace-pre-wrap break-words">' + escHtml(JSON.stringify(out, null, 2)) + '</pre>';
                }
                const m2Section = document.getElementById('m2-lane-section');
                if (m2Section && typeof m2Section.scrollIntoView === 'function') {
                    m2Section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            } catch (e) {
                const msg = (e && e.name === 'AbortError')
                    ? '扫描超时（>120s）：服务端可能仍在执行，请稍后点 Moss2「刷新」'
                    : (e.message || String(e));
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">Moss2 纸面扫描失败：' + escHtml(msg) + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function clearM2LaneData() {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-m2-clear-db');
            if (!getMaintenanceToken()) {
                const hint = '请先在维护面板保存维护令牌';
                if (maintMsg) maintMsg.innerHTML = '<span class="text-warn">' + escHtml(hint) + '</span>';
                else alert(hint);
                return;
            }
            if (!confirm('确定清空 Moss2（Factory）全部 Profile / 信号 / 回测 / 扫描记录？不可撤销，且不影响 Moss1。')) return;
            if (btn) btn.disabled = true;
            if (maintMsg) maintMsg.textContent = 'Moss2 清库请求中…';
            try {
                const out = await API.m2ClearDb();
                const line = 'Moss2 已清库 · signals=' + escHtml(String(out.deleted_moss2_signals ?? 0))
                    + ' · profiles=' + escHtml(String(out.deleted_moss2_profiles ?? 0));
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-green">' + line + '</span>';
                await hydrateM2Board();
            } catch (e) {
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function clearMqLaneData() {
            const maintMsg = document.getElementById('maint-msg');
            const btn = document.getElementById('maint-mq-clear-db');
            if (!getMaintenanceToken()) {
                const hint = '请先在维护面板保存维护令牌';
                if (maintMsg) maintMsg.innerHTML = '<span class="text-warn">' + escHtml(hint) + '</span>';
                else alert(hint);
                return;
            }
            if (!confirm('确定清空 Moss 量化全部实仓/回测/profile 数据？不可撤销。')) return;
            if (btn) btn.disabled = true;
            if (maintMsg) maintMsg.textContent = 'Moss 清库请求中…';
            try {
                const out = await API.mqClearDb();
                const line = 'Moss 已清库 · signals=' + escHtml(String(out.deleted_moss_signals ?? 0))
                    + ' · profiles=' + escHtml(String(out.deleted_moss_profiles ?? 0));
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-green">' + line + '</span>';
                await hydrateMqBoard();
            } catch (e) {
                if (maintMsg) maintMsg.innerHTML = '<span class="text-neon-red">' + escHtml(e.message || String(e)) + '</span>';
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        function zctSideClass(side) {
            if (side === 'LONG') return 'text-neon-green font-medium';
            if (side === 'SHORT') return 'text-neon-red font-medium';
            return 'text-text-muted';
        }

        function zctStatusClass(statusText) {
            const s = String(statusText || '');
            if (s.indexOf('持仓') >= 0) return 'text-neon-yellow';
            if (s.indexOf('盈利') >= 0) return 'text-neon-green';
            if (s.indexOf('止损') >= 0) return 'text-neon-red';
            if (s.indexOf('超时') >= 0) return 'text-warn/95';
            if (s.indexOf('信号结束') >= 0) return 'text-accent/90';
            return 'text-text-secondary';
        }

        /** 供「记录实盘」回填当前行 */
        let zctVwapLastItems = [];

        /** 来自 summary.per_symbol，用于表格按标的展示胜率（无需额外 API） */
        function buildZctPerSymbolMap(sum) {
            const m = new Map();
            const arr = sum && Array.isArray(sum.per_symbol) ? sum.per_symbol : [];
            arr.forEach((p) => {
                const k = p && p.symbol ? String(p.symbol).toUpperCase() : '';
                if (k) m.set(k, p);
            });
            return m;
        }

        function fmtZctSymWinRate(ps, key) {
            const v = ps && ps[key];
            if (v == null || v === '') return '—';
            const n = Number(v);
            if (Number.isNaN(n)) return '—';
            return (n * 100).toFixed(1) + '%';
        }

        function renderZctVwapSummary(sum, summaryElId) {
            const el = document.getElementById(summaryElId || 'zct-vwap-summary');
            if (!el) return;
            if (!sum || !sum.ok) {
                el.innerHTML = '';
                return;
            }
            const pnl = Number(sum.total_pnl_usdt) || 0;
            const pnlCls = pnl >= 0 ? 'text-neon-green' : 'text-neon-red';
            const wrTouch = sum.win_rate_touch != null ? sum.win_rate_touch : sum.win_rate_closed;
            const wrAll = sum.win_rate_all_pnl;
            const wrTouchStr = wrTouch != null ? (Number(wrTouch) * 100).toFixed(1) + '%' : '—';
            const wrAllStr = wrAll != null ? (Number(wrAll) * 100).toFixed(1) + '%' : '—';
            el.innerHTML = `
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">持仓中</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.open_positions ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">已结算</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(String(sum.settled_count ?? 0))}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2">
                    <div class="text-text-muted text-[10px] uppercase tracking-wide">累计盈亏 (USDT)</div>
                    <div class="text-lg font-semibold font-mono ${pnlCls}">${fmtZctPx(pnl, 2)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2" title="全部 settlements：触轨 win/(win+loss)，与本系统纸面规则一致">
                    <div class="text-text-muted text-[10px] tracking-wide">系统 · 触轨胜率</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(wrTouchStr)}</div>
                </div>
                <div class="bg-surface-light/30 rounded-lg border border-border/70 px-3 py-2" title="全部 settlements：盈亏为正笔数 /（正+负）">
                    <div class="text-text-muted text-[10px] tracking-wide">系统 · 全量胜率</div>
                    <div class="text-lg font-semibold text-text-primary">${escHtml(wrAllStr)}</div>
                </div>`;
        }

        /**
         * @param {{ rootId?: string, manualLane?: string }} [opts]
         */
        function renderZctVwapTable(items, totalHint, perSymMap, opts) {
            opts = opts || {};
            const rootId = opts.rootId || 'zct-vwap-root';
            const manualLane = opts.manualLane || '';
            const root = document.getElementById(rootId);
            if (!root) return;
            zctVwapLastItems = items || [];
            const pmap = perSymMap instanceof Map ? perSymMap : new Map();
            const head = `
                <table class="w-full text-left text-xs border-collapse min-w-[1560px]">
                    <thead>
                        <tr class="border-b border-border/80 text-text-muted uppercase tracking-wide text-[10px]">
                            <th class="py-2 pr-2 font-medium">#</th>
                            <th class="py-2 pr-2 font-medium whitespace-nowrap">时间 UTC</th>
                            <th class="py-2 pr-2 font-medium">标的</th>
                            <th class="py-2 pr-2 font-medium text-right whitespace-nowrap" title="该标的 settlements 历史：win+loss 触轨笔数">触轨胜率</th>
                            <th class="py-2 pr-2 font-medium text-right whitespace-nowrap" title="该标的 settlements：盈亏为正笔数 /（正+负），不含零盈亏">全量胜率</th>
                            <th class="py-2 pr-2 font-medium text-right whitespace-nowrap" title="该标的全部已结算记录的 pnl_usdt 合计（summary.per_symbol.total_pnl_usdt）">标的累计盈亏U</th>
                            <th class="py-2 pr-2 font-medium">策略</th>
                            <th class="py-2 pr-2 font-medium">方向</th>
                            <th class="py-2 pr-2 font-medium text-right">入场</th>
                            <th class="py-2 pr-2 font-medium text-right">SL</th>
                            <th class="py-2 pr-2 font-medium text-right">TP</th>
                            <th class="py-2 pr-2 font-medium text-right">名义U</th>
                            <th class="py-2 pr-2 font-medium">状态</th>
                            <th class="py-2 pr-2 font-medium text-right">平仓</th>
                            <th class="py-2 pr-2 font-medium text-right">R</th>
                            <th class="py-2 pr-2 font-medium text-right">盈亏U</th>
                            <th class="py-2 pr-2 font-medium text-right">实盘入</th>
                            <th class="py-2 pr-2 font-medium text-right">实盘平</th>
                            <th class="py-2 pr-2 font-medium text-right">实盘盈亏</th>
                            <th class="py-2 pr-2 font-medium max-w-[100px]">实盘备注</th>
                            <th class="py-2 pr-2 font-medium">摘要</th>
                            <th class="py-2 pr-2 font-medium whitespace-nowrap">操作</th>
                        </tr>
                    </thead>
                    <tbody>`;
            if (!items || !items.length) {
                root.innerHTML = head + '</tbody></table>'
                    + `<p class="text-text-muted text-xs mt-2">${escHtml(totalHint || '暂无记录')}</p>`;
                return;
            }
            const rows = items.map((row) => {
                const pr = row.reasons_preview ? escHtml(row.reasons_preview) : '';
                const pnlr = row.pnl_r;
                const pnlru = row.pnl_usdt;
                const prCls = pxClass(Number(pnlru));
                const prRCls = pxClass(Number(pnlr));
                const mPnlu = row.manual_pnl_est_usdt;
                const mPnluCls = pxClass(Number(mPnlu));
                const mn = row.manual_notes != null ? escHtml(String(row.manual_notes)) : '';
                const symU = String(row.symbol || '').toUpperCase();
                const ps = pmap.get(symU);
                const wrT = escHtml(fmtZctSymWinRate(ps, 'win_rate_touch'));
                const wrA = escHtml(fmtZctSymWinRate(ps, 'win_rate_all_pnl'));
                let symPnlNum = null;
                if (ps && ps.total_pnl_usdt != null && ps.total_pnl_usdt !== '') {
                    const t = Number(ps.total_pnl_usdt);
                    if (Number.isFinite(t)) symPnlNum = t;
                }
                const symPnlCls = symPnlNum != null ? pxClass(symPnlNum) : '';
                const symPnlDisp = symPnlNum != null ? escHtml(fmtZctPx(symPnlNum, 2)) : '—';
                return `<tr class="border-b border-border/60 hover:bg-surface-light/30 align-top">
                    <td class="py-2 pr-2 font-mono whitespace-nowrap">${escHtml(String(row.id))}</td>
                    <td class="py-2 pr-2 font-mono whitespace-nowrap text-[11px]">${escHtml(String(row.recorded_at_utc || '').replace('T', ' ').replace('Z', ''))}</td>
                    <td class="py-2 pr-2 font-mono whitespace-nowrap">${escHtml(row.symbol)}</td>
                    <td class="py-2 pr-2 font-mono text-right text-[11px]">${wrT}</td>
                    <td class="py-2 pr-2 font-mono text-right text-[11px]">${wrA}</td>
                    <td class="py-2 pr-2 font-mono text-right text-[11px] ${symPnlCls}">${symPnlDisp}</td>
                    <td class="py-2 pr-2 max-w-[140px] truncate" title="${escHtml(row.play)}">${escHtml(row.play)}</td>
                    <td class="py-2 pr-2 whitespace-nowrap ${zctSideClass(row.side)}">${escHtml(row.side)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.entry_price, 6)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.sl_price, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.tp_price, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.virtual_notional_usdt, 0)}</td>
                    <td class="py-2 pr-2 whitespace-nowrap ${zctStatusClass(row.display_status)}">${escHtml(row.display_status || '')}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.exit_price, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right ${prRCls}">${fmtZctPx(row.pnl_r, 3)}</td>
                    <td class="py-2 pr-2 font-mono text-right ${prCls}">${fmtZctPx(row.pnl_usdt, 2)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.manual_entry_price, 6)}</td>
                    <td class="py-2 pr-2 font-mono text-right">${fmtZctPx(row.manual_exit_price, 4)}</td>
                    <td class="py-2 pr-2 font-mono text-right ${mPnluCls}">${fmtZctPx(mPnlu, 2)}</td>
                    <td class="py-2 pr-2 text-[11px] text-text-muted max-w-[100px] truncate" title="${mn}">${mn}</td>
                    <td class="py-2 pr-2 text-[11px] text-text-muted max-w-[200px] truncate" title="${pr}">${pr}</td>
                    <td class="py-2 pr-2 whitespace-nowrap">
                        <button type="button" data-zct-manual="${escHtml(String(row.id))}" ${manualLane ? `data-zct-lane="${escHtml(manualLane)}"` : ''} class="btn-secondary px-2 py-1 rounded-md bg-surface-light/80 border border-border/90 text-text-secondary text-[10px] font-medium hover:border-accent/40 hover:text-accent">记录实盘</button>
                    </td>
                </tr>`;
            }).join('');
            const foot = `<p class="text-text-muted text-[11px] mt-2">共 ${escHtml(String(items.length))} 条`
                + (totalHint ? `（匹配 ${escHtml(String(totalHint))}）` : '')
                + '</p>';
            root.innerHTML = head + rows + '</tbody></table>' + foot;
        }

        async function hydrateZctVwapBoard() {
            const root = document.getElementById('zct-vwap-root');
            const tsEl = document.getElementById('zct-vwap-ts');
            if (!root) return;
            root.innerHTML = '<div class="text-text-muted text-sm animate-pulse">加载 ZCT…</div>';
            try {
                const sum = await API.zctVwapSummary();
                renderZctVwapSummary(sum);
                const perSymMap = buildZctPerSymbolMap(sum);
                const stEl = document.getElementById('zct-vwap-filter-status');
                const symEl = document.getElementById('zct-vwap-filter-symbol');
                const qs = new URLSearchParams({ limit: '200', offset: '0', status: stEl ? stEl.value : 'all' });
                if (symEl && symEl.value.trim()) qs.set('symbol', symEl.value.trim().toUpperCase());
                const sig = await API.zctVwapSignals(qs);
                const items = sig.items || [];
                renderZctVwapTable(items, sig.total != null ? String(sig.total) : '', perSymMap, {});
                if (tsEl) tsEl.textContent = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
            } catch (e) {
                console.error('zct-vwap:', e);
                renderZctVwapSummary(null);
                root.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(e && e.message ? String(e.message) : '加载失败') + '</div>';
                if (tsEl) tsEl.textContent = '--';
            }
        }


        async function zctVwapEditManual(id) {
            const row = zctVwapLastItems.find((r) => Number(r.id) === Number(id));
            if (!row) {
                window.alert('未找到该行，请先刷新列表。');
                return;
            }
            const defE = row.manual_entry_price != null ? String(row.manual_entry_price) : '';
            const defX = row.manual_exit_price != null ? String(row.manual_exit_price) : '';
            const defN = row.manual_notes != null ? String(row.manual_notes) : '';
            const e = window.prompt(`[${id}] 实盘入场价（数字，留空跳过本字段）`, defE);
            if (e === null) return;
            const x = window.prompt(`[${id}] 实盘平仓价（数字，留空跳过本字段）`, defX);
            if (x === null) return;
            const n = window.prompt(`[${id}] 实盘备注`, defN);
            if (n === null) return;
            const body = {};
            const et = e.trim();
            const xt = x.trim();
            if (et !== '') {
                const v = parseFloat(et.replace(/,/g, ''));
                if (Number.isFinite(v)) body.manual_entry_price = v;
            }
            if (xt !== '') {
                const v = parseFloat(xt.replace(/,/g, ''));
                if (Number.isFinite(v)) body.manual_exit_price = v;
            }
            body.manual_notes = n;
            try {
                await API.zctVwapPatchManual(id, body);
                await hydrateZctVwapBoard();
                showToast('实盘记录已保存', true);
            } catch (err) {
                console.error('zct-vwap manual:', err);
                showToast('保存失败：' + (err && err.message ? String(err.message) : '未知错误'), false);
            }
        }

        function fillOiRadarFromPayload(data, body, tsEl) {
            if (!body) return;
            tsEl.textContent = data.generated_at_cst || '';

            const hot = (data.hot_coins || []).slice(0, 8).map(d => {
                const px = Number(d.px_chg);
                const line = `<span class="font-semibold text-text-primary w-14 inline-block">${escHtml(d.coin)}</span> <span class="text-text-muted">${formatMcapUsd(d.est_mcap)}</span> <span class="${pxClass(px)}">${px >= 0 ? '+' : ''}${px.toFixed(0)}%</span> <span class="text-text-muted">|</span> ${oiRadarHotTags(d)}`;
                return oiRadarRowClickable(d.sym, line);
            }).join('') || '<div class="text-text-muted text-xs">暂无热度标的</div>';

            const chase = (data.chase || []).slice(0, 8).map(d => {
                const px = Number(d.px_chg);
                const line = `<span class="font-semibold text-text-primary w-16 inline-block">${escHtml(d.coin)}</span> <span class="text-neon-blue font-mono">${Number(d.fr_pct).toFixed(3)}%</span> <span class="text-text-muted">${escHtml(d.trend || '')}</span> <span class="text-text-muted">|</span> <span class="${pxClass(px)}">${px >= 0 ? '+' : ''}${px.toFixed(0)}%</span> <span class="text-text-muted">|</span> <span class="text-text-muted">${formatMcapUsd(d.est_mcap)}</span>`;
                return oiRadarRowClickable(d.sym, line);
            }).join('') || '<div class="text-text-muted text-xs">暂无追多标的</div>';

            const combined = (data.combined || []).slice(0, 8).map(d => {
                const dims = [];
                if (d.f_sc >= 10) dims.push('<span class="text-neon-blue">🧊' + Number(d.fr_pct).toFixed(2) + '%</span>');
                if (d.m_sc >= 12) dims.push('<span class="text-warn/95">💎' + formatMcapUsd(d.est_mcap) + '</span>');
                if (d.s_sc >= 10) dims.push('<span class="text-text-secondary">💤' + (Number(d.sw_days) || 0) + '天</span>');
                if (d.o_sc >= 10) dims.push('<span class="text-neon-purple">⚡OI' + (Number(d.d6h) >= 0 ? '+' : '') + Number(d.d6h).toFixed(0) + '%</span>');
                const line = `<span class="font-semibold text-text-primary w-14 inline-block">${escHtml(d.coin)}</span> <span class="text-neon-green font-mono">${Number(d.total).toFixed(0)}分</span> <span class="text-text-muted">|</span> ${dims.join(' ')}`;
                return oiRadarRowClickable(d.sym, line);
            }).join('') || '<div class="text-text-muted text-xs">暂无综合上榜</div>';

            const ambush = (data.ambush || []).slice(0, 8).map(d => {
                const dark = Number(d.d6h) > 2 && Math.abs(Number(d.px_chg)) < 5;
                const parts = [
                    '<span class="text-text-muted">' + formatMcapUsd(d.est_mcap) + '</span>',
                    '<span class="text-neon-purple">OI' + (Number(d.d6h) >= 0 ? '+' : '') + Number(d.d6h).toFixed(0) + '%</span>'
                ];
                if (dark) parts.push('<span class="text-warn/95">🎯暗流</span>');
                if (Number(d.sw_days) >= 45) parts.push('<span class="text-text-secondary">横盘' + Number(d.sw_days).toFixed(0) + '天</span>');
                if (Number(d.fr_pct) < -0.01) parts.push('<span class="text-neon-blue">费率' + Number(d.fr_pct).toFixed(2) + '%</span>');
                const line = `<span class="font-semibold text-text-primary w-14 inline-block">${escHtml(d.coin)}</span> <span class="text-neon-green font-mono">${Number(d.total).toFixed(0)}分</span> <span class="text-text-muted">|</span> ${parts.join(' ')}`;
                return oiRadarRowClickable(d.sym, line);
            }).join('') || '<div class="text-text-muted text-xs">暂无埋伏标的</div>';

            const highlights = (data.highlights || []).map(h =>
                `<div class="flex items-start gap-3 text-sm md:text-base text-text-primary leading-snug py-1 border-b border-border/35 last:border-0"><span class="text-accent text-lg shrink-0 leading-none mt-0.5 opacity-90">▸</span><span class="font-medium">${escHtml(h)}</span></div>`
            ).join('') || '<div class="text-text-muted text-sm py-2">暂无提醒</div>';


            const legend = `
                <div class="mt-4 pt-3 border-t border-border text-text-muted text-[11px] leading-relaxed space-y-0.5">
                    <div class="font-medium text-text-secondary mb-1">📖 图例</div>
                    <div>热度 = CG 热搜 + 成交量暴增（OI 领先指标）</div>
                    <div>费率负 = 空头燃料 · 💎 市值 · 💤 横盘（吸筹）</div>
                    <div>🔥💤 热度+吸筹 = 最强预判 · 🔥⚡ 热度+OI = 正在发生</div>
                    <div class="mt-2 text-accent/85">点击标的可在新标签页打开币安合约</div>
                </div>`;

            const highlightsHtml = `
                <div class="highlights-hero rounded-xl p-4 md:p-5 h-full min-h-[160px] min-w-0 flex flex-col">
                    <div class="flex flex-wrap items-end gap-3 mb-1 shrink-0">
                        <div class="flex items-center gap-2">
                            <span class="text-2xl md:text-3xl leading-none" aria-hidden="true">💡</span>
                            <h3 class="hl-title text-lg md:text-2xl font-extrabold tracking-tight">值得关注</h3>
                        </div>
                        <span class="text-xs text-accent/70 font-medium uppercase tracking-wider">优先信号</span>
                    </div>
                    <div class="space-y-0 flex-1 min-h-0 min-w-0 overflow-x-auto overflow-y-auto max-h-[min(320px,46vh)] lg:max-h-[min(400px,calc(100vh-260px))] pr-1">${highlights}</div>
                </div>`;

            const hlSlot = document.getElementById('oi-radar-highlights-slot');
            if (hlSlot) {
                hlSlot.innerHTML = highlightsHtml;
            }

            const gridBlock = `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    ${oiRadarCard('热度榜', '🔥', hot)}
                    ${oiRadarCard('追多（按费率）', '🔥', chase)}
                    ${oiRadarCard('综合', '📊', combined)}
                    ${oiRadarCard('埋伏', '🎯', ambush)}
                </div>
                ${legend}`;

            body.innerHTML = hlSlot ? gridBlock : (highlightsHtml + gridBlock);
            bindOiRadarPickHandlers(body);
            hydrateWorthHighlightBoards(data);
        }

        async function runOiRadarBackgroundPoll(body, tsEl) {
            const hl = document.getElementById('oi-radar-highlights-slot');
            let j;
            try {
                j = await API.accumulationOiRadarRefresh();
            } catch (e) {
                const msg = e && e.message ? String(e.message) : '刷新失败';
                body.innerHTML = '<div class="text-neon-red text-sm">' + escHtml(msg) + '</div>';
                if (hl) {
                    hl.innerHTML =
                        '<div class="rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm text-warn">' +
                        escHtml(msg) +
                        '</div>';
                }
                return;
            }
            if (!j.accepted) {
                if (j.busy) {
                    body.innerHTML = '<div class="text-warn text-sm">已有扫描在运行，请约 1–2 分钟后再点刷新。</div>';
                    if (hl) {
                        hl.innerHTML = '<div class="rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm text-warn">收筹快照扫描排队中，值得关注稍后更新。</div>';
                    }
                }
                return;
            }
            for (let i = 0; i < 45; i++) {
                body.innerHTML = `<div class="text-text-muted text-sm py-3">后台扫描中（约 1–2 分钟）… 已等待 ${i + 1}/45 轮</div>`;
                if (hl) {
                    hl.innerHTML = `<div class="rounded-xl border border-border bg-surface-light/30 p-4 text-text-muted text-sm">后台扫描中… 已等待 ${i + 1}/45 轮<br/><span class="text-xs text-text-muted/80">值得关注将在完成后显示在首屏左侧</span></div>`;
                }
                await new Promise((r) => setTimeout(r, 4000));
                const data = await API.accumulationOiRadar();
                if (data && data.ok) {
                    fillOiRadarFromPayload(data, body, tsEl);
                    return;
                }
            }
            body.innerHTML = '<div class="text-warn text-sm">扫描较久仍未写入快照，请稍后再试或查看后端日志。</div>';
            if (hl) {
                hl.innerHTML = '<div class="rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm text-warn">快照仍未就绪，值得关注暂无法更新。</div>';
            }
            void hydrateWorthHighlightBoards(null);
        }

        async function clearAccumulationPool() {
            if (!confirm('确定清空收筹池（SQLite 表 watchlist）？\n\n清空后须重新运行 pool 扫描（定时每日 10:00 或维护里的「pool 收筹池」），再点「刷新」，否则 OI 雷达无法基于池内标的计算。')) {
                return;
            }
            const btn = document.getElementById('maint-clear-pool');
            const refreshBtn = document.getElementById('oi-radar-refresh');
            try {
                if (btn) btn.disabled = true;
                if (refreshBtn) refreshBtn.disabled = true;
                const out = await API.clearWatchlistPool();
                const n = out.cleared_rows && out.cleared_rows.watchlist != null ? out.cleared_rows.watchlist : '?';
                alert(`已清空收筹池（删除 ${n} 条）。请先运行 pool 再点「刷新」。`);
                await loadAccumulationOiRadar({ forceRefresh: false });
            } catch (e) {
                console.error(e);
                alert(e && e.message ? String(e.message) : '清理失败');
            } finally {
                if (btn) btn.disabled = false;
                if (refreshBtn) refreshBtn.disabled = false;
            }
        }

        let _oiRadarLoading = false;
        async function loadAccumulationOiRadar(options = {}) {
            if (_oiRadarLoading) return;
            _oiRadarLoading = true;
            const forceRefresh = options.forceRefresh === true;
            const body = document.getElementById('oi-radar-body');
            const tsEl = document.getElementById('oi-radar-ts');
            const btn = document.getElementById('oi-radar-refresh');
            const hl = document.getElementById('oi-radar-highlights-slot');
            if (!body) return;
            if (btn) btn.disabled = true;

            try {
                if (forceRefresh) {
                    tsEl.textContent = '…';
                    if (hl) {
                        hl.innerHTML = '<div class="rounded-xl border border-border bg-surface p-4 text-text-muted text-sm animate-pulse">正在刷新收筹快照…</div>';
                    }
                    await runOiRadarBackgroundPoll(body, tsEl);
                    return;
                }

                tsEl.textContent = '…';
                body.innerHTML = '<div class="text-text-muted text-sm animate-pulse py-2">加载快照…</div>';
                if (hl) {
                    hl.innerHTML = '<div class="rounded-xl border border-border bg-surface p-4 text-text-muted text-sm animate-pulse">加载值得关注…</div>';
                }
                const data = await API.accumulationOiRadar();

                if (data.ok) {
                    fillOiRadarFromPayload(data, body, tsEl);
                    return;
                }

                tsEl.textContent = '';
                if (data.error === 'no_snapshot') {
                    body.innerHTML = `<div class="rounded-xl border border-warn/25 bg-warn/10 p-3 text-sm text-warn">${escHtml(data.message || '尚无快照')}</div><p class="text-text-muted text-xs mt-2">正在启动后台扫描并自动轮询（约 1–2 分钟）…</p>`;
                    if (hl) {
                        hl.innerHTML = '<div class="rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm text-warn">尚无快照，正在后台拉取…<br/><span class="text-xs text-text-muted/90 mt-2 block">完成后「值得关注」将出现在本区域</span></div>';
                    }
                    void hydrateWorthHighlightBoards(null);
                    await runOiRadarBackgroundPoll(body, tsEl);
                    return;
                }

                body.innerHTML = `<div class="rounded-xl border border-warn/25 bg-warn/10 p-3 text-sm text-warn">${escHtml(data.message || data.error || '暂无数据')}</div>`;
                if (hl) {
                    hl.innerHTML = `<div class="rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm text-warn">${escHtml(data.message || data.error || '暂无数据')}</div>`;
                }
                void hydrateWorthHighlightBoards(data);
            } catch (e) {
                console.error('OI radar:', e);
                tsEl.textContent = '';
                const msg = e && e.message ? String(e.message) : '加载失败';
                const isNet = /fail(ed)? to fetch|networkerror|load failed/i.test(msg);
                const hint = isNet
                    ? '<p class="text-text-muted text-xs mt-2">请确认 API 可访问（如需切换 API base，可在 localStorage 设置 <code class="text-accent font-mono text-[11px]">NEXT_K_API_BASE</code>）。</p>'
                    : '';
                body.innerHTML = `<div class="text-neon-red text-sm">${escHtml(msg)}</div>${hint}`;
                if (hl) {
                    hl.innerHTML = `<div class="text-neon-red text-sm p-4">${escHtml(msg)}</div>`;
                }
                void hydrateWorthHighlightBoards({});
                // 仅当用户主动点刷新时才弹 toast，避免初始化失败重复打扰
                if (forceRefresh) showToast('OI 雷达刷新失败：' + msg, false);
            } finally {
                if (btn) btn.disabled = false;
                _oiRadarLoading = false;
            }
        }

        function openMaintPanel() {
            const panel = document.getElementById('maint-panel');
            if (!panel) return;
            panel.classList.remove('hidden');
            updateMaintTokenStatus();
            void ensureMqUniverseDatalist();
            if (_mqProfilesCache && _mqProfilesCache.length) {
                syncMqResearchProfileSelect(_mqProfilesCache);
            }
        }

        function closeMaintPanel() {
            const panel = document.getElementById('maint-panel');
            if (panel) panel.classList.add('hidden');
            try {
                const u = new URL(window.location.href);
                if (u.searchParams.get('maint') === '1') {
                    u.searchParams.delete('maint');
                    window.history.replaceState({}, '', u.pathname + u.search + u.hash);
                }
            } catch (e) { /* ignore */ }
        }

        function setupMaintPanel() {
            const msg = document.getElementById('maint-msg');

            try {
                const params = new URLSearchParams(window.location.search);
                if (params.get('maint') === '1') openMaintPanel();
                // 拒绝从 URL 读 maint_token —— 出现就立即清掉，避免被书签 / 历史 / Referer 泄露
                if (params.has('maint_token')) {
                    try {
                        const u = new URL(window.location.href);
                        u.searchParams.delete('maint_token');
                        window.history.replaceState({}, '', u.pathname + u.search + u.hash);
                    } catch (eUrl) { /* ignore */ }
                }
            } catch (e) { /* ignore */ }

            updateMaintTokenStatus();

            const tokenInput = document.getElementById('maint-token-input');
            document.getElementById('maint-token-save')?.addEventListener('click', () => {
                const raw = tokenInput ? String(tokenInput.value || '').trim() : '';
                if (!raw) {
                    if (msg) msg.innerHTML = '<span class="text-warn">请先输入维护令牌</span>';
                    return;
                }
                if (!setMaintenanceToken(raw)) {
                    if (msg) msg.innerHTML = '<span class="text-neon-red">无法写入 localStorage</span>';
                    return;
                }
                if (tokenInput) tokenInput.value = '';
                updateMaintTokenStatus();
                if (msg) msg.innerHTML = '<span class="text-neon-green">维护令牌已保存</span>';
            });
            tokenInput?.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') {
                    ev.preventDefault();
                    document.getElementById('maint-token-save')?.click();
                }
            });
            document.getElementById('maint-token-clear')?.addEventListener('click', () => {
                if (!confirm('确定清除本浏览器保存的维护令牌？')) return;
                clearMaintenanceToken();
                if (tokenInput) tokenInput.value = '';
                updateMaintTokenStatus();
                if (msg) msg.textContent = '已清除维护令牌';
            });

            let trip = 0;
            let tripT = 0;
            const brand = document.getElementById('footer-brand-line');
            if (brand) {
                brand.addEventListener('click', () => {
                    const now = Date.now();
                    if (now - tripT > 1000) trip = 0;
                    tripT = now;
                    trip += 1;
                    if (trip >= 5) {
                        trip = 0;
                        openMaintPanel();
                    }
                });
            }

            document.getElementById('maint-close')?.addEventListener('click', closeMaintPanel);

            async function runClear(tables) {
                if (!msg) return;
                msg.textContent = '请求中…';
                try {
                    const data = await API.clearWatchTables(tables);
                    msg.innerHTML = '<span class="text-neon-green">ok · ' + escHtml(JSON.stringify(data.cleared_rows || data)) + '</span>';
                    hydrateWorthHighlightBoards({});
                    const reloadOi = tables.some((t) => (
                        t === 'watchlist'
                        || t === 'focus_watch'
                        || t === 'ambush_watch'
                        || t === 'heat_accum_watch'
                        || t === 'patrick_core_watch'
                        || t === 'worth_watch_all'
                        || (typeof t === 'string' && t.startsWith('worth_watch_'))
                    ));
                    if (reloadOi) {
                        await loadAccumulationOiRadar({ forceRefresh: false });
                    }
                } catch (e) {
                    console.error(e);
                    msg.innerHTML = '<span class="text-neon-red">' + escHtml(e && e.message ? String(e.message) : '失败') + '</span>';
                }
            }

            document.getElementById('maint-clear-both')?.addEventListener('click', async () => {
                if (
                    !confirm(
                        '确定「清理全部看盘表」？\n'
                            + '将清空 watchlist、focus_watch、ambush_watch、heat_accum_watch、patrick_core_watch，'
                            + '以及 worth 全部分类表（与后端 worth_watch_all 一致），不可撤销。\n'
                            + '清库后请再跑 pool / 刷新 OI 或点页面「刷新」。',
                    )
                ) {
                    return;
                }
                await runClear([
                    'watchlist',
                    'focus_watch',
                    'ambush_watch',
                    'heat_accum_watch',
                    'patrick_core_watch',
                    'worth_watch_all',
                ]);
            });

            const MAINT_CRON_LABELS = {
                mom_scan: '动量 topMovers 纸面扫描',
                momentum_scan: '动量 topMovers 纸面扫描',
                mom_trail: '动量移动止盈检查',
                momentum_trail: '动量移动止盈检查',
                jiezhen_scan: '接针 hot_oi 纸面扫描',
                jz_scan: '接针 hot_oi 纸面扫描',
                jiezhen_trail: '接针移动止盈检查',
                jz_trail: '接针移动止盈检查',
                moss_quant_scan: 'Moss 量化实仓扫描',
                mq_paper: 'Moss 量化实仓扫描',
                moss2_paper_scan: 'Moss2 纸面扫描',
                moss2_scan: 'Moss2 纸面扫描',
                m2_paper: 'Moss2 纸面扫描',
                orb_scan: 'ORB 美股纸面扫描',
                powder_keg: '火药桶宏观雷达（收筹池扫描 + Top5 入库）',
                touch_pool_4h: '触轨池 6h 回测（全宇宙 walk + 写库）',
            };

            document.querySelectorAll('.maint-cron-btn').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const task = btn.getAttribute('data-maint-cron');
                    if (!task || !msg) return;
                    const label = MAINT_CRON_LABELS[task] || task;
                    msg.textContent = `已提交 ${label}，服务端后台执行中（可能需数分钟）…`;
                    try {
                        const data = await API.triggerCron(task);
                        msg.innerHTML = '<span class="text-neon-green">' + escHtml(JSON.stringify(data)) + '</span>';
                    } catch (e) {
                        console.error(e);
                        msg.innerHTML = '<span class="text-neon-red">' + escHtml(e && e.message ? String(e.message) : '失败') + '</span>';
                    }
                });
            });

            /** 与后端 touch_pool_config / ZctTouchPoolScanBody 默认一致 */
            const ZCT_TOUCH_POOL_SCAN_DEFAULTS = {
                symbols_source: 'worth_watch_plus_default_22',
                days: 6 / 24,
                min_touch_win_rate: 0.8,
                min_total_trades: 10,
                min_win_loss_abs: 10,
                max_win_loss_abs: 22,
                min_touch_trades: 10,
                min_profit_factor: 1.3,
                max_consecutive_losses_at_end: 1,
                min_t4_touch_win_rate: 0,
                persist_db: true,
            };

            async function runZctTouchPoolScan(payload) {
                if (!msg) return;
                const b1 = document.getElementById('maint-vp-sample');
                const b2 = document.getElementById('maint-vp-watchlist');
                const b3 = document.getElementById('maint-zct-touch-pool');
                const busy = (on) => {
                    if (b1) b1.disabled = on;
                    if (b2) b2.disabled = on;
                    if (b3) b3.disabled = on;
                };
                busy(true);
                msg.innerHTML =
                    '<span class="text-text-muted">ZCT 触轨池 walk-forward 请求中（可能数分钟）…</span><br/>' +
                    '<span class="text-[10px] text-text-muted/80">API：<code>' +
                    escHtml(API_BASE) +
                    '</code></span>';
                try {
                    const data = await API.zctTouchPoolScan({
                        ...ZCT_TOUCH_POOL_SCAN_DEFAULTS,
                        ...(payload || {}),
                    });
                    const pool = data.pool || {};
                    const crit = pool.criteria || {};
                    const matched = pool.matched || [];
                    const rejected = pool.rejected || [];
                    const brief = {
                        ok: data.ok,
                        criteria: crit,
                        matched_count: matched.length,
                        rejected_count: rejected.length,
                        matched_symbols: pool.matched_symbols,
                        backtest_meta: pool.backtest_meta,
                    };
                    let html = '<span class="text-neon-green">触轨池完成 · ' + escHtml(JSON.stringify(brief, null, 2)) + '</span>';
                    if (matched.length) {
                        const lines = matched.map(
                            (r) =>
                                `${r.symbol}\ttouch=${(r.win_rate_touch_sl_tp != null ? (100 * r.win_rate_touch_sl_tp).toFixed(2) : '?')}%` +
                                `\tw/L=${r.win}/${r.loss}\tunr=${r.unresolved}`,
                        );
                        html +=
                            '<pre class="mt-2 text-text-muted text-[11px] whitespace-pre overflow-x-auto">' +
                            escHtml(lines.join('\n')) +
                            '</pre>';
                    }
                    msg.innerHTML = html;
                } catch (e) {
                    console.error(e);
                    const m = e && e.message ? String(e.message) : '失败';
                    msg.innerHTML =
                        '<div class="text-neon-red">' + escHtml(m) + '</div>' +
                        '<div class="mt-2 text-[10px] text-text-muted leading-relaxed space-y-1">' +
                        '<p>当前请求：<code class="text-[10px]">' +
                        escHtml(API_BASE) +
                        '/api/zct-vwap/touch-pool-scan</code></p>' +
                        '<ul class="list-disc pl-4">' +
                        '<li>本机是否已启动 API（例如 <code>uvicorn main:app --host 0.0.0.0 --port 8000</code>）？</li>' +
                        '<li>HTTPS 页面不要直连 <code>http://127.0.0.1</code>（会被浏览器拦）；可试地址栏 <code>?api=https://你的后端域名</code> 或 <code>localStorage.NEXT_K_API_BASE</code>。</li>' +
                        '<li>walk-forward 可能跑<strong>数分钟</strong>，网关/托管若超时断开，也会显示 Failed to fetch；可改在本地跑 API 或换更长的代理超时。</li>' +
                        '</ul></div>';
                } finally {
                    busy(false);
                }
            }

            async function runVpRegimeScan(payload) {
                if (!msg) return;
                const b1 = document.getElementById('maint-vp-sample');
                const b2 = document.getElementById('maint-vp-watchlist');
                const b3 = document.getElementById('maint-zct-touch-pool');
                const busy = (on) => {
                    if (b1) b1.disabled = on;
                    if (b2) b2.disabled = on;
                    if (b3) b3.disabled = on;
                };
                busy(true);
                msg.textContent = 'VP 扫描请求中（同步等待，可能数十秒）…';
                try {
                    const data = await API.vpRegimeScan(payload);
                    const brief = {
                        ok: data.ok,
                        universe: data.universe,
                        symbols: data.symbols,
                        rows: (data.results || []).length,
                        by_scheme: data.by_scheme,
                        errors: data.errors,
                    };
                    let html = '<span class="text-neon-green">VP 完成 · ' + escHtml(JSON.stringify(brief, null, 2)) + '</span>';
                    const rows = (data.results || []).slice(0, 30);
                    if (rows.length) {
                        const table = rows.map((r) => `${r.symbol}\t${r.scheme}\t${r.vol_pattern}\tliq=${r.liquidity_ok ? 'Y' : 'N'}`).join('\n');
                        html += '<pre class="mt-2 text-text-muted text-[11px] whitespace-pre overflow-x-auto">' + escHtml(table) + '</pre>';
                    }
                    if ((data.results || []).length > 30) {
                        html += '<p class="text-text-muted text-[10px] mt-1">仅显示前 30 行；完整 JSON 见浏览器 Network 响应。</p>';
                    }
                    msg.innerHTML = html;
                } catch (e) {
                    console.error(e);
                    msg.innerHTML = '<span class="text-neon-red">' + escHtml(e && e.message ? String(e.message) : '失败') + '</span>';
                } finally {
                    busy(false);
                }
            }
            document.getElementById('maint-vp-sample')?.addEventListener('click', () => {
                void runVpRegimeScan({ symbols: 'BTCUSDT,ETHUSDT,SOLUSDT', persist: true, notify_tg: true });
            });
            document.getElementById('maint-vp-watchlist')?.addEventListener('click', () => {
                void runVpRegimeScan({ watchlist: true, persist: true, notify_tg: true });
            });
            document.getElementById('maint-zct-touch-pool')?.addEventListener('click', () => {
                void runZctTouchPoolScan({});
            });

            document.getElementById('maint-zct-vwap-clear-db')?.addEventListener('click', async () => {
                if (
                    !confirm(
                        '确定清空 ZCT 数据库？\n将删除 zct_vwap_signals 与 zct_vwap_settlements 全部行，不可撤销。',
                    )
                ) {
                    return;
                }
                const b = document.getElementById('maint-zct-vwap-clear-db');
                if (!msg) return;
                if (b) b.disabled = true;
                msg.textContent = 'ZCT 清库请求中…';
                try {
                    const out = await API.zctVwapClearDb();
                    const ns = out.deleted_zct_vwap_signals != null ? out.deleted_zct_vwap_signals : '?';
                    const nt = out.deleted_zct_vwap_settlements != null ? out.deleted_zct_vwap_settlements : '?';
                    msg.innerHTML = '<span class="text-neon-green">ZCT 已清库 · signals=' + escHtml(String(ns)) + ' · settlements=' + escHtml(String(nt)) + '</span>';
                    void hydrateZctVwapBoard();
                } catch (e) {
                    console.error(e);
                    msg.innerHTML = '<span class="text-neon-red">' + escHtml(e && e.message ? String(e.message) : '失败') + '</span>';
                } finally {
                    if (b) b.disabled = false;
                }
            });


            document.getElementById('maint-top-trader-clear')?.addEventListener('click', () => void clearTopTraderData());
            document.getElementById('maint-mom-clear-db')?.addEventListener('click', () => void clearMomLaneData());
            document.getElementById('maint-jz-clear-db')?.addEventListener('click', () => void clearJzLaneData());
            document.getElementById('maint-mq-clear-db')?.addEventListener('click', () => void clearMqLaneData());
            document.getElementById('maint-m2-clear-db')?.addEventListener('click', () => void clearM2LaneData());
            document.getElementById('maint-mq-daily-optimize')?.addEventListener('click', () => void runMqDailyOptimize());
            document.getElementById('maint-m2-paper-scan')?.addEventListener('click', () => {
                void runM2PaperScanMaint();
            });
            document.getElementById('maint-m2-bootstrap')?.addEventListener('click', () => {
                const force = confirm(
                    'Moss2 拉取 25 核心 CSV（90 天滚动）\n\n'
                    + '确定 = force 重拉全部（先清理再拉，较慢）\n'
                    + '取消 = 仅补缺 / 刷新超过 24h 的 stale'
                );
                void runM2MaintAction('maint-m2-bootstrap', 'Moss2 拉 CSV', () =>
                    API.m2MaintenancePost('bootstrap-data', { force: force ? 'true' : 'false' }, 25000));
            });
            document.getElementById('maint-m2-auto-provision')?.addEventListener('click', () => {
                const forceEvolve = confirm(
                    'Moss2 全自动建 Profile（25 核心）\n\n'
                    + '确定 = 对已存在 Profile 也强制全量 evolve\n'
                    + '取消 = 仅常规 suggest→创建/更新→进化→启用\n\n'
                    + '将后台执行（约 5–30 分钟），页面自动轮询汇总，勿用同步 HTTP（易超时）'
                );
                let baselineUtc = '';
                void (async () => {
                    try {
                        const prev = await API.m2LastAutoRun().catch(() => ({}));
                        baselineUtc = (prev && prev.saved_at_utc) || '';
                    } catch (e) { /* ignore */ }
                    void runM2MaintAction('maint-m2-auto-provision', 'Moss2 全自动建 Profile', () =>
                        API.m2MaintenancePost('auto-provision', { force_evolve: forceEvolve ? 'true' : 'false' }, 90000),
                    { pollProvision: true, baselineUtc });
                })();
            });
            document.getElementById('maint-m2-enable-approved')?.addEventListener('click', () => {
                void runM2MaintAction('maint-m2-enable-approved', 'Moss2 启用已批准', () =>
                    API.m2MaintenancePost('enable-approved', {}));
            });

            document.getElementById('maint-export-volume')?.addEventListener('click', async () => {
                const btn = document.getElementById('maint-export-volume');
                if (!msg) return;
                const tok = getMaintenanceToken();
                if (!tok) {
                    msg.innerHTML = '<span class="text-warn">请先在上方保存维护令牌</span>';
                    return;
                }
                if (btn) btn.disabled = true;
                msg.textContent = '正在查询 DATA_DIR 体量…';
                try {
                    const res = await fetch(`${API_BASE}/api/export-volume/info`, {
                        headers: maintenanceHeaders(),
                    });
                    const text = await res.text();
                    let data;
                    try {
                        data = JSON.parse(text);
                    } catch (parseErr) {
                        throw new Error(text || res.statusText || '无法解析响应');
                    }
                    if (!res.ok) {
                        throw new Error(apiErrorDetail(data, text, res));
                    }
                    if (!data.exists) {
                        throw new Error('DATA_DIR 不存在：' + (data.data_dir || '?'));
                    }
                    const dir = data.data_dir || 'DATA_DIR';
                    const files = data.file_count != null ? data.file_count : '?';
                    const sizeStr = formatBytes(data.total_bytes);
                    if (
                        !confirm(
                            '一键导出 DATA_DIR\n\n'
                                + '路径：' + dir + '\n'
                                + '文件数：' + files + '\n'
                                + '未压缩合计：约 ' + sizeStr + '\n\n'
                                + '服务端将打包为 zip（可能需数分钟）。浏览器会开始下载；若长时间无响应，请查看服务端日志或代理超时。\n\n'
                                + '下载完成后请关闭 NEXT_K_EXPORT_VOLUME_ENABLED 并重新部署。\n\n'
                                + '确定继续？',
                        )
                    ) {
                        msg.textContent = '已取消导出';
                        return;
                    }
                    const url = buildExportVolumeUrl('zip');
                    msg.innerHTML =
                        '<span class="text-neon-green">已发起下载</span>'
                        + '<br/><span class="text-text-muted text-[10px]">'
                        + escHtml(dir) + ' · ' + escHtml(String(files)) + ' 文件 · ' + escHtml(sizeStr)
                        + '<br/>若未出现保存对话框，可<a class="text-accent underline" href="'
                        + escHtml(url) + '" target="_blank" rel="noopener">点此直接打开下载链接</a></span>';
                    const a = document.createElement('a');
                    a.href = url;
                    a.target = '_blank';
                    a.rel = 'noopener';
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                } catch (e) {
                    console.error(e);
                    msg.innerHTML = '<span class="text-neon-red">' + escHtml(e && e.message ? String(e.message) : '导出失败') + '</span>';
                } finally {
                    if (btn) btn.disabled = false;
                }
            });

        }

        function enforceDashboardLayout() {
            const main = document.querySelector('main');
            if (!main) return;
            const pick = (id, aria) =>
                document.getElementById(id) || main.querySelector('section[aria-label="' + aria + '"]');
            [
                main.querySelector('section[aria-label="优先信号"]'),
                pick('zct-lane-section', 'ZCT 量化'),
                pick('oi-lane-section', '收筹池 OI 监控'),
                pick('orb-lane-section', 'ORB开盘区间纸面'),
                pick('mq-daily-board-section', 'Moss每日最优看板'),
                pick('mq-lane-section', 'Moss量化实仓'),
                pick('m2-lane-section', 'Moss2 Factory纸面'),
                pick('worth-history-section', '值得关注与重点关注归档'),
                main.querySelector('section[data-s6-panel="1"]'),
            ].forEach((el) => {
                if (el && el.parentNode === main) main.appendChild(el);
            });
        }

        async function checkConnection() {
            const conn = document.getElementById('connection-status');
            if (!conn) return;
            try {
                await API.health();
                conn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neon-green/[0.09] text-neon-green border border-neon-green/15';
                conn.innerHTML = '<span>API 已连接</span>';
            } catch (e) {
                conn.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-neon-red/[0.09] text-neon-red border border-neon-red/15';
                const detail = (e && e.name === 'AbortError') ? '（超时）' : '';
                conn.innerHTML = '<span>API 连接失败' + escHtml(detail) + '</span>';
            }
        }

        async function init() {
            // enforceDashboardLayout 已由顶部 IIFE 在 DOM 加载时跑过；此处不重复
            void checkConnection();
            // 每 60s 复查一次连接，断网后状态能自动更新；后台 tab 时跳过
            setInterval(() => {
                if (document.visibilityState === 'visible') checkConnection();
            }, 60000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkConnection();
            });
            setupMaintPanel();
            initWorthHistoryTabDelegationOnce();
            void hydrateWorthHighlightBoards({});
            loadAccumulationOiRadar();
            loadS2FundingSignals();
            /* ZCT / 接针 / 动量主看板已隐藏；维护面板仍可清库/触轨 */
            /* Moss v1 已停用 (active_lane=moss2) */
            initOrbPanelOnce();
            void hydrateOrbBoard();
            initM2PanelOnce();
            void hydrateM2Board();
            document.getElementById('m2-refresh')?.addEventListener('click', () => void hydrateM2Board());
            document.getElementById('zct-vwap-root')?.addEventListener('click', (ev) => {
                const btn = ev.target && ev.target.closest && ev.target.closest('[data-zct-manual]');
                if (!btn) return;
                ev.preventDefault();
                const sid = btn.getAttribute('data-zct-manual');
                if (sid) void zctVwapEditManual(sid);
            });
            // loadS6AutonomousAlpha(); // 与上方 S6 区块 hidden 同步恢复
        }

        document.addEventListener('DOMContentLoaded', init);

function toggleTheme() {
    var isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    var btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isDark ? '☀' : '☽';
}
(function initTheme() {
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
        var btn = document.getElementById('theme-btn');
        if (btn) btn.textContent = '☀';
    }
})();

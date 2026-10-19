import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { WorkspaceService } from '../workspaces/service.js';
import type { DocumentService } from '../documents/service.js';
import { DocumentMemoryStore } from '../documents/memory-store.js';
import { LocalSettings } from '../runtime/local-settings.js';
import type { WorkspaceId } from '../../../contracts/src/ids.js';
import type { WorkspaceMemoryEngine, WorkspaceMemoryHit, WorkspaceMemoryItem, WorkspaceMemoryOptions, WorkspaceMemorySnapshot, WorkspaceMemoryStatus } from '../../../contracts/src/workspace-memory.js';
import { discoverWorkspace, allowedWorkspaceSource } from './discovery.js';
const hash = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
export class WorkspaceMemoryService {
    private settings: LocalSettings<{
        enabled: boolean;
    }>;
    private states = new Map<WorkspaceId, WorkspaceMemoryStatus>();
    private jobs = new Map<WorkspaceId, {
        controller: AbortController;
        promise: Promise<void>;
    }>();
    private scheduled = new Map<WorkspaceId, number>();
    private closed = false;
    constructor(private workspaces: WorkspaceService, private documents: DocumentService, private engine: WorkspaceMemoryEngine) { this.settings = new LocalSettings(workspaces.configDir, 'workspace-memory-preferences', () => ({ enabled: true })); }
    private async saved(id: WorkspaceId) { return (await this.workspaces.storeFor(id)).getRecord<WorkspaceMemorySnapshot>('workspace-memory', 'snapshot'); }
    async status(id: WorkspaceId): Promise<WorkspaceMemoryStatus> {
        const enabled = (await this.settings.get()).enabled, available = await this.engine.available();
        const previous = this.states.get(id) ?? (await this.saved(id))?.status;
        return { discoveredFiles: 0, indexedFiles: 0, uniquePassages: 0, sourcePassages: 0, skipped: [], ...previous, enabled, available, state: !enabled ? 'disabled' : !available ? 'unavailable' : previous?.state ?? 'idle' };
    }
    async configure(value: {
        enabled: boolean;
    }) { await this.settings.update(() => ({ enabled: value.enabled })); if (!value.enabled) {
        for (const job of this.jobs.values())
            job.controller.abort();
        await Promise.allSettled([...this.jobs.values()].map(job => job.promise));
    } return value; }
    schedule(id: WorkspaceId, force = false) { if (this.closed || !force && Date.now() - (this.scheduled.get(id) ?? 0) < 30000)
        return; this.scheduled.set(id, Date.now()); void this.sync(id, new AbortController().signal).catch(() => { }); }
    async sync(id: WorkspaceId, signal: AbortSignal): Promise<void> {
        signal.throwIfAborted();
        if (this.closed)
            return;
        const existing = this.jobs.get(id);
        if (existing)
            return existing.promise;
        const controller = new AbortController(), combined = AbortSignal.any([signal, controller.signal]);
        const promise = Promise.resolve().then(async () => { const current = await this.status(id); combined.throwIfAborted(); if (current.enabled && current.available)
            await this.build(id, combined, current); }).finally(() => { if (this.jobs.get(id)?.controller === controller)
            this.jobs.delete(id); });
        this.jobs.set(id, { controller, promise });
        return promise;
    }
    private async build(id: WorkspaceId, signal: AbortSignal, current: WorkspaceMemoryStatus) {
        const status: WorkspaceMemoryStatus = { ...current, state: 'indexing', error: undefined, skipped: [], discoveredFiles: 0, indexedFiles: 0, uniquePassages: 0, sourcePassages: 0 };
        this.states.set(id, status);
        try {
            const discovery = await discoverWorkspace(this.workspaces, id, signal);
            status.discoveredFiles = discovery.files.length;
            status.skipped = discovery.skipped;
            const unique = new Map<string, WorkspaceMemoryItem>(), plans = new DocumentMemoryStore(this.workspaces);
            for (const relativePath of discovery.files) {
                signal.throwIfAborted();
                try {
                    const document = await this.documents.open(id, relativePath, signal);
                    await this.documents.waitReady(document, signal);
                    const parsed = await this.documents.parsed(document), plan = await plans.readingPlan(await this.documents.get(document));
                    let count = 0;
                    for (const block of parsed.blocks) {
                        const page = block.anchor.location.kind === 'page' ? block.anchor.location.page : parsed.pages.find(page => page.anchors.some(anchor => anchor.location.kind === 'block' && anchor.location.blockId === block.id))?.page;
                        if (!page || !plan.pages.includes(page))
                            continue;
                        for (let start = 0; start < block.text.length; start += 6000) {
                            const original = block.text.slice(start, start + 6000), text = original.normalize('NFC').replace(/\s+/g, ' ').trim();
                            if (!text)
                                continue;
                            const itemId = hash(text), item = unique.get(itemId) ?? { id: itemId, text, sources: [] };
                            const anchor = structuredClone(block.anchor);
                            if (anchor.location.kind === 'block') {
                                anchor.location.start = start;
                                anchor.location.end = start + original.length;
                            }
                            item.sources.push({ relativePath, page, anchor });
                            unique.set(itemId, item);
                            count++;
                            status.sourcePassages++;
                        }
                    }
                    if (count)
                        status.indexedFiles++;
                    else
                        status.skipped.push({ relativePath, reason: '没有可索引的原文文字；图像内容尚未建立阅读证据' });
                }
                catch (error) {
                    signal.throwIfAborted();
                    status.skipped.push({ relativePath, reason: '文档暂未解析成功，可重试' });
                }
                status.uniquePassages = unique.size;
            }
            const items = [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)), fingerprint = hash(JSON.stringify(items));
            // Reconcile even unchanged sources: the rebuildable engine cache can be
            // missing or ahead of the last app commit after an interrupted publication.
            // The engine itself reuses an already published identical dataset.
            await this.engine.replace(id, structuredClone(items), signal);
            signal.throwIfAborted();
            status.state = 'ready';
            status.updatedAt = new Date().toISOString();
            (await this.workspaces.storeFor(id)).putRecord('workspace-memory', 'snapshot', { fingerprint, items, status } satisfies WorkspaceMemorySnapshot);
        }
        catch (error) {
            status.state = 'failed';
            status.error = signal.aborted ? '记忆关联已中断，已完成快照保留，可重试' : '记忆关联暂未完成，请重试或检查本地记忆组件';
            throw error;
        }
    }
    async search(id: WorkspaceId, query: string, signal: AbortSignal, options: WorkspaceMemoryOptions = {}): Promise<WorkspaceMemoryHit[]> {
        signal.throwIfAborted();
        if (!query.trim() || query.length > 1000)
            return [];
        const state = await this.status(id);
        if (!state.enabled || !state.available)
            return [];
        const saved = await this.saved(id);
        if (!saved || state.state === 'indexing')
            return [];
        let ids: string[];
        try {
            ids = await this.engine.search(id, query, signal);
        }
        catch (error) {
            signal.throwIfAborted();
            this.states.set(id, { ...state, state: 'failed', error: '记忆检索暂不可用，当前问题仍使用已选资料' });
            return [];
        }
        const excluded = new Set(options.exclude?.map(ref => ref.documentId) ?? []), versions = new Map<string, string | null>(), result: WorkspaceMemoryHit[] = [], ranges = new Map<string, Set<number>>(), plans = new DocumentMemoryStore(this.workspaces);
        let used = 0;
        for (const itemId of [...new Set(ids)].slice(0, 100)) {
            const item = saved.items.find(item => item.id === itemId);
            if (!item || Buffer.byteLength(item.text) > 24000)
                continue;
            const sources = [];
            for (const source of item.sources) {
                signal.throwIfAborted();
                if (source.anchor.workspaceId !== id || excluded.has(source.anchor.documentId))
                    continue;
                if (!versions.has(source.relativePath)) {
                    try {
                        if (!await allowedWorkspaceSource(this.workspaces, id, source.relativePath, signal))
                            versions.set(source.relativePath, null);
                        else {
                            const path = await this.workspaces.resolvePath(id, source.relativePath, 'read');
                            versions.set(source.relativePath, hash(await readFile(path, { signal })));
                        }
                    }
                    catch {
                        signal.throwIfAborted();
                        versions.set(source.relativePath, null);
                    }
                }
                if (versions.get(source.relativePath) === source.anchor.version) {
                    const key = source.anchor.documentId + ':' + source.anchor.version;
                    if (!ranges.has(key)) {
                        try {
                            ranges.set(key, new Set((await plans.readingPlan(await this.documents.get(source.anchor))).pages));
                        }
                        catch {
                            ranges.set(key, new Set());
                        }
                    }
                    if (ranges.get(key)!.has(source.page))
                        sources.push(source);
                }
            }
            const bytes = Buffer.byteLength(JSON.stringify({ ...item, sources }));
            if (!sources.length || used + bytes > (options.budgetBytes ?? 24000))
                continue;
            result.push({ ...item, sources });
            used += bytes;
            if (result.length === 8)
                break;
        }
        return result;
    }
    async close() { this.closed = true; for (const job of this.jobs.values())
        job.controller.abort(); await Promise.allSettled([...this.jobs.values()].map(job => job.promise)); await this.engine.close(); }
}

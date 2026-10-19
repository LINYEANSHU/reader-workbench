import { access, readFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkspaceService } from '../workspaces/service.js';
import { safeCacheDirectory } from '../documents/versions.js';
import type { WorkspaceId } from '../../../contracts/src/ids.js';
import type { WorkspaceMemoryEngine, WorkspaceMemoryItem } from '../../../contracts/src/workspace-memory.js';
import { ReaderError } from '../../../contracts/src/errors.js';
import { JsonWorker } from './process.js';
interface CogneeSettings {
    pythonPath: string;
    modelCache: string;
}
export class CogneeEngine implements WorkspaceMemoryEngine {
    private workers = new Map<WorkspaceId, JsonWorker>();
    private closed = false;
    private queue: Promise<unknown> = Promise.resolve();
    constructor(private workspaces: WorkspaceService) { }
    private async settings(): Promise<CogneeSettings | null> {
        try {
            const value = JSON.parse(await readFile(join(this.workspaces.configDir, 'agent', 'workspace-memory.json'), 'utf8')) as CogneeSettings;
            if (typeof value.pythonPath !== 'string' || !isAbsolute(value.pythonPath) || typeof value.modelCache !== 'string' || !isAbsolute(value.modelCache))
                return null;
            await access(value.pythonPath);
            await access(join(value.modelCache, 'ready.json'));
            return value;
        }
        catch {
            return null;
        }
    }
    async available() { const settings = await this.settings(); return !this.closed && !!settings; }
    private async worker(id: WorkspaceId, signal: AbortSignal) {
        if (this.closed)
            throw new ReaderError('SERVER_CLOSING', '记忆组件正在退出');
        const old = this.workers.get(id);
        if (old)
            return old;
        for (const value of this.workers.values())
            await value.close();
        this.workers.clear();
        const settings = await this.settings();
        if (!settings)
            throw new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE', '尚未准备本地记忆组件');
        const root = await safeCacheDirectory(this.workspaces, id, ['knowledge', 'cognee']);
        signal.throwIfAborted();
        if (this.closed)
            throw new ReaderError('SERVER_CLOSING', '记忆组件正在退出');
        const worker = fileURLToPath(new URL(import.meta.url.includes('/packages/core/src/') ? '../../../../plugins/workspace-memory/worker.py' : '../plugins/workspace-memory/worker.py', import.meta.url));
        const env: NodeJS.ProcessEnv = {};
        for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA'])
            if (process.env[key])
                env[key] = process.env[key];
        env.READER_COGNEE_MODEL_CACHE = settings.modelCache;
        const value = new JsonWorker(settings.pythonPath, ['-I', '-u', worker, root], env, root);
        this.workers.set(id, value);
        return value;
    }
    private execute<T>(operation: () => Promise<T>, signal: AbortSignal) {
        const task = this.queue.catch(() => { }).then(() => {
            signal.throwIfAborted();
            if (this.closed)
                throw new ReaderError('SERVER_CLOSING', '记忆组件正在退出');
            return operation();
        });
        this.queue = task;
        return task;
    }
    async replace(id: WorkspaceId, items: WorkspaceMemoryItem[], signal: AbortSignal) { await this.execute(async () => { await (await this.worker(id, signal)).call('replace', { items: items.map(({ id, text }) => ({ id, text })) }, signal); }, signal); }
    async search(id: WorkspaceId, query: string, signal: AbortSignal) {
        const value = await this.execute(async () => (await this.worker(id, signal)).call('search', { query }, signal, 60000), signal);
        if (!Array.isArray(value) || value.length > 100 || value.some(id => typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)))
            throw new ReaderError('WORKSPACE_MEMORY_PROTOCOL', '记忆检索来源无效');
        return value as string[];
    }
    async close() {
        this.closed = true;
        await Promise.allSettled([...this.workers.values()].map(worker => worker.close()));
        await this.queue.catch(() => { });
        await Promise.allSettled([...this.workers.values()].map(worker => worker.close()));
        this.workers.clear();
    }
}

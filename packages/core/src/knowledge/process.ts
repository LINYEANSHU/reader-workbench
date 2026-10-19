import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { ReaderError } from '../../../contracts/src/errors.js';
import { stopProcessTree } from '../runtime/process.js';
export class JsonWorker {
    private child?: ChildProcessWithoutNullStreams;
    private queue: Promise<unknown> = Promise.resolve();
    private pending?: {
        id: number;
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    };
    private sequence = 0;
    private closed = false;
    private output = '';
    private exits = new Set<Promise<void>>();
    private stops = new Set<Promise<void>>();
    constructor(private command: string, private args: string[], private env: NodeJS.ProcessEnv, private cwd: string) { }
    private start() {
        if (this.child)
            return this.child;
        const child = spawn(this.command, this.args, { cwd: this.cwd, env: this.env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
        this.child = child;
        this.output = '';
        const exited = new Promise<void>(resolve => child.once('close', () => resolve()));
        this.exits.add(exited);
        void exited.then(() => this.exits.delete(exited));
        child.stderr.on('data', () => { }); // Diagnostics can include source text; never persist them in app logs.
        child.stdin.on('error', () => { if (this.child === child)
            this.fail(new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE', '无法连接本地记忆组件')); });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (text: string) => {
            if (this.child !== child)
                return;
            this.output += text;
            if (this.output.length > 4 * 1024 * 1024) {
                this.fail(new ReaderError('WORKSPACE_MEMORY_PROTOCOL', '记忆组件返回了过大的响应'));
                return;
            }
            let end: number;
            while ((end = this.output.indexOf('\n')) >= 0) {
                const line = this.output.slice(0, end);
                this.output = this.output.slice(end + 1);
                if (!line.startsWith('RW_COGNEE:'))
                    continue;
                try {
                    const value = JSON.parse(line.slice(10));
                    if (value.id !== this.pending?.id || typeof value.id !== 'number')
                        throw Error('request identity');
                    const pending = this.pending!;
                    this.pending = undefined;
                    if (value.error)
                        pending.reject(new ReaderError('WORKSPACE_MEMORY_ENGINE', '本地记忆组件未完成操作，请重试'));
                    else
                        pending.resolve(value.result);
                }
                catch {
                    this.fail(new ReaderError('WORKSPACE_MEMORY_PROTOCOL', '记忆组件返回了无效响应'));
                }
            }
        });
        child.on('error', () => { if (this.child === child)
            this.fail(new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE', '本地记忆组件无法启动')); });
        child.on('exit', () => { if (this.child === child) {
            this.child = undefined;
            const pending = this.pending;
            this.pending = undefined;
            pending?.reject(new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE', '本地记忆组件已退出，可重试'));
        } });
        return child;
    }
    private fail(error: Error) {
        const pending = this.pending;
        this.pending = undefined;
        const child = this.child;
        this.child = undefined;
        if (child) {
            const stopped = stopProcessTree(child).catch(() => { child.kill(); });
            this.stops.add(stopped);
            void stopped.then(() => this.stops.delete(stopped));
        }
        pending?.reject(error);
    }
    call(method: string, payload: unknown, signal: AbortSignal, timeoutMs = 600000): Promise<unknown> {
        const task = this.queue.catch(() => { }).then(async () => {
            await Promise.all([...this.stops]);
            signal.throwIfAborted();
            if (this.closed)
                throw new ReaderError('SERVER_CLOSING', '记忆组件正在退出');
            const child = this.start(), id = ++this.sequence;
            return new Promise<unknown>((resolve, reject) => {
                const abort = () => this.fail(new Error('记忆操作已取消')), timer = setTimeout(() => this.fail(new ReaderError('WORKSPACE_MEMORY_TIMEOUT', '记忆操作超时，可重试')), timeoutMs);
                const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
                this.pending = { id, resolve: value => { finish(); resolve(value); }, reject: error => { finish(); reject(error); } };
                signal.addEventListener('abort', abort, { once: true });
                if (signal.aborted) {
                    abort();
                    return;
                }
                child.stdin.write(JSON.stringify({ id, method, payload }) + '\n', error => { if (error && this.pending?.id === id)
                    this.fail(new ReaderError('WORKSPACE_MEMORY_UNAVAILABLE', '无法连接本地记忆组件')); });
            });
        });
        this.queue = task;
        return task;
    }
    async close() { this.closed = true; this.fail(new Error('记忆组件正在退出')); await this.queue.catch(() => { }); await Promise.all([...this.stops, ...this.exits]); }
}

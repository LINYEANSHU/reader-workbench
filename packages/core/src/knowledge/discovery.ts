import { readFile, readdir, lstat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import ignore, { type Ignore } from 'ignore';
import type { WorkspaceService } from '../workspaces/service.js';
import type { WorkspaceId } from '../../../contracts/src/ids.js';
const extensions = new Set(['.md', '.markdown', '.txt', '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.png', '.jpg', '.jpeg', '.webp']);
const internal = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'outputs', '__pycache__']);
const sensitive = /(?:^|[._ -])(?:secret|secrets|credential|credentials|password|passwords|token|tokens|private[-_ ]?key|api[-_ ]?key)(?:[._ -]|$)/i;
type Rule = {
    prefix: string;
    filter: Ignore;
};
async function readRules(path: string) { const filter = ignore(); for (const name of ['.gitignore', '.readerignore']) {
    try {
        const file = join(path, name);
        if (!(await lstat(file)).isSymbolicLink())
            filter.add(await readFile(file, 'utf8'));
    }
    catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
            throw error;
    }
} return filter; }
function ignored(name: string, directory: boolean, rules: Rule[]) { let excluded = false; for (const rule of rules) {
    const value = rule.filter.test((rule.prefix ? name.slice(rule.prefix.length + 1) : name) + (directory ? '/' : ''));
    if (value.ignored)
        excluded = true;
    else if (value.unignored)
        excluded = false;
} return excluded; }
export async function allowedWorkspaceSource(workspaces: WorkspaceService, id: WorkspaceId, name: string, signal: AbortSignal) {
    const parts = name.split('/');
    if (parts.some(part => !part || part.startsWith('.') || internal.has(part)) || !extensions.has(extname(name).toLowerCase()) || sensitive.test(parts.at(-1)!))
        return false;
    const workspace = await workspaces.get(id), rules: Rule[] = [];
    for (let index = 0; index < parts.length; index++) {
        signal.throwIfAborted();
        const prefix = parts.slice(0, index).join('/');
        rules.push({ prefix, filter: await readRules(join(workspace.root, ...parts.slice(0, index))) });
        const relative = parts.slice(0, index + 1).join('/'), info = await lstat(join(workspace.root, ...parts.slice(0, index + 1)));
        if (info.isSymbolicLink() || ignored(relative, info.isDirectory(), rules))
            return false;
        if (index === parts.length - 1 && (!info.isFile() || info.size > 64 * 1024 * 1024))
            return false;
    }
    await workspaces.resolvePath(id, name, 'read');
    return true;
}
export async function discoverWorkspace(workspaces: WorkspaceService, id: WorkspaceId, signal: AbortSignal) {
    const files: string[] = [], skipped: Array<{
        relativePath: string;
        reason: string;
    }> = [], rules: Rule[] = [];
    let visited = 0;
    const visit = async (relative: string) => {
        signal.throwIfAborted();
        const path = await workspaces.resolvePath(id, relative, 'read');
        const local = await readRules(path);
        rules.push({ prefix: relative, filter: local });
        try {
            for (const entry of (await readdir(path, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
                signal.throwIfAborted();
                if (++visited > 20000) {
                    skipped.push({ relativePath: relative || '.', reason: '目录条目超过本次发现上限 20000；尚未完成全部发现' });
                    return;
                }
                if (entry.name.startsWith('.') || internal.has(entry.name))
                    continue;
                const name = relative ? relative + '/' + entry.name : entry.name;
                if (ignored(name, entry.isDirectory(), rules))
                    continue;
                const info = await lstat(join(path, entry.name));
                if (info.isSymbolicLink())
                    continue;
                if (info.isDirectory()) {
                    await visit(name);
                    continue;
                }
                if (!info.isFile() || !extensions.has(extname(name).toLowerCase()) || sensitive.test(entry.name))
                    continue;
                if (files.length >= 5000 || info.size > 64 * 1024 * 1024) {
                    skipped.push({ relativePath: name, reason: files.length >= 5000 ? '超过本次 5000 份资料上限' : '文件超过自动索引的 64 MiB 上限' });
                    continue;
                }
                await workspaces.resolvePath(id, name, 'read');
                files.push(name);
            }
        }
        finally {
            rules.pop();
        }
    };
    await visit('');
    return { files, skipped };
}

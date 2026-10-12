# Git 与版本迭代

仓库根目录为 `G:\My_project\try`，正式分支为 `main`，首个发布标签为 `v0.1.0`。此前的全部开发提交已保留；使用 `git log --oneline --decorate --graph --all` 查看历史。

原开发 worktree `.worktrees/reader-workbench` 保留，因为现有应用、Office 资源及语音模型正在使用那里。它不再是唯一源码位置；当前根目录包含完整应用源码。不要运行 `git clean -fdx`，这会删除忽略的运行资源与私有配置。

## 一次迭代

在仓库根目录执行，开始前检查现有改动并保留它们：

```powershell
git status
git switch main
git switch -c codex/your-feature
```

实现一个明确变化，按变化运行相关检查，将实际行为、验证和未测范围加入 `CHANGELOG.md` 的“未发布”。在源码安装和构建完成后，全套检查为：

```powershell
npm run typecheck
npm run build
npm test
npm run test:e2e
```

Office 及真实离线语音测试需本地资源，配置方式见 `installation.md` 和 `verification.md`。没有提供资源时的跳过不能写成通过。真实 LLM/API 测试需另外得到用户批准，常规 Git 迭代不调用它。

提交具体修改文件，保持每个提交能单独解释和回退：

```powershell
git add path/to/changed-file
git commit -m "feat: describe the change"
git switch main
git merge --ff-only codex/your-feature
```

如果不能快进合并，先查看双方改动并解决分歧，不强推、不重置或覆盖用户改动。合并后检查最终结果，再决定是否删除已经合并的分支。

## 发布版本

修复递增修订版本，例如 `0.1.1`；增加功能递增次版本，例如 `0.2.0`；不兼容变化递增主版本。未满 `1.0.0` 的接口仍处于演进期，应明确记录不兼容变动。

例如发布修复版本时：

```powershell
npm version patch --no-git-tag-version
```

该命令更新根 `package.json` 与 `package-lock.json`。发布前核对需要同步的运行时版本字段；插件及 SDK 的独立协议版本仅在协议实际变化时修改。将“未发布”条目移到新版本及日期下，完成对应版本的检查，再提交和创建注释标签：

```powershell
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: release 0.1.1"
git tag -a v0.1.1 -m "Reader Workbench 0.1.1"
npm pack --pack-destination release
```

如果同时更新了其他版本文件，也应一并提交。标签固定指向当次发布提交，已经发布的标签不要覆盖。发行包和模型缓存不进入 Git；原始验证证据在 `docs/evidence/` 中保存。

## 回退与查看

```powershell
git log --oneline --decorate --graph --all
git show v0.1.0
git diff v0.1.0..main
git revert COMMIT_ID
```

`git revert` 创建反向提交，保留完整历史；执行前检查工作树并处理冲突。查看旧版本可以创建单独 worktree，保留当前修改，不直接覆盖正在运行的应用。

目前仓库仅在本地，没有配置远程地址。用户提供并授权远程仓库后，再设置 remote、推送提交和标签；现有跨平台 CI 定义届时可运行，定义存在不等于已验证其他平台。

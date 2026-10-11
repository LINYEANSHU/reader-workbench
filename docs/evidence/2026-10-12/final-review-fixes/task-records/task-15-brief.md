## Task 15: 跨平台发行、真实阅读验收与交付证据

**Files:** Create `scripts/{acceptance,live-model,fixture-manifest}.mjs`；`tests/e2e/full-flow.spec.ts`；`tests/integration/cli-distribution.test.ts`；`.github/workflows/ci.yml`；`README.md`；`docs/{installation,verification}.md`；`docs/evidence/README.md`。Modify 根 package scripts/files/bin 和 CLI resource 定位；实际证据写入 `docs/evidence/<date>/`，不包含凭据或用户原文。

**Interfaces:** Produces 可发行 npm 包与 `reader-workbench web|doctor|mcp`；`npm run test:live -- --workspace <test-directory> --provider <provider-id>` 通过已配置 credentialRef 调用真实模型；`npm run acceptance -- --workspace <test-directory>` 输出 R01–R23 的 evidence manifest（status 为 passed/failed/not-tested），每项含命令/平台/文件哈希/证据路径。

- [ ] **Step 1: 写发行与完整流程测试。** `npm pack` 安装至空临时目录后单条启动、doctor、static/worker/assets 可用、stdio 可连接；CLI 启动目录有中文/空格。浏览器从先选工作区到四类文件阅读、主/临时追问、缩放/自由布局、右键/截图、生成/重开文件、插件调用、重启恢复全部贯通。坏文档、只读工作区、端口占用、转换缺依赖/取消、模型失败和断连恢复都不能显示虚假成功。

  `starts the installed package with no source workspace links` 的关键断言；在空安装目录运行 CLI 子进程并请求打包后的 worker：

  ```ts
  expect(cliHealthResponse.status).toBe(200);
  expect(packagedPdfWorkerResponse.status).toBe(200);
  expect(restartedTemporaryHistory).toEqual(savedTemporaryHistory);
  expect(evidenceForUnrunPlatform.status).toBe('not-tested');
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/cli-distribution.test.ts`、`npm run test:e2e -- tests/e2e/full-flow.spec.ts`。** 预期指出缺发行资源或尚未贯通步骤；禁止用跳过断言换成通过。
- [ ] **Step 3: 完成发行与文档。** 打包全部编译包、Web assets/PDF worker 和示例插件，生成 Windows/macOS/Linux 相同 CLI 用法与 LibreOffice 安装/发现说明。CI matrix 为 windows-latest/macos-latest/ubuntu-latest、Node 24，安装转换依赖并跑对应检查；能运行才填平台通过。live 脚本用人工测试工作区和短样例做主/临时真实流式调用、选区来源及视觉模型可用时的截图，检查动态继承/隔离；仅输出脱敏 IDs/状态，失败不写 completed。README 区分初次安装与日常一条启动、布局/缩放/快捷键、外部调用/插件/Python、Web 截图范围和全局热键限制。
- [ ] **Step 4: Run `npm ci`、typecheck、unit/integration、build、完整 e2e、acceptance 和实际发行启动。** 使用新鲜测试结果；Windows 真实转换与渲染逐页检查，确认图片/表格/公式及生成文件均可读。有用户配置的 API 时跑 live；没有 Key 就将 R06 标 not-tested 并请用户配置，不能把 demo 作为通过。macOS/Linux 没有实际机器/CI 结果时标 not-tested；CI YAML 不是运行证据。屏幕捕获授权人工证据单列。完整验收结束后使用 requesting-code-review 获得独立全分支审查，再修复具体问题和相关回归；未经明确授权不指定付费模型、不创建 PR/远程部署。
- [ ] **Step 5: Commit 信息 `chore: package reader workbench and record acceptance evidence`。** 用 finishing-a-development-branch 决定本地集成方式；不丢隔离工作区内源码/证据。交付启动命令、应用入口、工作区文件位置及尚未实测项目；仅当目标实际全部达到才标 goal complete。

## 需求到实现及证据的映射

### 用户追加要求与执行顺序

2026-10-11 用户在实施中要求思考深度和直接内置的离线语音，按规格第 19 节执行。思考深度并入任务 7 的模型/AskRequest、任务 9 的两个输入栏和任务 15 的真实 API 验收。新增任务 16 在任务 14 之后、任务 15 之前执行，接入任务 9 的两个输入栏；任务 15 汇总 R01–R25 证据。原有任务不删减，全分支审查仍在所有任务和验收完成后执行。


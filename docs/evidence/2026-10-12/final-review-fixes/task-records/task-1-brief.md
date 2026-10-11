## Task 1: 可启动的认证服务与 CLI 基座

**Files:** Create 根级 `package.json`、`package-lock.json`、`tsconfig.json`、`vitest.config.ts`、`.gitignore`；上述六个 workspace 的 package/tsconfig；`scripts/build.mjs`；`packages/contracts/src/{ids,errors,runtime,index}.ts`；`packages/core/src/runtime/{config,credentials,doctor}.ts`；`apps/server/src/{app,auth,index}.ts`；`apps/cli/src/{index,web,doctor}.ts`；`bin/reader-workbench.mjs`；`tests/integration/runtime.test.ts`。仅此任务增加构建配置，不另开纯脚手架任务。

**Interfaces:** Produces `RuntimeConfig { host:string; port:number; configDir:string; noOpen:boolean; workspace?:string; demo:boolean }`；`loadRuntimeConfig(args:string[]):Promise<RuntimeConfig>`；`startServer(config:RuntimeConfig):Promise<{url:string;close():Promise<void>}>`；`doctor(config:RuntimeConfig):Promise<DoctorReport>`，报告包含 Node、LibreOffice 检出路径/版本和错误码。凭据库 `setSecret(ref:string,value:string):Promise<void>` / `getSecret(ref:string):Promise<string>` / `hasSecret(ref:string):Promise<boolean>`，永不出现在普通 API DTO。

- [ ] **Step 1: 创建 `runtime.test.ts` 并落实测试运行配置。** 断言默认 host 为 `127.0.0.1`，CLI `--no-open` 真正可启动；无令牌配置 API 返回 401；只允许正确 Origin/Host；启动的一次性浏览器引导码兑换 HttpOnly/SameSite cookie 后立即失效，随后跳转干净 URL；占用端口返回可理解错误。日志和配置查询不能含测试 Key。全局连接/凭据文件与工作区文件分离，文件权限收紧。

  核心断言写入名为 `starts locally without opening and protects configuration` 的测试：

  ```ts
  await expect(loadRuntimeConfig(['web', '--no-open'])).resolves.toMatchObject({
    host: '127.0.0.1', port: 4317, noOpen: true,
  });
  expect(unauthenticatedConfiguration.statusCode).toBe(401);
  expect(JSON.stringify(maskedConfiguration)).not.toContain(testKey);
  ```

- [ ] **Step 2: Run `npm test -- tests/integration/runtime.test.ts`。** 预期因尚无启动/认证实现失败，而不是因为测试运行器或依赖无法启动。
- [ ] **Step 3: 实现以上入口及 `GET /config`。** CLI 使用默认端口 4317，完整支持 `web --host --port --config-dir --workspace --no-open --demo` 和 `doctor`；默认配置目录由平台用户配置目录决定。浏览器打开使用跨平台库，后台进程隐藏；health 只提供非敏感存活状态。外部访问使用单独的 bearer token，cookie 请求检查来源；日志启用凭据字段脱敏。初始根页面只明确提示后续工作区入口，不宣称已能阅读。
- [ ] **Step 4: Run `npm test -- tests/integration/runtime.test.ts`、`npm run typecheck`、`npm run build`。** 预期全部通过；实际启动/停止 CLI 子进程，确认监听和关闭，缺 LibreOffice 时 doctor 返回不可用能力而不阻止服务启动。
- [ ] **Step 5: Commit 本任务 Files，信息 `feat: bootstrap authenticated reader runtime`。** 不提交配置中的 token/Key、运行数据库或 node_modules。


import {describe,expect,it} from 'vitest';
import {translateDiagnostic} from '../../apps/web/src/i18n/messages.js';

describe('application diagnostic localization',()=>{
 it.each([
  ['操作失败，请查看本机诊断信息。','The operation failed. Check the local diagnostics.'],
  ['工作区不可写，请选择可写目录','This workspace is not writable. Choose a writable folder.'],
  ['文件不存在或不可访问','The file does not exist or cannot be accessed.'],
  ['PDF 已加密，请先提供解密副本','This PDF is encrypted. Provide a decrypted copy.'],
  ['未找到 LibreOffice，请安装或设置 READER_LIBREOFFICE','LibreOffice was not found. Install it or set READER_LIBREOFFICE.'],
  ['模型 API 凭据无效或无权限','The model API credentials are invalid or lack permission.'],
  ['所选模型不支持此思考档位','The selected model does not support this reasoning level.'],
  ['本次输入超过 1,000,000 token，请减少文档或上下文','This input exceeds 1,000,000 tokens. Reduce the documents or context.'],
  ['模型流连接中断，部分输出未加入记忆','The model stream was interrupted. Partial output was not added to memory.'],
  ['请先保存服务地址与 API Key','Save the service address and API key first.'],
  ['本次运行未允许生成文件','File generation is not allowed for this run.'],
  ['请先取消或等待当前临时运行','Cancel the current temporary run or wait for it to finish.'],
  ['请先安装插件','Install the plugin first.'],
  ['没有已授权且适用于本机的截图辅助插件','No authorized screenshot helper plugin is available for this computer.'],
  ['无法连接外部 MCP，请检查服务和运行环境','Cannot connect to the external MCP. Check the service and runtime environment.'],
  ['语音模型下载失败，请检查网络后重试','The speech model download failed. Check your network and try again.'],
  ['语音处理超时，识别已停止，请重试','Speech processing timed out and recognition stopped. Try again.'],
  ['此快捷键由浏览器或系统使用','This shortcut is reserved by the browser or system.'],
  ['请使用页码或范围，例如 2-3,10-15','Use page numbers or ranges, for example 2-3,10-15.'],
  ['页码范围超出文档或顺序无效','The page range is outside the document or is in the wrong order.'],
  ['处理器没有返回可保存文件','The processor did not return a file that can be saved.'],
  ['输出扩展名必须与预览格式一致','The output extension must match the preview format.'],
  ['译文未完整覆盖全部编号块，无法保存','The translation does not cover all numbered blocks and cannot be saved.'],
  ['模型没有原样保留代码、公式或资源标记的顺序','The model did not preserve the order of code, formulas or resource markers.'],
  ['Word 可编辑翻译暂不支持按预览页映射正文；请选择全部页面或选区翻译','Editable Word translation cannot map text to preview pages yet. Select all pages or translate a selection.'],
  ['等待处理','Waiting for processing'],
  ['界面仅预览前 120000 字符；保存文件包含完整译文。','Only the first 120,000 characters are previewed. The saved file contains the complete translation.'],
  ['保留 DOCX 图片、表格、字段和原生公式 XML；文字长度变化可能改变分页，请检查保存副本的排版。','DOCX images, tables, fields and native equation XML are preserved. Text length changes may alter pagination; check the saved copy’s layout.'],
 ] as const)('translates a known diagnostic: %s',(message,expected)=>{
  expect(translateDiagnostic(message,'en')).toBe(expected);
 });

 it.each([
  ['第 27 页没有可用图像','No image is available for page 27.'],
  ['第 2 页无文本层，可能为扫描页；没有执行 OCR。','Page 2 has no text layer and may be scanned. OCR was not performed.'],
  ['第 10 页没有可用文本层，未执行 OCR','Page 10 has no usable text layer. OCR was not performed.'],
  ['第 3 页译文较长，已允许续页并完整保留文字，请检查对照分页。','The translation of page 3 is long. Continuation pages retain all text; check the page pairing.'],
  ['已翻译 27 / 56 块','Translated 27 / 56 blocks'],
  ['阅读页码必须处于 1–120 页内，且至少选择一页','Reading pages must be within 1–120, with at least one page selected.'],
  ['模型 API 拒绝请求（HTTP 429）','The model API rejected the request (HTTP 429).'],
  ['无法读取模型列表（HTTP 503）','Cannot load the model list (HTTP 503).'],
  ['能力不可用: documentProcessor/core.中文','Capability unavailable: documentProcessor/core.中文'],
  ['能力重复注册: core.测试','Capability already registered: core.测试'],
  ['请先启用依赖插件: workspace.中文','Enable the required plugin first: workspace.中文'],
  ['插件未声明工具权限: write','The plugin has not declared tool permission: write'],
  ['未知参数: --local-model','Unknown argument: --local-model'],
  ['参数缺少值: --workspace','Missing argument value: --workspace'],
  ['工具名称重复: core.工具','Duplicate tool name: core.工具'],
  ['工具不存在或已停用: core.工具','The tool does not exist or is disabled: core.工具'],
  ['后台程序失败，退出码 -1','The background process failed with exit code -1.'],
 ] as const)('translates a complete known template: %s',(message,expected)=>{
  expect(translateDiagnostic(message,'en')).toBe(expected);
 });

 it('preserves filenames, paths and replacement characters inside diagnostic variables',()=>{
  expect(translateDiagnostic('PPT 备注无法对应源页: ppt/notesSlides/中文 $& {page}.xml','en'))
   .toBe('PPT notes could not be matched to a source slide: ppt/notesSlides/中文 $& {page}.xml');
  expect(translateDiagnostic('文档记忆处理失败：原文/报告 中文 {page} $&.pdf: ENOENT','en'))
   .toBe('Document memory processing failed: 原文/报告 中文 {page} $&.pdf: ENOENT');
 });

 it('translates a recognized nested diagnostic without interpreting unknown details',()=>{
  expect(translateDiagnostic('文档记忆处理失败：PDF 已加密，请先提供解密副本','en'))
   .toBe('Document memory processing failed: This PDF is encrypted. Provide a decrypted copy.');
 });

 it.each([
  '', 'constructor', 'toString', '__proto__',
  '用户自己的中文材料 {page} $&',
  '文件 原文/报告 中文.pdf 的正文未解析，不能声称已读懂内容。',
  '摘录：第 2 页没有可用图像',
  '第 2 页没有可用图像。以下是原文',
  '第 X 页没有可用图像',
  '第 2 页没有可用图像\n',
  '已翻译 2 / 3 块 — 文档内容',
  '模型 API 拒绝请求（HTTP nope）',
 ])('keeps unknown or source-like text exactly: %j',message=>{
  expect(translateDiagnostic(message,'en')).toBe(message);
 });

 it.each([
  '请等待文档解析完成',
  '模型 API 凭据无效或无权限',
  '第 2 页没有可用文本层，未执行 OCR',
  '已翻译 27 / 56 块',
  'PPT 备注无法对应源页: ppt/notesSlides/中文 $& {page}.xml',
  '文档记忆处理失败：PDF 已加密，请先提供解密副本',
 ])('leaves Chinese diagnostics unchanged: %s',message=>{
  expect(translateDiagnostic(message,'zh-CN')).toBe(message);
 });

 it.each([
  ['The model API credentials are invalid or lack permission.','模型 API 凭据无效或无权限'],
  ['This PDF is encrypted. Provide a decrypted copy.','PDF 已加密，请先提供解密副本'],
  ['Wait for document parsing to finish.','请等待文档解析完成'],
 ] as const)('restores a known stored English diagnostic when switching to Chinese: %s',(message,expected)=>{
  expect(translateDiagnostic(message,'zh-CN')).toBe(expected);
 });

 it('does not rewrite unknown English when switching to Chinese',()=>{
  const text='User document text: The model API credentials are invalid or lack permission.';
  expect(translateDiagnostic(text,'zh-CN')).toBe(text);
 });

 it('switches stored local interface errors in either direction',()=>{
  expect(translateDiagnostic('请先新建或恢复主对话。','en')).toBe('Create or restore a main chat first.');
  expect(translateDiagnostic('Create or restore a main chat first.','zh-CN')).toBe('请先新建或恢复主对话。');
  expect(translateDiagnostic('This launch link has expired. Use a new link from the command line.','zh-CN'))
   .toBe('启动链接已失效，请使用命令行提供的新启动链接。');
 });

 it('switches complete local capture diagnostics while retaining unknown details',()=>{
  expect(translateDiagnostic('屏幕捕获未完成：原文/报告 中文.png $& {page}','en'))
   .toBe('Screen capture did not finish: 原文/报告 中文.png $& {page}');
  expect(translateDiagnostic('Screen capture did not finish: 原文/报告 中文.png $& {page}','zh-CN'))
   .toBe('屏幕捕获未完成：原文/报告 中文.png $& {page}');
  expect(translateDiagnostic('文档截图失败：截图超过 10 MiB，请缩小区域','en'))
   .toBe('Document capture failed: The screenshot exceeds 10 MiB. Select a smaller area.');
  expect(translateDiagnostic('Document capture failed: The screenshot exceeds 10 MiB. Select a smaller area.','zh-CN'))
   .toBe('文档截图失败：截图超过 10 MiB，请缩小区域');
 });

 it('retains existing diagnostic translations',()=>{
  expect(translateDiagnostic('请等待文档解析完成','en')).toBe('Wait for document parsing to finish.');
  expect(translateDiagnostic('记忆关联已中断，已完成快照保留，可重试','en'))
   .toBe('Association was interrupted. The completed snapshot is retained; try again.');
 });
});

import {test,expect,openWorkspace} from './fixtures.js';
import {access,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {startServer} from '../../apps/server/src/app.js';

test('keeps all archived chats empty across reload until explicit creation',async({page,host,root})=>{
 await openWorkspace(page,host,root);const sidebar=page.getByRole('complementary',{name:'工作区侧栏'}),main=page.getByRole('region',{name:'主对话',exact:true}),temporary=page.getByRole('region',{name:'临时对话',exact:true});
 await sidebar.getByRole('button',{name:'新建主对话',exact:true}).click();
 await expect(sidebar.getByRole('button',{name:'归档主对话：阅读会话 2',exact:true})).toBeVisible();
 await sidebar.getByRole('button',{name:'归档主对话：阅读会话',exact:true}).click();
 await sidebar.getByRole('button',{name:'归档主对话：阅读会话 2',exact:true}).click();
 await expect(sidebar.getByRole('button',{name:/^归档主对话：/})).toHaveCount(0);
 await expect(main.getByRole('textbox')).toHaveCount(0);await expect(temporary.getByRole('textbox')).toHaveCount(0);
 const workspace=(await host.workspaces.listRecent({callerId:'local-owner',transport:'internal'}))[0]!;
 expect((await host.sessions.list(workspace.id)).filter(session=>session.kind==='main')).toHaveLength(2);
 await page.reload();await expect(main).toBeVisible();await expect(sidebar.getByRole('button',{name:/^归档主对话：/})).toHaveCount(0);await expect(main.getByRole('textbox')).toHaveCount(0);
 expect((await host.sessions.list(workspace.id)).filter(session=>session.kind==='main')).toHaveLength(2);
 await sidebar.getByRole('button',{name:'新建主对话',exact:true}).click();await expect(main.getByRole('textbox',{name:'主对话输入'})).toBeVisible();
 expect((await host.sessions.list(workspace.id)).filter(session=>session.kind==='main')).toHaveLength(3);
});

test('restarts with a deleted remembered workspace without recreating it',async({page,host,root,directory})=>{
 const workspace=await host.workspaces.select(root,{callerId:'local-owner',transport:'internal'});await host.close();await rm(root,{recursive:true,force:true});
 let restarted:Awaited<ReturnType<typeof startServer>>|undefined;
 try{restarted=await startServer({host:'127.0.0.1',port:0,configDir:join(directory,'config'),demo:false,noOpen:true});
  await expect(access(root)).rejects.toMatchObject({code:'ENOENT'});
  await page.addInitScript(id=>localStorage.setItem('reader:last-workspace',id),workspace.id);await page.goto(restarted.bootstrapUrl);
  await expect(page.getByRole('button',{name:'选择工作区',exact:true})).toBeVisible();await expect(page.getByText('上次的工作区目录已不存在或不可访问，请重新选择。',{exact:true})).toBeVisible();
  await expect(access(root)).rejects.toMatchObject({code:'ENOENT'});
 }finally{await restarted?.close();}
});

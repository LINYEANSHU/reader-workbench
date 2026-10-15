import {test,expect,openWorkspace,model} from './fixtures.js';
import {createCanvas} from '@napi-rs/canvas';

for(const {withAttachment,withArtifact,label} of [{withAttachment:false,withArtifact:false,label:'near the bottom of a branch'},{withAttachment:true,withArtifact:false,label:'after delayed screenshot metadata'},{withAttachment:false,withArtifact:true,label:'after delayed artifact data'}])test('restores the exact saved offset '+label,async({page,host,root,modelUrl})=>{
 const workspace=await model(host,root,modelUrl);
 await host.capabilities.retireOwner(workspace.id,'model.test');
 host.capabilities.register(workspace.id,'model','test',{capabilities:{vision:true,tools:withArtifact,contextWindow:64000,maxOutputTokens:512},async *generate(request){if(withArtifact&&request.messages.at(-1)?.role!=='tool')yield{kind:'tool-call',id:'scroll-proof',name:'save_artifact',input:{name:'scroll-proof.md',format:'md',blocks:[{kind:'paragraph',text:'owned scroll test artifact'}],sourceAnchors:[]}};else yield{kind:'delta',text:'保留阅读位置。\n\n'.repeat(100)};yield{kind:'done'};}});
 const main=await host.sessions.createMain(workspace.id,'scroll history'),session=await host.sessions.createTemporary(workspace.id,main.id);
 const actor={callerId:'local-owner',transport:'internal' as const},attachmentIds=[];
 if(withAttachment){const image=createCanvas(100,100);image.getContext('2d').fillRect(0,0,100,100);const attachment=await host.attachments.save({actor,workspaceId:workspace.id,sessionId:session.id},image.toBuffer('image/png'),{width:100,height:100,anchors:[],captureKind:'screen'});attachmentIds.push(attachment.id);}
 const run=await host.runs.submit({workspaceId:workspace.id,sessionId:session.id,question:'保留位置',documents:[],attachmentIds,providerId:'test',requestId:'scroll-history',allowArtifactWrites:withArtifact},actor);
 await expect.poll(async()=>(await host.runs.get(workspace.id,run.runId)).status).toBe('completed');
 await openWorkspace(page,host,root);
 const pane=page.getByRole('region',{name:'临时对话',exact:true});
 await expect(pane).toHaveAttribute('data-session-id',session.id);
 await expect(pane.locator('.assistant-message')).toContainText('保留阅读位置');
 if(withAttachment)await expect(pane.getByRole('img',{name:'对话截图'})).toHaveJSProperty('naturalWidth',100);
 if(withArtifact)await expect(pane.locator('.artifact-list')).toBeVisible();
 const saved=await pane.locator('.pane-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight-node.clientHeight-20;return node.scrollTop;});
 expect(saved).toBeGreaterThan(0);
 await pane.getByRole('button',{name:'新建临时分支'}).click();
 await expect(pane).not.toHaveAttribute('data-session-id',session.id);
 let release!:()=>void,pending=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 if(withAttachment)await page.route('**/api/v1/attachments/*?**',async route=>{if(new URL(route.request().url()).searchParams.get('metadata')!=='true'){await route.continue();return;}pending++;try{const response=await route.fetch();await gate;await route.fulfill({response});}finally{pending--;}});
 if(withArtifact)await page.route('**/api/v1/artifacts?**',async route=>{pending++;try{const response=await route.fetch();await gate;await route.fulfill({response});}finally{pending--;}});
 try{
  await pane.getByRole('combobox',{name:'临时分支'}).selectOption(session.id);
  if(withAttachment){await expect.poll(()=>pending).toBeGreaterThan(0);await expect(pane.locator('.assistant-message')).toHaveCount(0);release();await expect(pane.getByRole('img',{name:'对话截图'})).toHaveJSProperty('naturalWidth',100);}
  if(withArtifact){await expect.poll(()=>pending).toBeGreaterThan(0);await expect(pane.locator('.assistant-message')).toHaveCount(0);release();await expect(pane.locator('.artifact-list')).toBeVisible();}
  await expect(pane.locator('.assistant-message')).toContainText('保留阅读位置');
  await expect.poll(()=>pane.locator('.pane-scroll').evaluate(node=>node.scrollTop)).toBe(saved);
 }finally{release();}
});

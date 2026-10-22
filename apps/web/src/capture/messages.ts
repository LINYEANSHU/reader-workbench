import {t,localizeMessage} from '../i18n/index.js';

// Match both languages so an existing capture error follows a later locale change.
const messages=[
 ["截图来源已关闭或改变，请重新框选","The screenshot source has closed or changed. Select it again."],
 ["当前文档不可截图","The current document cannot be captured"],
 ["请选择文档栏内的可见区域","Select a visible area within the document pane"],
 ["此文档暂不能直接捕获，请使用屏幕截图","This document cannot be captured directly. Use screen capture."],
 ["外部图片不允许捕获，请使用屏幕截图","External images cannot be captured. Use screen capture."],
 ["图片加载失败，不能将空白区域保存为截图","An image failed to load. The blank area cannot be saved as a screenshot."],
 ["框选区域没有可引用的文档内容","The selected area contains no document content to reference"],
 ["文档截图失败：","Document capture failed: "],
 ["图片资源不可捕获","The image resource cannot be captured"],
 ["框选区域没有文档页面","The selected area contains no document pages"],
 ["屏幕视频未提供新画面，请重试","The screen stream did not provide a new frame. Try again."],
 ["浏览器不支持屏幕捕获，请在 localhost 或 HTTPS 使用此功能","Screen capture is unavailable. Open the app on localhost or HTTPS."],
 ["框选区域太小或坐标无效","The selected area is too small or has invalid coordinates"],
 ["截图超过尺寸上限，请缩小区域","The screenshot exceeds the size limit. Select a smaller area."],
 ["截图无法编码","The screenshot could not be encoded"],
 ["图片资源不允许捕获，请使用屏幕截图入口","The image resource cannot be captured. Use screen capture."],
 ["截图超过 10 MiB，请缩小区域","The screenshot exceeds 10 MiB. Select a smaller area."],
 ["页面或图片仍未加载，暂时无法截图","The page or image is still loading. Try capturing it again shortly."],
 ["请先打开可截图的文档","Open a document before capturing a screenshot"],
 ["屏幕捕获未完成：","Screen capture did not finish: "],
 ["屏幕图像还未加载","The screen image has not loaded yet"]
] as const;
export function localizeCaptureMessage(text:string):string{
 const pair=messages.find(([zh,en])=>text===zh||text===en);
 if(pair)return t(pair[0],pair[1]);
 for(const [zh,en] of messages.filter(([zh])=>zh.endsWith('：'))){
  const prefix=text.startsWith(zh)?zh:text.startsWith(en)?en:undefined;
  if(prefix)return t(zh,en)+localizeCaptureMessage(text.slice(prefix.length));
 }
 return localizeMessage(text);
}
